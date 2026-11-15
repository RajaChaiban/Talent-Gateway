import type { ServerClient } from "@/lib/auth/verified-user";
import { JobsDataError } from "./queries";

type Client = Pick<ServerClient, "from">;

/** How many resumes the job has. A head-only count: no rows are sent back. */
export async function countResumes(supabase: Client, jobId: string): Promise<number> {
  const { count, error } = await supabase
    .from("resumes")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId);
  if (error) throw new JobsDataError("count resumes", error);
  return count ?? 0;
}
