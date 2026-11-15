import type { ServerClient } from "@/lib/auth/verified-user";
import { asJobListItem, type JobListItem } from "./types";

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
