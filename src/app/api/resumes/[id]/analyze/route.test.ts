import { APICallError } from "ai";
import { AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb, type Row } from "../../../../../../test/fake-supabase";
import { SIGNED_IN } from "../../../../../../test/supabase-mock";
import {
  NOT_READY_TEXT,
  ScreeningModel,
  seedJob,
  seedResume,
} from "../../../../../../test/screening-harness";

const getUser = vi.fn();
let db: FakeDb;
let model: ScreeningModel;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from: (table: string) => db.from(table) }),
}));
vi.mock("@/lib/ai/model", () => ({ resolveModel: async () => model.model }));

const route = await import("./route");
const { POST } = route;

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
/** A browser sends Sec-Fetch-Site on every request; same-origin unless a test says otherwise. */
const SAME_ORIGIN = { "sec-fetch-site": "same-origin" };
const post = (id: string, site: Record<string, string> = SAME_ORIGIN) =>
  POST(
    new Request(`http://localhost/api/resumes/${id}/analyze`, { method: "POST", headers: site }),
    ctx(id),
  );

let job: Row;
vi.spyOn(console, "error").mockImplementation(() => undefined);

beforeEach(() => {
  db = new FakeDb();
  model = new ScreeningModel();
  job = seedJob(db);
  getUser.mockReset();
  getUser.mockResolvedValue(SIGNED_IN);
});

describe("POST /api/resumes/[id]/analyze", () => {
  it("sets a sensible maxDuration, longer than one model call's budget", () => {
    expect(route.maxDuration).toBe(60);
  });

  it("returns 200 scored and saves one candidate", async () => {
    const resume = seedResume(db, job.id as string);
    const response = await post(resume.id as string);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { resume_id: resume.id, status: "scored" },
    });
    expect(db.rows("candidates")).toHaveLength(1);
  });

  it("returns ats_failed with zero model calls for a not-ready resume", async () => {
    const resume = seedResume(db, job.id as string, { extracted_text: NOT_READY_TEXT });
    const response = await post(resume.id as string);
    await expect(response.json()).resolves.toEqual({
      data: { resume_id: resume.id, status: "ats_failed" },
    });
    expect(model.count()).toBe(0);
  });

  it("returns not_extracted for a resume with no text", async () => {
    const resume = seedResume(db, job.id as string, { extracted_text: null, status: "pending" });
    const { data } = await (await post(resume.id as string)).json();
    expect(data.status).toBe("not_extracted");
  });

  it("returns failed (200) when the model fails, so the queue moves on", async () => {
    model.score = () => {
      throw new Error("provider down");
    };
    const resume = seedResume(db, job.id as string);
    const response = await post(resume.id as string);
    expect(response.status).toBe(200);
    expect((await response.json()).data.status).toBe("failed");
  });

  it("is idempotent: a second call returns scored without a model call", async () => {
    const resume = seedResume(db, job.id as string);
    await post(resume.id as string);
    const calls = model.count();
    const { data } = await (await post(resume.id as string)).json();
    expect(data.status).toBe("scored");
    expect(model.count()).toBe(calls);
    expect(db.rows("candidates")).toHaveLength(1);
  });

  it("two simultaneous calls produce one candidate", async () => {
    model.delayMs = 15;
    const resume = seedResume(db, job.id as string);
    const responses = await Promise.all([post(resume.id as string), post(resume.id as string)]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(db.rows("candidates")).toHaveLength(1);
  });

  it("returns a retryable 503 with Retry-After when the gateway rate-limits", async () => {
    model.score = () => {
      throw new APICallError({
        message: "slow down",
        url: "https://ai-gateway.vercel.sh",
        requestBodyValues: {},
        statusCode: 429,
        responseHeaders: { "retry-after": "3" },
        isRetryable: false,
      });
    };
    const resume = seedResume(db, job.id as string);
    const response = await post(resume.id as string);
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "model_busy" } });
    expect(db.rows("resumes")[0].status).toBe("extracted");
  });

  it.each<Record<string, string>>([
    { "sec-fetch-site": "cross-site", origin: "https://evil.example" },
    { "sec-fetch-site": "same-site" },
    { "sec-fetch-site": "none" },
    { origin: "https://evil.example" },
    {},
  ])("refuses a request %o not sent by a page of this app with 403, with no database or model call", async (site) => {
    const resume = seedResume(db, job.id as string);
    const response = await post(resume.id as string, site);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "forbidden" } });
    expect(db.calls).toEqual([]);
    expect(model.count()).toBe(0);
  });

  it("answers 401 before 403 for a signed-out cross-site request", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    const resume = seedResume(db, job.id as string);
    const response = await post(resume.id as string, { "sec-fetch-site": "cross-site" });
    expect(response.status).toBe(401);
    expect(db.calls).toEqual([]);
    expect(model.count()).toBe(0);
  });

  it("accepts a request without Sec-Fetch-Site whose Origin is the app's own", async () => {
    const resume = seedResume(db, job.id as string);
    const response = await post(resume.id as string, { origin: "http://localhost" });
    expect(response.status).toBe(200);
  });

  it("returns 400 for a malformed id without touching the database", async () => {
    const response = await post("nope");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "invalid_input" } });
    expect(db.calls).toEqual([]);
  });

  it("returns 404 for an unknown resume", async () => {
    const response = await post(crypto.randomUUID());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "not_found" } });
  });

  it("returns 500 when the database fails", async () => {
    const resume = seedResume(db, job.id as string);
    db.failWhen = () => "08006";
    const response = await post(resume.id as string);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "server_error" } });
  });

  it("returns 401 and runs nothing when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    const resume = seedResume(db, job.id as string);
    expect((await post(resume.id as string)).status).toBe(401);
    expect(db.calls).toEqual([]);
    expect(model.count()).toBe(0);
  });

  it("returns 503 auth_unavailable and runs nothing when auth is down", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError("down", 0) });
    const resume = seedResume(db, job.id as string);
    const response = await post(resume.id as string);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "auth_unavailable" } });
    expect(db.calls).toEqual([]);
  });
});
