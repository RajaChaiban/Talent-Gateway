import { checkAts } from "@/lib/ats/check-ats";
import { toAtsColumns } from "@/lib/ats/to-columns";
import { ModelBusyError, rateLimitRetryAfter } from "@/lib/ai/errors";
import { contactDetails } from "@/lib/ai/prompts";
import { runRadar } from "@/lib/ai/run-radar";
import { scoreResume } from "@/lib/ai/score-resume";
import type { ServerClient } from "@/lib/auth/verified-user";
import { getJob } from "@/lib/jobs/queries";
import type { Job } from "@/lib/jobs/types";
import { logServerError } from "@/lib/log";
import { fileFacts, nameFromFileName } from "./file-facts";
import {
  clearAnalysisFailure,
  findCandidate,
  getResumeForAnalysis,
  insertCandidate,
  markAnalysisFailed,
  otherResumeTexts,
  saveAtsResult,
  type ResumeForAnalysis,
} from "./queries";

export type AnalyzeStatus = "scored" | "ats_failed" | "not_extracted" | "failed";

/** The resume's resulting status and its job, which the route settles afterwards. */
export type AnalyzeResult = { status: AnalyzeStatus; jobId: string };

type Client = Pick<ServerClient, "from">;

/** The model calls, for a resume that passed (or was overridden past) the ATS gate. */
async function scoreAndSave(
  supabase: Client,
  resume: ResumeForAnalysis,
  text: string,
  job: Job,
): Promise<AnalyzeStatus> {
  const others = await otherResumeTexts(supabase, resume.job_id, resume.id);

  // When one call fails the other is aborted, so a failed analysis stops paying.
  const sibling = new AbortController();
  const abortOnFailure = <T,>(call: Promise<T>): Promise<T> =>
    call.catch((error: unknown) => {
      sibling.abort();
      throw error;
    });

  let results: [Awaited<ReturnType<typeof scoreResume>>, Awaited<ReturnType<typeof runRadar>>];
  try {
    results = await Promise.all([
      abortOnFailure(scoreResume(job.description, text, sibling.signal)),
      abortOnFailure(runRadar(text, others, sibling.signal)),
    ]);
  } catch (error) {
    const retryAfter = rateLimitRetryAfter(error);
    if (retryAfter !== null) throw new ModelBusyError(retryAfter);
    logServerError("Resume analysis failed: model call", error);
    // A simultaneous call for the same resume may have scored it. Mark first,
    // then look: whichever order the two calls' writes land in, a scored resume
    // ends up not failed (the winner also clears the mark after it saves).
    await markAnalysisFailed(supabase, resume.id);
    if (await findCandidate(supabase, resume.id)) {
      await clearAnalysisFailure(supabase, resume.id);
      return "scored";
    }
    return "failed";
  }
  const [score, radar] = results;

  const inserted = await insertCandidate(supabase, {
    job_id: resume.job_id,
    resume_id: resume.id,
    full_name: score.full_name.trim() || nameFromFileName(resume.file_name),
    match_score: score.match_score,
    match_summary: score.match_summary,
    strengths: score.strengths,
    gaps: score.gaps,
    radar_results: radar,
    email: contactDetails(text).emails[0] ?? null,
  });
  // A simultaneous call for the same resume saved first: its row stands.
  if (!inserted && !(await findCandidate(supabase, resume.id))) {
    throw new Error("Candidate missing after a conflicting insert");
  }
  // A simultaneous call that failed may have marked the resume failed after this one saved.
  await clearAnalysisFailure(supabase, resume.id);
  return "scored";
}

/**
 * The screening pipeline for one resume, and the only way to reach
 * `scoreResume` and `runRadar`. In order:
 *
 * 1. Load the resume and its job (null when the resume does not exist).
 * 2. A resume that already has a candidate is `scored` with no model call.
 * 3. No extracted text: `not_extracted`.
 * 4. Run `checkAts` (with the picture count saved at extraction) and save the
 *    result; the gate is read back from the saved row. NOT_ATS_READY without `ats_override`: `ats_failed`, no model call.
 * 5. Score and Radar, then save the candidate (one per resume; a racing call
 *    reads the winner's row) with `invite_status = 'NONE'` whatever its score,
 *    and the first email address in the resume (null when there is none).
 *
 * A model failure marks the resume `failed` (`status = 'failed'` with its text
 * kept, which is how an analysis failure differs from an upload failure;
 * retryable by analyzing again), and never a resume that has a candidate. A
 * gateway rate limit throws ModelBusyError and changes nothing.
 *
 * DECISION: the ATS gate is enforced here, inside the only module that may
 * import the model calls (guarded by `boundary.test.ts`), not by the routes.
 * No caller can reach a model without the gate running first, so a resume set
 * aside costs nothing unless a recruiter overrides it.
 */
export async function analyzeResume(
  supabase: Client,
  resumeId: string,
): Promise<AnalyzeResult | null> {
  const resume = await getResumeForAnalysis(supabase, resumeId);
  if (!resume) return null;
  const job = await getJob(supabase, resume.job_id);
  if (!job) return null;
  const result = (status: AnalyzeStatus): AnalyzeResult => ({ status, jobId: job.id });

  const existing = await findCandidate(supabase, resume.id);
  if (existing) return result("scored");

  const text = resume.extracted_text;
  if (text === null) return result("not_extracted");

  const ats = checkAts({ text, imageCount: resume.image_count, ...fileFacts(resume.file_name) });
  const gate = await saveAtsResult(supabase, resume.id, toAtsColumns(ats));
  if (gate.ats_status !== "ATS_READY" && !gate.ats_override) return result("ats_failed");

  return result(await scoreAndSave(supabase, resume, text, job));
}
