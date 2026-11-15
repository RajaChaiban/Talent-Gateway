import { AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  failed,
  ok,
  queryBuilder,
  SIGNED_IN,
  storageMock,
} from "../../../../../../test/supabase-mock";

const getUser = vi.fn();
const from = vi.fn();
const { storage, bucket } = storageMock();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from, storage }),
}));

const route = await import("./route");
const { GET } = route;

const ID = "5c1d1f0e-0a9e-4b8e-9d0b-2f6f2f6a8b11";
const JOB = "0b4d8f3e-6f0a-4c52-8d57-3a1f9b2c7e10";
const stored = {
  id: ID,
  job_id: JOB,
  storage_path: `${JOB}/${ID}/cv.pdf`,
  file_name: "Priya Natarajan CV.pdf",
  status: "extracted",
  extracted_text: "text",
};
const SIGNED_URL = "https://storage.example/object/sign/resumes/cv.pdf?token=t&download=cv.pdf";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const call = (id = ID, headers: Record<string, string> = {}) =>
  GET(new Request(`http://localhost/api/resumes/${id}/file`, { headers }), ctx(id));

function mockTables(resume: unknown) {
  from.mockReturnValue(queryBuilder(ok(resume)));
}

const signedOut = { data: { user: null }, error: new AuthSessionMissingError() };
const authDown = { data: { user: null }, error: new AuthRetryableFetchError("down", 0) };

beforeEach(() => {
  getUser.mockReset();
  from.mockReset();
  storage.from.mockClear();
  bucket.createSignedUrl.mockReset();
  bucket.createSignedUrl.mockResolvedValue(ok({ signedUrl: SIGNED_URL }));
  getUser.mockResolvedValue(SIGNED_IN);
  mockTables(stored);
});

describe("GET /api/resumes/[id]/file", () => {
  it("redirects to a 60-second signed link that saves the file under its original name", async () => {
    const response = await call();

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(SIGNED_URL);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(storage.from).toHaveBeenCalledWith("resumes");
    expect(bucket.createSignedUrl).toHaveBeenCalledWith(stored.storage_path, 60, {
      download: stored.file_name,
    });
  });

  it("sets a maxDuration", () => {
    expect(route.maxDuration).toBe(30);
  });

  it("needs no same-origin headers, because it only reads", async () => {
    expect((await call(ID, { "sec-fetch-site": "cross-site" })).status).toBe(303);
  });

  it("returns 401 with no database or storage call when signed out", async () => {
    getUser.mockResolvedValue(signedOut);
    const response = await call();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "unauthorized" } });
    expect(from).not.toHaveBeenCalled();
    expect(storage.from).not.toHaveBeenCalled();
  });

  it("returns 503 with no database or storage call when auth is down", async () => {
    getUser.mockResolvedValue(authDown);
    expect((await call()).status).toBe(503);
    expect(from).not.toHaveBeenCalled();
    expect(storage.from).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed id without a call", async () => {
    const response = await call("nope");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "invalid_input" } });
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown resume, or one the recruiter cannot see, without signing", async () => {
    mockTables(null);
    const response = await call();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "not_found" } });
    expect(bucket.createSignedUrl).not.toHaveBeenCalled();
  });

  it("returns 500 when the database fails", async () => {
    from.mockReturnValue(queryBuilder(failed));
    expect((await call()).status).toBe(500);
  });
});

describe("GET /api/resumes/[id]/file storage errors", () => {
  it("returns 404 when the stored object is missing", async () => {
    bucket.createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "Object not found", status: 404, statusCode: "404" },
    });
    const response = await call();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "not_found" } });
  });

  it("returns 500 when the bucket is missing, a configuration fault", async () => {
    bucket.createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "Bucket not found", status: 404, statusCode: "404" },
    });
    expect((await call()).status).toBe(500);
  });

  it("returns 503 with Retry-After when storage is unavailable", async () => {
    bucket.createSignedUrl.mockResolvedValue({ data: null, error: { message: "unavailable", status: 503 } });
    const response = await call();
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("2");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "storage_unavailable" } });
  });
});
