import { requireUser } from "@/lib/auth/require-user";
import { jsonData, jsonError } from "@/lib/http";
import { requireSameOrigin } from "@/lib/http-origin";
import { inputErrorMessage, resumeIdSchema } from "@/lib/jobs/schemas";
import { analyzeResume } from "@/lib/screening/analyze";
import {
  resumeNotFoundResponse,
  screeningFailureResponse,
  settleAfterResume,
} from "@/lib/screening/api";

/**
 * One resume: the ATS check and, when it passes, two model calls in parallel,
 * each with a 25 s abort budget (SCREENING_AI_LIMITS.callTimeoutMs).
 */
export const maxDuration = 60;

/**
 * Analyzes one resume and returns its new status. Needs a signed-in user and a same-origin request.
 * Responds 404 when the resume is not the caller's (row-level security hides it) and settles the job's status once the resume is done.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/resumes/[id]/analyze">) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const crossSite = requireSameOrigin(request);
  if (crossSite) return crossSite;

  const id = resumeIdSchema.safeParse((await ctx.params).id);
  if (!id.success) return jsonError("invalid_input", inputErrorMessage(id.error), 400);

  try {
    const result = await analyzeResume(auth.supabase, id.data);
    if (result === null) return resumeNotFoundResponse();
    await settleAfterResume(auth.supabase, result.jobId);
    return jsonData({ resume_id: id.data, status: result.status });
  } catch (error) {
    return screeningFailureResponse(error);
  }
}
