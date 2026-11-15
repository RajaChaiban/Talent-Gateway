import { requireUser } from "@/lib/auth/require-user";
import { jsonData, jsonError } from "@/lib/http";
import { requireSameOrigin } from "@/lib/http-origin";
import { notFoundResponse } from "@/lib/jobs/api";
import { getJob } from "@/lib/jobs/queries";
import { inputErrorMessage, jobIdSchema } from "@/lib/jobs/schemas";
import { screeningFailureResponse } from "@/lib/screening/api";
import { loadWork, resetAnalysisFailures, setJobStatus } from "@/lib/screening/queries";
import { resumesNeedingWork } from "@/lib/screening/work";

/** A few database calls; no model call. */
export const maxDuration = 30;

/**
 * Starts an analysis run. Returns the resumes that need work, puts earlier
 * analysis failures among them back to `extracted` so progress counts them as
 * remaining while they are retried, and sets the job to ANALYZING (DONE when there is nothing to do).
 * It starts nothing itself: the browser calls POST /api/resumes/[id]/analyze
 * for each id.
 *
 * DECISION: each per-resume request handles one resume and stays short (one
 * ATS check, at most two parallel model calls under a 25 s budget), so no
 * function runs near its limit and a failure costs one resume, not the run.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[id]/analyze">) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const crossSite = requireSameOrigin(request);
  if (crossSite) return crossSite;

  const id = jobIdSchema.safeParse((await ctx.params).id);
  if (!id.success) return jsonError("invalid_input", inputErrorMessage(id.error), 400);

  try {
    const job = await getJob(auth.supabase, id.data);
    if (!job) return notFoundResponse();
    const work = await loadWork(auth.supabase, job.id);
    const resumeIds = resumesNeedingWork(work.rows, work.scored);
    await resetAnalysisFailures(auth.supabase, job.id, resumeIds);
    await setJobStatus(auth.supabase, job.id, resumeIds.length > 0 ? "ANALYZING" : "DONE");
    return jsonData({ resume_ids: resumeIds });
  } catch (error) {
    return screeningFailureResponse(error);
  }
}
