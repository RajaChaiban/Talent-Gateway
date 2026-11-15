import type { ServerClient } from "@/lib/auth/verified-user";
import type { CreateJobInput, UpdateThresholdsInput } from "./schemas";
import { asJob, asJobListItem, type Job, type JobListItem } from "./types";

/** The most jobs the list returns. The demo never gets near it. */
export const JOB_LIST_LIMIT = 100;

/** `resumes(count)` asks the database for the number of resumes per job in the same query. */
const LIST_COLUMNS =
  "id, title, created_at, top_talent_threshold, invite_threshold, resumes(count)";

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

export async function listJobs(supabase: Client): Promise<JobListItem[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(JOB_LIST_LIMIT);
  if (error) throw new JobsDataError("list jobs", error);

  return data.map(({ resumes, ...job }) => asJobListItem(job, resumes[0]?.count ?? 0));
}

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
