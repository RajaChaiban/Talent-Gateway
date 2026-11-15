import { APICallError } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelBusyError } from "@/lib/ai/errors";
import { FakeDb, type Row } from "../../../test/fake-supabase";
import { messageText, SCORE_ANSWER, SCORE_TOTAL, scoreAnswer } from "../../../test/mock-model";
import {
  NOT_READY_TEXT,
  READY_TEXT,
  ScreeningModel,
  seedJob,
  seedResume,
} from "../../../test/screening-harness";

let model: ScreeningModel;
vi.mock("@/lib/ai/model", () => ({ resolveModel: async () => model.model }));

const { analyzeResume } = await import("./analyze");

let db: FakeDb;
let job: Row;
const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

beforeEach(() => {
  model = new ScreeningModel();
  db = new FakeDb();
  job = seedJob(db);
  errorLog.mockClear();
});

afterEach(() => {
  db.failWhen = null;
});

const analyze = (id: string) => analyzeResume(db as never, id).then((result) => result?.status ?? null);
const resumeRow = (id: string) => db.rows("resumes").find((row) => row.id === id) as Row;

describe("analyzeResume statuses", () => {
  it("returns null for an unknown resume, with no model call", async () => {
    await expect(analyze(crypto.randomUUID())).resolves.toBeNull();
    expect(model.count()).toBe(0);
  });

  it("is not_extracted when there is no text, and writes nothing", async () => {
    const resume = seedResume(db, job.id as string, { status: "pending", extracted_text: null });
    await expect(analyze(resume.id as string)).resolves.toBe("not_extracted");
    expect(resumeRow(resume.id as string).ats_status).toBeNull();
    expect(db.calls.filter((call) => call.op !== "select")).toEqual([]);
    expect(model.count()).toBe(0);
  });

  it("is ats_failed for a NOT_ATS_READY resume, saves the ATS result and makes zero model calls", async () => {
    const resume = seedResume(db, job.id as string, { extracted_text: NOT_READY_TEXT });
    await expect(analyze(resume.id as string)).resolves.toBe("ats_failed");
    const row = resumeRow(resume.id as string);
    expect(row.ats_status).toBe("NOT_ATS_READY");
    expect(row.ats_score).toEqual(expect.any(Number));
    expect((row.ats_reasons as string[]).length).toBeGreaterThan(0);
    expect(model.count()).toBe(0);
    expect(db.rows("candidates")).toHaveLength(0);
  });

  it("calls the model for the same resume once the recruiter overrides the gate", async () => {
    const resume = seedResume(db, job.id as string, {
      extracted_text: NOT_READY_TEXT,
      ats_override: true,
    });
    await expect(analyze(resume.id as string)).resolves.toBe("scored");
    expect(model.count("score")).toBe(1);
    expect(model.count("radar")).toBe(1);
    expect(resumeRow(resume.id as string).ats_status).toBe("NOT_ATS_READY");
  });

  it.each([
    ["no email address", { extracted_text: READY_TEXT.replace("priya.natarajan@example.com", "email on request") }, /^No email address/],
    ["no phone number", { extracted_text: READY_TEXT.replace("+44 20 7946 0000", "phone on request") }, /^No phone number/],
    ["a picture", { image_count: 2 }, /^The file contains 2 pictures\./],
  ])("sets aside an otherwise clean resume with %s, saying why, with zero model calls", async (_name, over, reason) => {
    const resume = seedResume(db, job.id as string, over);
    await expect(analyze(resume.id as string)).resolves.toBe("ats_failed");
    const row = resumeRow(resume.id as string);
    expect(row.ats_status).toBe("NOT_ATS_READY");
    expect(row.ats_score as number).toBeGreaterThanOrEqual(60);
    expect(row.ats_reasons).toEqual([expect.stringMatching(reason)]);
    expect(model.count()).toBe(0);
    expect(db.rows("candidates")).toHaveLength(0);
  });

  it("scores a resume with a picture once the recruiter overrides the gate", async () => {
    const resume = seedResume(db, job.id as string, { image_count: 1, ats_override: true });
    await expect(analyze(resume.id as string)).resolves.toBe("scored");
    expect(model.count("score")).toBe(1);
    expect(model.count("radar")).toBe(1);
    expect(resumeRow(resume.id as string).ats_status).toBe("NOT_ATS_READY");
  });

  it("passes the picture check for a resume whose pictures were never counted", async () => {
    const resume = seedResume(db, job.id as string, { image_count: null });
    await expect(analyze(resume.id as string)).resolves.toBe("scored");
    expect(resumeRow(resume.id as string)).toMatchObject({ ats_status: "ATS_READY", ats_score: 100 });
  });

  it("scores an ATS-ready resume and saves the candidate with stored tenths", async () => {
    const resume = seedResume(db, job.id as string);
    await expect(analyze(resume.id as string)).resolves.toBe("scored");

    expect(db.rows("candidates")).toEqual([
      expect.objectContaining({
        job_id: job.id,
        resume_id: resume.id,
        full_name: SCORE_ANSWER.full_name,
        match_score: SCORE_TOTAL,
        match_summary: SCORE_ANSWER.match_summary,
        strengths: SCORE_ANSWER.strengths,
        gaps: SCORE_ANSWER.gaps,
        radar_results: expect.objectContaining({ employment_gaps: { flagged: true, note: "Gap in 2021." } }),
        email: "priya.natarajan@example.com",
        invite_status: "NONE",
      }),
    ]);
    expect(resumeRow(resume.id as string)).toMatchObject({ ats_status: "ATS_READY", status: "extracted" });
  });

  it("saves the ATS result before any model call", async () => {
    const resume = seedResume(db, job.id as string);
    const seen: unknown[] = [];
    model.onCall = () => seen.push(resumeRow(resume.id as string).ats_status);
    await analyze(resume.id as string);
    expect(seen).toEqual(["ATS_READY", "ATS_READY"]);
  });

  it("uses the file name without its extension when the model gives no name", async () => {
    model.score = () => ({ ...SCORE_ANSWER, full_name: "   " });
    const resume = seedResume(db, job.id as string, { file_name: "Jordan Lee CV.docx" });
    await analyze(resume.id as string);
    expect(db.rows("candidates")[0].full_name).toBe("Jordan Lee CV");
  });

  it("sends the job's other resumes, not this one, to Radar", async () => {
    seedResume(db, job.id as string, {
      extracted_text: "Olive Other\nEngineer\nolive@example.com\nOTHER RESUME ONE body",
    });
    seedResume(db, job.id as string, { extracted_text: null, status: "pending" });
    const resume = seedResume(db, job.id as string, { extracted_text: `${READY_TEXT}\nSELF MARKER` });
    await analyze(resume.id as string);
    const radar = model.calls.find((call) => call.kind === "radar");
    const user = messageText(radar!.options, "user");
    expect(user.match(/<other_resume /g)).toHaveLength(1);
    expect(user).toContain("OTHER RESUME ONE");
    expect(user.split("SELF MARKER")).toHaveLength(2);
  });
});

describe("analyzeResume model failures", () => {
  it("retries a bad answer once and then scores", async () => {
    let tries = 0;
    model.score = () => (tries++ === 0 ? { ...SCORE_ANSWER, start_score: 8.3 } : SCORE_ANSWER);
    const resume = seedResume(db, job.id as string);
    await expect(analyze(resume.id as string)).resolves.toBe("scored");
    expect(model.count("score")).toBe(2);
  });

  it("marks the resume failed after two bad answers, saves nothing half-formed and logs once without resume text", async () => {
    model.score = () => ({ ...SCORE_ANSWER, evidence: 15 });
    const resume = seedResume(db, job.id as string);
    await expect(analyze(resume.id as string)).resolves.toBe("failed");
    expect(model.count("score")).toBe(2);
    expect(resumeRow(resume.id as string).status).toBe("failed");
    expect(db.rows("candidates")).toHaveLength(0);
    expect(errorLog).toHaveBeenCalledTimes(1);
    const logged = String(errorLog.mock.calls[0][0]);
    expect(logged).not.toContain("Priya");
    expect(logged).toContain("Resume analysis failed");
  });

  it("marks the resume failed when the gateway errors, and a later run succeeds", async () => {
    model.radar = () => {
      throw new Error("gateway down");
    };
    const resume = seedResume(db, job.id as string);
    await expect(analyze(resume.id as string)).resolves.toBe("failed");
    expect(resumeRow(resume.id as string).status).toBe("failed");

    model.radar = new ScreeningModel().radar;
    await expect(analyze(resume.id as string)).resolves.toBe("scored");
    expect(resumeRow(resume.id as string).status).toBe("extracted");
    expect(db.rows("candidates")).toHaveLength(1);
  });

  it("turns a gateway 429 into a retryable ModelBusyError and leaves the resume as it was", async () => {
    model.score = () => {
      throw new APICallError({
        message: "rate limited",
        url: "https://ai-gateway.vercel.sh",
        requestBodyValues: {},
        statusCode: 429,
        responseHeaders: { "retry-after": "1" },
        isRetryable: false,
      });
    };
    const resume = seedResume(db, job.id as string);
    const error = await analyze(resume.id as string).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ModelBusyError);
    expect((error as ModelBusyError).retryAfterSeconds).toBe(1);
    expect(resumeRow(resume.id as string).status).toBe("extracted");
    expect(db.rows("candidates")).toHaveLength(0);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it("throws a database failure instead of reporting a status", async () => {
    const resume = seedResume(db, job.id as string);
    db.failWhen = (call) => (call.table === "candidates" && call.op === "upsert" ? "08006" : null);
    await expect(analyze(resume.id as string)).rejects.toThrow("Jobs database call failed");
  });
});

describe("analyzeResume candidate row", () => {
  async function scoreWith(threshold: number, score: number) {
    db = new FakeDb();
    job = seedJob(db, { invite_threshold: threshold });
    model.score = () => scoreAnswer(score);
    const resume = seedResume(db, job.id as string);
    await analyze(resume.id as string);
    return db.rows("candidates")[0];
  }

  it.each([
    ["above", 70, 95],
    ["exactly at", 83, 83],
    ["below", 84, 83],
  ])("saves invite_status NONE for a score %s the invite bar", async (_, threshold, score) => {
    const candidate = await scoreWith(threshold, score);
    expect(candidate).toMatchObject({ match_score: score, invite_status: "NONE" });
  });

  it("saves the first email address in the resume, in lower case", async () => {
    const resume = seedResume(db, job.id as string, {
      extracted_text: READY_TEXT.replace("priya.natarajan@example.com", "Priya.N@Example.com, other@example.com"),
    });
    await expect(analyze(resume.id as string)).resolves.toBe("scored");
    expect(db.rows("candidates")[0].email).toBe("priya.n@example.com");
  });

  it("saves a null email when the resume has none", async () => {
    const resume = seedResume(db, job.id as string, {
      extracted_text: READY_TEXT.replace("priya.natarajan@example.com", ""),
      ats_override: true,
    });
    await expect(analyze(resume.id as string)).resolves.toBe("scored");
    expect(db.rows("candidates")[0].email).toBeNull();
  });
});

describe("analyzeResume idempotence", () => {
  it("re-running after everything is scored makes zero model calls and creates no rows", async () => {
    const ready = seedResume(db, job.id as string);
    const notReady = seedResume(db, job.id as string, { extracted_text: NOT_READY_TEXT });
    await analyze(ready.id as string);
    await analyze(notReady.id as string);
    const calls = model.count();
    const snapshot = JSON.stringify(db.tables);

    await expect(analyze(ready.id as string)).resolves.toBe("scored");
    await expect(analyze(notReady.id as string)).resolves.toBe("ats_failed");

    expect(model.count()).toBe(calls);
    expect(db.rows("candidates")).toHaveLength(1);
    expect(JSON.stringify(db.tables)).toBe(snapshot);
  });

  it("two simultaneous calls for one resume produce one candidate, and both report scored", async () => {
    model.delayMs = 20;
    const resume = seedResume(db, job.id as string);
    const results = await Promise.all([analyze(resume.id as string), analyze(resume.id as string)]);
    expect(results).toEqual(["scored", "scored"]);
    expect(model.count("score")).toBe(2);
    expect(db.rows("candidates")).toHaveLength(1);
    expect(db.rows("candidates")[0].invite_status).toBe("NONE");
  });

  it("the losing call returns the winner's candidate even when the two scores differ", async () => {
    model.delayMs = 10;
    let n = 0;
    model.score = () => scoreAnswer(n++ === 0 ? 90 : 40);
    const resume = seedResume(db, job.id as string);
    await Promise.all([analyze(resume.id as string), analyze(resume.id as string)]);
    expect(db.rows("candidates")).toHaveLength(1);
    const saved = db.rows("candidates")[0];
    expect([90, 40]).toContain(saved.match_score);
    expect(saved.invite_status).toBe("NONE");
  });
});

describe("analyzeResume failures racing a success", () => {
  it("a call that fails after another call saved the candidate reports scored and leaves the resume not failed", async () => {
    const resume = seedResume(db, job.id as string);
    model.onCall = (kind) => {
      if (kind !== "score" || db.rows("candidates").length > 0) return;
      db.insertRow("candidates", {
        job_id: job.id,
        resume_id: resume.id,
        full_name: "Winner",
        match_score: 80,
        match_summary: "Saved by the other call.",
      });
    };
    model.score = () => {
      throw new Error("provider down");
    };
    await expect(analyze(resume.id as string)).resolves.toBe("scored");
    expect(resumeRow(resume.id as string).status).toBe("extracted");
    expect(db.rows("candidates")).toHaveLength(1);
    expect(db.rows("candidates")[0].full_name).toBe("Winner");
  });

  it("a success after a failure clears the stale failed status", async () => {
    const resume = seedResume(db, job.id as string);
    model.score = () => {
      throw new Error("provider down");
    };
    await expect(analyze(resume.id as string)).resolves.toBe("failed");
    expect(resumeRow(resume.id as string).status).toBe("failed");
    model.score = () => SCORE_ANSWER;
    await expect(analyze(resume.id as string)).resolves.toBe("scored");
    expect(resumeRow(resume.id as string).status).toBe("extracted");
  });

  it("concurrent calls where one fails and one succeeds end with one candidate and the resume not failed", async () => {
    for (let round = 0; round < 5; round += 1) {
      db = new FakeDb();
      job = seedJob(db);
      model = new ScreeningModel();
      model.delayMs = round * 3;
      let calls = 0;
      model.score = () => {
        calls += 1;
        if (calls === 1) throw new Error("provider down");
        return SCORE_ANSWER;
      };
      const resume = seedResume(db, job.id as string);
      await Promise.all([analyze(resume.id as string), analyze(resume.id as string)]);
      expect(db.rows("candidates")).toHaveLength(1);
      expect(resumeRow(resume.id as string).status).not.toBe("failed");
    }
  });

  it("never marks an upload failure (failed, no text)", async () => {
    const resume = seedResume(db, job.id as string, { status: "failed", extracted_text: null });
    await expect(analyze(resume.id as string)).resolves.toBe("not_extracted");
    expect(resumeRow(resume.id as string)).toMatchObject({ status: "failed", ats_status: null });
    expect(model.count()).toBe(0);
  });
});

describe("analyzeResume model calls", () => {
  it("aborts the other model call when one fails", async () => {
    model.delayMs = 15;
    model.score = () => {
      throw new Error("provider down");
    };
    const resume = seedResume(db, job.id as string);
    await expect(analyze(resume.id as string)).resolves.toBe("failed");
    const radar = model.calls.find((call) => call.kind === "radar");
    expect(radar?.options.abortSignal?.aborted).toBe(true);
  });

  it("treats a unique violation on resume_id as another call winning", async () => {
    const resume = seedResume(db, job.id as string);
    const otherJob = seedJob(db);
    model.onCall = (kind) => {
      if (kind !== "radar" || db.rows("candidates").length > 0) return;
      db.insertRow("candidates", {
        job_id: otherJob.id,
        resume_id: resume.id,
        full_name: "Earlier",
        match_score: 60,
        match_summary: "Saved first.",
      });
    };
    await expect(analyze(resume.id as string)).resolves.toBe("scored");
    expect(db.rows("candidates")).toHaveLength(1);
    expect(db.rows("candidates")[0].full_name).toBe("Earlier");
  });
});
