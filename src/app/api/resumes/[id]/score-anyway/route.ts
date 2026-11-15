import { requireUser } from "@/lib/auth/require-user";
import { jsonData, jsonError } from "@/lib/http";
import { requireSameOrigin } from "@/lib/http-origin";
import { inputErrorMessage, resumeIdSchema } from "@/lib/jobs/schemas";
import { analyzeResume } from "@/lib/screening/analyze";
import {
  ALREADY_SCORED_MESSAGE,
  NOT_SET_ASIDE_MESSAGE,
  resumeNotFoundResponse,
  screeningFailureResponse,
  settleAfterResume,
} from "@/lib/screening/api";
import {
  findCandidate,
  getResumeGate,
  setAtsOverride,
  setJobStatus,
} from "@/lib/screening/queries";

/** Same work as the per-resume analyze route. */
export const maxDuration = 60;

/**
 * The recruiter's override of the ATS gate, for a resume the check set aside.
 * 404 unknown; 409 when it already has a candidate or was not set aside
 * (unchecked or ATS-ready), with no model call. Otherwise one guarded write sets
 * `ats_override` (only while `ats_status = 'NOT_ATS_READY'`), the job goes back
 * to ANALYZING (DONE -> ANALYZING in the state machine), the pipeline runs, and
 * the job settles again. Returns `{ resume_id, ats_override: true, status }`.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/resumes/[id]/score-anyway">) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const crossSite = requireSameOrigin(request);
  if (crossSite) return crossSite;

  const id = resumeIdSchema.safeParse((await ctx.params).id);
  if (!id.success) return jsonError("invalid_input", inputErrorMessage(id.error), 400);

  try {
    const resume = await getResumeGate(auth.supabase, id.data);
    if (!resume) return resumeNotFoundResponse();
    if (await findCandidate(auth.supabase, id.data)) {
      return jsonError("conflict", ALREADY_SCORED_MESSAGE, 409);
    }
    if (resume.ats_status !== "NOT_ATS_READY") {
      return jsonError("conflict", NOT_SET_ASIDE_MESSAGE, 409);
    }
    if (!(await setAtsOverride(auth.supabase, id.data))) {
      return jsonError("conflict", NOT_SET_ASIDE_MESSAGE, 409);
    }
    await setJobStatus(auth.supabase, resume.job_id, "ANALYZING");
    const result = await analyzeResume(auth.supabase, id.data);
    if (result === null) return resumeNotFoundResponse();
    await settleAfterResume(auth.supabase, result.jobId);
    return jsonData({ resume_id: id.data, ats_override: true, status: result.status });
  } catch (error) {
    return screeningFailureResponse(error);
  }
}
