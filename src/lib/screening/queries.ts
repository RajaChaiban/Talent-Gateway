import type { ServerClient } from "@/lib/auth/verified-user";
import type { RadarResults } from "@/lib/ai/schemas";
import { SCREENING_AI_LIMITS } from "@/lib/config";
import { JobsDataError } from "@/lib/jobs/queries";
import { asCandidate, type Candidate } from "@/lib/jobs/types";
import type { StoredScore } from "@/lib/score";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { settledStatus, summarize, type JobStatus, type Progress, type Work } from "./work";

/**
 * Database access for the screening pipeline and its routes, always through the
 * recruiter's cookie-bound client (RLS applies). A failed call throws
 * JobsDataError, which the routes turn into a 500 with a safe message.
 */

type Client = Pick<ServerClient, "from">;

export type ResumeForAnalysis = {
  id: string;
  job_id: string;
  file_name: string;
  extracted_text: string | null;
  status: string;
  ats_override: boolean;
};

export async function getResumeForAnalysis(
  supabase: Client,
  id: string,
): Promise<ResumeForAnalysis | null> {
  const { data, error } = await supabase
    .from("resumes")
    .select("id, job_id, file_name, extracted_text, status, ats_override")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new JobsDataError("get resume", error);
  return data;
}

type AtsColumns = Required<Pick<TablesUpdate<"resumes">, "ats_status" | "ats_score" | "ats_reasons">>;

/** Saves the ATS result (and clears an earlier analysis failure); returns the gate as stored. */
export async function saveAtsResult(
  supabase: Client,
  id: string,
  columns: AtsColumns,
): Promise<{ ats_status: string | null; ats_override: boolean }> {
  const { data, error } = await supabase
    .from("resumes")
    .update({ ...columns, status: "extracted" })
    .eq("id", id)
    .select("ats_status, ats_override")
    .single();
  if (error) throw new JobsDataError("save ATS result", error);
  return data;
}

/**
 * Records an analysis failure: `status = 'failed'` with the text kept. Guarded:
 * only a resume that is `extracted` and has text changes, so an upload failure
 * (`failed`, no text) is never touched.
 */
export async function markAnalysisFailed(supabase: Client, id: string): Promise<void> {
  const { error } = await supabase
    .from("resumes")
    .update({ status: "failed" })
    .eq("id", id)
    .eq("status", "extracted")
    .not("extracted_text", "is", null);
  if (error) throw new JobsDataError("mark resume failed", error);
}

/** Clears a stale analysis failure (`failed` with text) back to `extracted`. */
export async function clearAnalysisFailure(supabase: Client, id: string): Promise<void> {
  const { error } = await supabase
    .from("resumes")
    .update({ status: "extracted" })
    .eq("id", id)
    .eq("status", "failed")
    .not("extracted_text", "is", null);
  if (error) throw new JobsDataError("clear resume failure", error);
}

/**
 * Before a new run: the given resumes' analysis failures go back to `extracted`,
 * so progress counts them as remaining (not failed) while they are retried.
 */
export async function resetAnalysisFailures(
  supabase: Client,
  jobId: string,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("resumes")
    .update({ status: "extracted" })
    .eq("job_id", jobId)
    .eq("status", "failed")
    .not("extracted_text", "is", null)
    .in("id", [...ids]);
  if (error) throw new JobsDataError("reset resume failures", error);
}

/**
 * Sets `ats_override` in one guarded write: only a resume the ATS check set
 * aside (`ats_status = 'NOT_ATS_READY'`) changes. False when none did.
 */
export async function setAtsOverride(supabase: Client, id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("resumes")
    .update({ ats_override: true })
    .eq("id", id)
    .eq("ats_status", "NOT_ATS_READY")
    .select("id")
    .maybeSingle();
  if (error) throw new JobsDataError("set ATS override", error);
  return data !== null;
}

/** The fields score-anyway checks before it writes; null for an unknown resume. */
export async function getResumeGate(
  supabase: Client,
  id: string,
): Promise<{ job_id: string; ats_status: string | null } | null> {
  const { data, error } = await supabase
    .from("resumes")
    .select("job_id, ats_status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new JobsDataError("get resume", error);
  return data;
}

export async function findCandidate(supabase: Client, resumeId: string): Promise<Candidate | null> {
  const { data, error } = await supabase
    .from("candidates")
    .select()
    .eq("resume_id", resumeId)
    .maybeSingle();
  if (error) throw new JobsDataError("find candidate", error);
  return data ? asCandidate(data) : null;
}

export type NewCandidate = {
  job_id: string;
  resume_id: string;
  full_name: string;
  match_score: StoredScore;
  match_summary: string;
  strengths: string[];
  gaps: string[];
  radar_results: RadarResults;
  /** The first email address in the resume text; null when there is none. */
  email: string | null;
};

const UNIQUE_VIOLATION = "23505";

/**
 * Inserts the candidate unless the resume already has one. `candidates` has two
 * unique constraints, `(job_id, resume_id)` (the upsert's conflict target, which
 * does nothing on conflict) and `resume_id` (which would raise 23505). Either
 * means another call got there first: returns null, and the caller reads the
 * winner's row. A new candidate is always `invite_status = 'NONE'`, whatever
 * its score: only a recruiter's click invites anyone.
 */
export async function insertCandidate(
  supabase: Client,
  candidate: NewCandidate,
): Promise<Candidate | null> {
  const { data, error } = await supabase
    .from("candidates")
    .upsert(
      { ...candidate, invite_status: "NONE" },
      { onConflict: "job_id,resume_id", ignoreDuplicates: true },
    )
    .select()
    .maybeSingle();
  if (error?.code === UNIQUE_VIOLATION) return null;
  if (error) throw new JobsDataError("save candidate", error);
  return data ? asCandidate(data) : null;
}

/** Texts of the job's other resumes for the copycat check, oldest first, at most radarOthersMax. */
export async function otherResumeTexts(
  supabase: Client,
  jobId: string,
  resumeId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("resumes")
    .select("extracted_text")
    .eq("job_id", jobId)
    .neq("id", resumeId)
    .not("extracted_text", "is", null)
    .order("created_at", { ascending: true })
    .limit(SCREENING_AI_LIMITS.radarOthersMax);
  if (error) throw new JobsDataError("list other resumes", error);
  return data.flatMap((row) => (row.extracted_text === null ? [] : [row.extracted_text]));
}

/** The job's resumes as the selection and progress rules see them, oldest first, and which have a candidate. */
export async function loadWork(supabase: Client, jobId: string): Promise<Work> {
  const [resumes, withText, candidates] = await Promise.all([
    supabase
      .from("resumes")
      .select("id, status, ats_status, ats_override")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true }),
    supabase.from("resumes").select("id").eq("job_id", jobId).not("extracted_text", "is", null),
    supabase.from("candidates").select("resume_id").eq("job_id", jobId),
  ]);
  const error = resumes.error ?? withText.error ?? candidates.error;
  if (error || !resumes.data || !withText.data || !candidates.data) {
    throw new JobsDataError("load analysis state", error);
  }
  const hasText = new Set(withText.data.map((row) => row.id));
  return {
    rows: resumes.data.map((row) => ({ ...row, has_text: hasText.has(row.id) })),
    scored: new Set(candidates.data.map((row) => row.resume_id)),
  };
}

/**
 * Settles a job in ANALYZING from its rows (`settledStatus`): DONE when nothing
 * remains, ERROR when every resume with text failed. Called by the progress
 * route and after each per-resume call, so a run that the browser abandoned
 * still finishes. Returns the counts and the job's status afterwards.
 *
 * DECISION: the status is derived from the rows after every resume, never set
 * to DONE by the caller. The browser may close mid-run and calls may land in
 * any order; recomputing from what is saved gives the same answer either way.
 */
export async function settleJob(
  supabase: Client,
  job: { id: string; status: string },
): Promise<{ progress: Progress; status: string }> {
  const { rows, scored } = await loadWork(supabase, job.id);
  const progress = summarize(rows, scored);
  const next = settledStatus(job.status, progress);
  if (next) await setJobStatus(supabase, job.id, next, "ANALYZING");
  return { progress, status: next ?? job.status };
}

/** Sets the job's status; with `from`, only when it is currently that status. */
export async function setJobStatus(
  supabase: Client,
  jobId: string,
  status: JobStatus,
  from?: JobStatus,
): Promise<void> {
  const query = supabase.from("jobs").update({ status }).eq("id", jobId);
  const { error } = await (from ? query.eq("status", from) : query);
  if (error) throw new JobsDataError("set job status", error);
}
