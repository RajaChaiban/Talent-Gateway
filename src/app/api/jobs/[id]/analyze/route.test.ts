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
const resumeRoute = await import("../../../resumes/[id]/analyze/route");

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
/** A browser sends Sec-Fetch-Site on every request; same-origin unless a test says otherwise. */
const SAME_ORIGIN = { "sec-fetch-site": "same-origin" };
const analyzeJob = (id: string, site: Record<string, string> = SAME_ORIGIN) =>
  route.POST(
    new Request(`http://localhost/api/jobs/${id}/analyze`, { method: "POST", headers: site }),
    ctx(id),
  );
const analyzeResume = (id: string) =>
  resumeRoute.POST(
    new Request(`http://localhost/api/resumes/${id}/analyze`, {
      method: "POST",
      headers: SAME_ORIGIN,
    }),
    ctx(id),
  );

let job: Row;
const jobStatus = () => db.rows("jobs")[0].status;

beforeEach(() => {
  db = new FakeDb();
  model = new ScreeningModel();
  job = seedJob(db);
  getUser.mockReset();
  getUser.mockResolvedValue(SIGNED_IN);
});

describe("POST /api/jobs/[id]/analyze", () => {
  it("sets maxDuration", () => {
    expect(route.maxDuration).toBe(30);
  });

  it("returns the resumes that need work, oldest first, and sets the job ANALYZING", async () => {
    const first = seedResume(db, job.id as string);
    seedResume(db, job.id as string, { extracted_text: null, status: "pending" });
    const rejected = seedResume(db, job.id as string, {
      extracted_text: NOT_READY_TEXT,
      ats_status: "NOT_ATS_READY",
    });
    const overridden = seedResume(db, job.id as string, {
      extracted_text: NOT_READY_TEXT,
      ats_status: "NOT_ATS_READY",
      ats_override: true,
    });
    seedResume(db, crypto.randomUUID());

    const response = await analyzeJob(job.id as string);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { resume_ids: [first.id, overridden.id] },
    });
    expect(jobStatus()).toBe("ANALYZING");
    expect(rejected.id).toBeDefined();
    expect(model.count()).toBe(0);
  });

  it("returns the same set when called twice and starts nothing itself", async () => {
    seedResume(db, job.id as string);
    seedResume(db, job.id as string);
    const first = await (await analyzeJob(job.id as string)).json();
    const second = await (await analyzeJob(job.id as string)).json();
    expect(second).toEqual(first);
    expect(model.count()).toBe(0);
    expect(db.rows("candidates")).toHaveLength(0);
  });

  it("after everything is analyzed, returns nothing, sets DONE, and re-running makes no model call or row", async () => {
    const ready = seedResume(db, job.id as string);
    const notReady = seedResume(db, job.id as string, { extracted_text: NOT_READY_TEXT });
    const { data } = await (await analyzeJob(job.id as string)).json();
    for (const id of data.resume_ids) await analyzeResume(id);
    expect(ready.id).toBeDefined();
    expect(notReady.id).toBeDefined();
    const calls = model.count();
    const candidates = db.rows("candidates").length;

    const again = await (await analyzeJob(job.id as string)).json();
    expect(again).toEqual({ data: { resume_ids: [] } });
    expect(jobStatus()).toBe("DONE");
    expect(model.count()).toBe(calls);
    expect(db.rows("candidates")).toHaveLength(candidates);
  });

  it("includes a resume whose analysis failed, so it can be retried", async () => {
    const failed = seedResume(db, job.id as string, { status: "failed", ats_status: "ATS_READY" });
    const { data } = await (await analyzeJob(job.id as string)).json();
    expect(data.resume_ids).toEqual([failed.id]);
  });

  it.each([1, 5])(
    "puts %i earlier analysis failure(s) back to extracted, so the run does not settle early",
    async (count) => {
      (db.rows("jobs")[0] as Row).status = "ERROR";
      const failed = Array.from({ length: count }, () =>
        seedResume(db, job.id as string, { status: "failed", ats_status: "ATS_READY" }),
      );
      const upload = seedResume(db, job.id as string, { status: "failed", extracted_text: null });

      const { data } = await (await analyzeJob(job.id as string)).json();
      expect(data.resume_ids).toEqual(failed.map((resume) => resume.id));
      expect(jobStatus()).toBe("ANALYZING");
      for (const resume of failed) {
        expect(db.rows("resumes").find((row) => row.id === resume.id)?.status).toBe("extracted");
      }
      expect(db.rows("resumes").find((row) => row.id === upload.id)?.status).toBe("failed");

      await analyzeResume(failed[0].id as string);
      expect(jobStatus()).toBe(count === 1 ? "DONE" : "ANALYZING");
      for (const resume of failed.slice(1)) await analyzeResume(resume.id as string);
      expect(jobStatus()).toBe("DONE");
    },
  );

  it("leaves out a scored resume whatever the invite bar, and re-analyzing it makes no model call", async () => {
    (db.rows("jobs")[0] as Row).invite_threshold = 90;
    const resume = seedResume(db, job.id as string);
    await analyzeResume(resume.id as string);
    const calls = model.count();

    (db.rows("jobs")[0] as Row).invite_threshold = 80;
    const { data } = await (await analyzeJob(job.id as string)).json();
    expect(data.resume_ids).toEqual([]);
    await analyzeResume(resume.id as string);
    expect(model.count()).toBe(calls);
    expect(db.rows("candidates")).toHaveLength(1);
    expect(db.rows("candidates")[0].invite_status).toBe("NONE");
  });

  it("the per-resume route settles the job when the last resume finishes, with no progress call", async () => {
    const first = seedResume(db, job.id as string);
    const second = seedResume(db, job.id as string, { extracted_text: NOT_READY_TEXT });
    await analyzeJob(job.id as string);
    await analyzeResume(first.id as string);
    expect(jobStatus()).toBe("ANALYZING");
    await analyzeResume(second.id as string);
    expect(jobStatus()).toBe("DONE");
  });

  it("the per-resume route settles to ERROR when every resume failed", async () => {
    model.score = () => {
      throw new Error("provider down");
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const only = seedResume(db, job.id as string);
    await analyzeJob(job.id as string);
    const { data } = await (await analyzeResume(only.id as string)).json();
    expect(data.status).toBe("failed");
    expect(jobStatus()).toBe("ERROR");
  });

  it("sets an empty job straight to DONE", async () => {
    const response = await analyzeJob(job.id as string);
    await expect(response.json()).resolves.toEqual({ data: { resume_ids: [] } });
    expect(jobStatus()).toBe("DONE");
  });

  it.each<Record<string, string>>([
    { "sec-fetch-site": "cross-site", origin: "https://evil.example" },
    { "sec-fetch-site": "same-site" },
    { "sec-fetch-site": "none" },
    { origin: "https://evil.example" },
    {},
  ])("refuses a request %o not sent by a page of this app with 403 and changes nothing", async (site) => {
    seedResume(db, job.id as string);
    const response = await analyzeJob(job.id as string, site);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "forbidden" } });
    expect(db.calls).toEqual([]);
    expect(jobStatus()).toBe("CREATED");
    expect(model.count()).toBe(0);
  });

  it("answers 401 before 403 for a signed-out cross-site request", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    const response = await analyzeJob(job.id as string, { "sec-fetch-site": "cross-site" });
    expect(response.status).toBe(401);
    expect(db.calls).toEqual([]);
  });

  it("returns 404 for an unknown job and 400 for a malformed id", async () => {
    expect((await analyzeJob(crypto.randomUUID())).status).toBe(404);
    expect((await analyzeJob("bad")).status).toBe(400);
  });

  it("returns 401 and changes nothing when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    expect((await analyzeJob(job.id as string)).status).toBe(401);
    expect(db.calls).toEqual([]);
  });

  it("returns 500 when the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.failWhen = (call) => (call.op === "update" ? "08006" : null);
    expect((await analyzeJob(job.id as string)).status).toBe(500);
  });
});
