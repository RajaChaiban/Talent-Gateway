import { AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb, type Row } from "../../../../../../test/fake-supabase";
import { SIGNED_IN } from "../../../../../../test/supabase-mock";
import { seedJob, seedResume } from "../../../../../../test/screening-harness";

const getUser = vi.fn();
let db: FakeDb;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from: (table: string) => db.from(table) }),
}));

const route = await import("./route");

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const progress = (id: string) =>
  route.GET(new Request(`http://localhost/api/jobs/${id}/progress`), ctx(id));

let job: Row;
const jobStatus = () => db.rows("jobs")[0].status;

function candidateFor(resume: Row) {
  db.insertRow("candidates", {
    job_id: resume.job_id,
    resume_id: resume.id,
    full_name: "A",
    match_score: 80,
    match_summary: "s",
  });
}

beforeEach(() => {
  db = new FakeDb();
  job = seedJob(db, { status: "ANALYZING" });
  getUser.mockReset();
  getUser.mockResolvedValue(SIGNED_IN);
});

describe("GET /api/jobs/[id]/progress", () => {
  it("sets maxDuration", () => {
    expect(route.maxDuration).toBe(30);
  });

  it("counts from the rows and leaves a job with work remaining ANALYZING", async () => {
    const scored = seedResume(db, job.id as string, { ats_status: "ATS_READY" });
    candidateFor(scored);
    seedResume(db, job.id as string, { ats_status: "NOT_ATS_READY" });
    seedResume(db, job.id as string, { ats_status: "ATS_READY", status: "failed" });
    seedResume(db, job.id as string);
    seedResume(db, job.id as string, { extracted_text: null, status: "pending" });

    const response = await progress(job.id as string);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        total: 5,
        extracted: 4,
        ats_failed: 1,
        scored: 1,
        failed: 1,
        remaining: 1,
        status: "ANALYZING",
      },
    });
    expect(jobStatus()).toBe("ANALYZING");
  });

  it("sets DONE when nothing remains, with failures among the resumes", async () => {
    const scored = seedResume(db, job.id as string, { ats_status: "ATS_READY" });
    candidateFor(scored);
    seedResume(db, job.id as string, { ats_status: "ATS_READY", status: "failed" });
    const { data } = await (await progress(job.id as string)).json();
    expect(data).toMatchObject({ remaining: 0, failed: 1, status: "DONE" });
    expect(jobStatus()).toBe("DONE");
  });

  it("sets ERROR when every resume failed", async () => {
    seedResume(db, job.id as string, { ats_status: "ATS_READY", status: "failed" });
    seedResume(db, job.id as string, { ats_status: "ATS_READY", status: "failed" });
    const { data } = await (await progress(job.id as string)).json();
    expect(data.status).toBe("ERROR");
    expect(jobStatus()).toBe("ERROR");
  });

  it("does not move a job that is not ANALYZING", async () => {
    (db.rows("jobs")[0] as Row).status = "CREATED";
    const { data } = await (await progress(job.id as string)).json();
    expect(data.status).toBe("CREATED");
    expect(db.calls.some((call) => call.op === "update")).toBe(false);
  });

  it("returns 404, 400 and 401 as the other routes do", async () => {
    expect((await progress(crypto.randomUUID())).status).toBe(404);
    expect((await progress("bad")).status).toBe(400);
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    expect((await progress(job.id as string)).status).toBe(401);
  });

  it("returns 500 when the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.failWhen = (call) => (call.table === "candidates" ? "08006" : null);
    expect((await progress(job.id as string)).status).toBe(500);
  });
});
