import { requireUser } from "@/lib/auth/require-user";
import { jsonData, jsonError } from "@/lib/http";
import { notFoundResponse } from "@/lib/jobs/api";
import { getJob } from "@/lib/jobs/queries";
import { inputErrorMessage, jobIdSchema } from "@/lib/jobs/schemas";
import { screeningFailureResponse } from "@/lib/screening/api";
import { settleJob } from "@/lib/screening/queries";

/** A few database calls; no model call. */
export const maxDuration = 30;

/**
 * Counts for the progress bar, read from the rows. A job in ANALYZING with
 * nothing remaining settles here (DONE, or ERROR when every resume with text
 * failed), as it also does after each per-resume call, so the status is right
 * even after a crash or a closed tab.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/jobs/[id]/progress">) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const id = jobIdSchema.safeParse((await ctx.params).id);
  if (!id.success) return jsonError("invalid_input", inputErrorMessage(id.error), 400);

  try {
    const job = await getJob(auth.supabase, id.data);
    if (!job) return notFoundResponse();
    const { progress, status } = await settleJob(auth.supabase, job);
    return jsonData({ ...progress, status });
  } catch (error) {
    return screeningFailureResponse(error);
  }
}
