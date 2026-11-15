import { APICallError } from "ai";
import { AuthSessionMissingError } from "@supabase/supabase-js";
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

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
/** A browser sends Sec-Fetch-Site on every request; same-origin unless a test says otherwise. */
const SAME_ORIGIN = { "sec-fetch-site": "same-origin" };
const post = (id: string, site: Record<string, string> = SAME_ORIGIN) =>
  route.POST(
    new Request(`http://localhost/api/resumes/${id}/score-anyway`, {
      method: "POST",
      headers: site,
    }),
    ctx(id),
  );

let job: Row;
/** A resume the ATS check has already set aside. */
const setAside = (over: Row = {}) =>
  seedResume(db, job.id as string, {
    extracted_text: NOT_READY_TEXT,
    ats_status: "NOT_ATS_READY",
    ats_score: 22,
    ats_reasons: ["Too little text"],
    ...over,
  });

beforeEach(() => {
  db = new FakeDb();
  model = new ScreeningModel();
  job = seedJob(db, { status: "DONE" });
  getUser.mockReset();
  getUser.mockResolvedValue(SIGNED_IN);
});

describe("POST /api/resumes/[id]/score-anyway", () => {
  it("sets maxDuration", () => {
    expect(route.maxDuration).toBe(60);
  });

  it("overrides the gate of a set-aside resume, scores it and settles the job back to DONE", async () => {
    const resume = setAside();
    const statuses: unknown[] = [];
    model.onCall = () => statuses.push(db.rows("jobs")[0].status);
    const response = await post(resume.id as string);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { resume_id: resume.id, ats_override: true, status: "scored" },
    });
    expect(db.rows("resumes")[0]).toMatchObject({ ats_override: true, ats_status: "NOT_ATS_READY" });
    expect(model.count()).toBe(2);
    expect(statuses).toEqual(["ANALYZING", "ANALYZING"]);
    expect(db.rows("candidates")).toHaveLength(1);
    expect(db.rows("jobs")[0].status).toBe("DONE");
  });

  it.each([
    ["not checked yet", { ats_status: null }],
    ["ATS-ready", { ats_status: "ATS_READY" }],
  ])("returns 409 for a resume that was not set aside (%s), with no write and no model call", async (_, over) => {
    const resume = seedResume(db, job.id as string, over);
    const response = await post(resume.id as string);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: { code: "conflict", message: "This resume was not set aside." },
    });
    expect(model.count()).toBe(0);
    expect(db.calls.filter((call) => call.op !== "select")).toEqual([]);
    expect(db.rows("resumes")[0].ats_override).toBe(false);
  });

  it("returns 409 already scored when the resume has a candidate, with no model call", async () => {
    const resume = setAside();
    await post(resume.id as string);
    const calls = model.count();
    const response = await post(resume.id as string);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: { code: "conflict", message: "This resume has already been scored." },
    });
    expect(model.count()).toBe(calls);
  });

  it("returns a retryable 503 when the gateway rate-limits", async () => {
    model.score = () => {
      throw new APICallError({
        message: "slow down",
        url: "https://ai-gateway.vercel.sh",
        requestBodyValues: {},
        statusCode: 429,
        responseHeaders: { "retry-after": "2" },
        isRetryable: false,
      });
    };
    const resume = setAside();
    const response = await post(resume.id as string);
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("2");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "model_busy" } });
    expect(db.rows("candidates")).toHaveLength(0);
  });

  it.each<Record<string, string>>([
    { "sec-fetch-site": "cross-site", origin: "https://evil.example" },
    { "sec-fetch-site": "same-site" },
    { "sec-fetch-site": "none" },
    { origin: "https://evil.example" },
    {},
  ])("refuses a request %o not sent by a page of this app with 403 and changes nothing", async (site) => {
    const resume = setAside();
    const response = await post(resume.id as string, site);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "forbidden" } });
    expect(db.calls).toEqual([]);
    expect(db.rows("resumes")[0].ats_override).toBe(false);
    expect(model.count()).toBe(0);
  });

  it("answers 401 before 403 for a signed-out cross-site request", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    const resume = setAside();
    const response = await post(resume.id as string, { "sec-fetch-site": "cross-site" });
    expect(response.status).toBe(401);
    expect(db.calls).toEqual([]);
    expect(model.count()).toBe(0);
  });

  it("returns 404 for an unknown resume", async () => {
    expect((await post(crypto.randomUUID())).status).toBe(404);
  });

  it("returns 400 for a malformed id", async () => {
    expect((await post("x")).status).toBe(400);
    expect(db.calls).toEqual([]);
  });

  it("returns 401 and changes nothing when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    const resume = setAside();
    expect((await post(resume.id as string)).status).toBe(401);
    expect(db.calls).toEqual([]);
    expect(db.rows("resumes")[0].ats_override).toBe(false);
  });

  it("returns 500 when the database fails", async () => {
    db.failWhen = () => "08006";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await post(crypto.randomUUID())).status).toBe(500);
  });
});
