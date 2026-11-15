import { AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  failed,
  ok,
  queryBuilder,
  SIGNED_IN,
  storageMock,
} from "../../../../../test/supabase-mock";

const getUser = vi.fn();
const from = vi.fn();
const { storage, bucket } = storageMock();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from, storage }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const route = await import("./route");
const { DELETE } = route;

const ID = "5c1d1f0e-0a9e-4b8e-9d0b-2f6f2f6a8b11";
const JOB = "0b4d8f3e-6f0a-4c52-8d57-3a1f9b2c7e10";
const stored = { id: ID, job_id: JOB, storage_path: `${JOB}/${ID}/cv.pdf` };

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
/** What a browser on this site sends with a state-changing request. */
const SAME_ORIGIN = { "sec-fetch-site": "same-origin" };
const call = (id = ID, headers: Record<string, string> = SAME_ORIGIN) =>
  DELETE(new Request(`http://localhost/api/resumes/${id}`, { method: "DELETE", headers }), ctx(id));

let resumes: ReturnType<typeof queryBuilder>;

function mockTables(resume: unknown) {
  resumes = queryBuilder(ok(resume));
  from.mockReturnValue(resumes);
}

const signedOut = { data: { user: null }, error: new AuthSessionMissingError() };
const authDown = { data: { user: null }, error: new AuthRetryableFetchError("down", 0) };

beforeEach(() => {
  getUser.mockReset();
  from.mockReset();
  storage.from.mockClear();
  bucket.remove.mockReset();
  bucket.remove.mockResolvedValue(ok([]));
  getUser.mockResolvedValue(SIGNED_IN);
  mockTables(stored);
});

describe("DELETE /api/resumes/[id]", () => {
  it("removes the stored file and the row", async () => {
    const response = await call();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { resume_id: ID, removed: true } });
    expect(bucket.remove).toHaveBeenCalledWith([stored.storage_path]);
    expect(resumes.delete).toHaveBeenCalled();
    expect(resumes.eq).toHaveBeenCalledWith("id", ID);
  });

  it("sets a maxDuration", () => {
    expect(route.maxDuration).toBe(30);
  });

  it.each<[Record<string, string>]>([
    [{ "sec-fetch-site": "cross-site" }],
    [{ "sec-fetch-site": "same-site" }],
    [{ "sec-fetch-site": "none" }],
    [{ origin: "https://evil.example" }],
    [{}],
  ])("returns 403 forbidden for a cross-site request %j and removes nothing", async (headers) => {
    const response = await call(ID, headers);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "forbidden" } });
    expect(from).not.toHaveBeenCalled();
    expect(storage.from).not.toHaveBeenCalled();
  });

  it("accepts this site's own Origin when the browser sends no Sec-Fetch-Site", async () => {
    expect((await call(ID, { origin: "http://localhost" })).status).toBe(200);
  });

  it("checks sign-in before the origin", async () => {
    getUser.mockResolvedValue(signedOut);
    expect((await call(ID, { "sec-fetch-site": "cross-site" })).status).toBe(401);
  });

  it("returns 404 for an unknown resume", async () => {
    mockTables(null);
    expect((await call()).status).toBe(404);
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed id without a call", async () => {
    expect((await call("nope")).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("keeps the row when the file cannot be removed", async () => {
    bucket.remove.mockResolvedValue({ data: null, error: { message: "no", status: 400 } });
    expect((await call()).status).toBe(500);
    expect(resumes.delete).not.toHaveBeenCalled();
  });

  it("returns 500 when the database fails", async () => {
    from.mockReturnValue(queryBuilder(failed));
    expect((await call()).status).toBe(500);
  });

  it("returns 401 with no database or storage call when signed out", async () => {
    getUser.mockResolvedValue(signedOut);
    expect((await call()).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
    expect(storage.from).not.toHaveBeenCalled();
  });

  it("returns 503 with no database or storage call when auth is down", async () => {
    getUser.mockResolvedValue(authDown);
    expect((await call()).status).toBe(503);
    expect(from).not.toHaveBeenCalled();
    expect(storage.from).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/resumes/[id] storage errors", () => {
  it("answers 503 and keeps the row when storage is unavailable", async () => {
    bucket.remove.mockResolvedValue({ data: null, error: { message: "unavailable", status: 503 } });
    const response = await call();
    expect(response.status).toBe(503);
    expect(resumes.delete).not.toHaveBeenCalled();
  });
});
