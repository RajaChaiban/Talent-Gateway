import type { ServerClient } from "@/lib/auth/verified-user";
import { countResumes, rankCandidates, selectNotAtsReady, selectQueued } from "./helpers";
import type { CreateJobInput, UpdateThresholdsInput } from "./schemas";
import {
  asCandidateWithInvitation,
  asJob,
  asJobListItem,
  asResumesForFilter,
  type Job,
  type JobListItem,
  type JobPage,
} from "./types";

/** The most jobs the list returns. The demo never gets near it. */
export const JOB_LIST_LIMIT = 100;

/** `resumes(count)` asks the database for the number of resumes per job in the same query. */
const LIST_COLUMNS =
  "id, title, status, created_at, top_talent_threshold, invite_threshold, resumes(count)";

/** A failed database call. `cause` keeps the Supabase error for the server log only. */
export class JobsDataError extends Error {
  constructor(operation: string, cause?: unknown) {
    super(`Jobs database call failed: ${operation}`, { cause });
    this.name = "JobsDataError";
  }
}

/**
 * DECISION: queries take the caller's client instead of creating one. The
 * page passes the signed-in recruiter's client, so row-level security in the
 * database decides what comes back, and tests can pass a stand-in.
 */
type Client = Pick<ServerClient, "from">;

/** The recruiter's jobs, newest first, up to JOB_LIST_LIMIT, each with its resume count. */
export async function listJobs(supabase: Client): Promise<JobListItem[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(JOB_LIST_LIMIT);
  if (error) throw new JobsDataError("list jobs", error);

  return data.map(({ resumes, ...job }) => asJobListItem(job, resumes[0]?.count ?? 0));
}

/** Inserts a job and returns the saved row. */
export async function createJob(supabase: Client, input: CreateJobInput): Promise<Job> {
  const { data, error } = await supabase.from("jobs").insert(input).select().single();
  if (error) throw new JobsDataError("create job", error);
  return asJob(data);
}

/** Null when no job has this id (or row-level security hides it). */
export async function getJob(supabase: Client, id: string): Promise<Job | null> {
  const { data, error } = await supabase.from("jobs").select().eq("id", id).maybeSingle();
  if (error) throw new JobsDataError("get job", error);
  return data ? asJob(data) : null;
}

/** Each candidate with its invitation, embedded through `invitations.candidate_id` (unique, so one object or null). */
const JOB_PAGE_CANDIDATE_COLUMNS = "*, invitations(sent_to, sent_at, approved_at)";

const JOB_PAGE_RESUME_COLUMNS =
  "id, file_name, ats_score, ats_reasons, created_at, ats_status, ats_override";

/** Everything the job page shows below the resumes, from one read of the job's candidates and resumes. Null when no job has this id. */
export async function getJobPage(supabase: Client, id: string): Promise<JobPage | null> {
  const job = await getJob(supabase, id);
  if (!job) return null;

  const [candidates, resumes] = await Promise.all([
    supabase.from("candidates").select(JOB_PAGE_CANDIDATE_COLUMNS).eq("job_id", id),
    supabase
      .from("resumes")
      .select(JOB_PAGE_RESUME_COLUMNS)
      .eq("job_id", id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);
  if (candidates.error || resumes.error) {
    throw new JobsDataError("get job page", candidates.error ?? resumes.error);
  }

  const resumeRows = asResumesForFilter(resumes.data);
  const candidateRows = candidates.data.map(asCandidateWithInvitation);
  const scoredIds = new Set(candidateRows.map((candidate) => candidate.resume_id));

  return {
    job,
    candidates: rankCandidates(candidateRows, resumeRows),
    notAtsReady: selectNotAtsReady(resumeRows, scoredIds),
    queued: selectQueued(resumeRows, scoredIds),
    counts: countResumes(resumeRows, scoredIds),
  };
}

/** Null when no job has this id. */
export async function updateThresholds(
  supabase: Client,
  id: string,
  input: UpdateThresholdsInput,
): Promise<Job | null> {
  const { data, error } = await supabase
    .from("jobs")
    .update(input)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new JobsDataError("update thresholds", error);
  return data ? asJob(data) : null;
}
