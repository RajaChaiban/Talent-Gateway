import { requireUser } from "@/lib/auth/require-user";
import { jsonData, jsonError } from "@/lib/http";
import { requireSameOrigin } from "@/lib/http-origin";
import { failureResponse, notFoundResponse, readJsonBody } from "@/lib/jobs/api";
import { updateThresholds } from "@/lib/jobs/queries";
import {
  inputErrorMessage,
  jobIdSchema,
  updateThresholdsSchema,
} from "@/lib/jobs/schemas";
import { JOB_SCORES, toApi } from "@/lib/jobs/serialize";

/** One short Supabase update. */
export const maxDuration = 10;

/**
 * Updates one or both thresholds of a job, on the 0 to 10 scale.
 *
 * DECISION: the handler checks the session itself even though the proxy ran
 * first. The proxy only reads the token and never blocks a non-navigation
 * request, so this is the check that asks Supabase Auth. Sign-in comes before
 * the same-origin check, so a signed-out caller always learns it must sign in.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const crossSite = requireSameOrigin(request);
  if (crossSite) return crossSite;

  const id = jobIdSchema.safeParse((await ctx.params).id);
  if (!id.success) {
    return jsonError("invalid_input", inputErrorMessage(id.error), 400);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = updateThresholdsSchema.safeParse(body.value);
  if (!parsed.success) {
    return jsonError("invalid_input", inputErrorMessage(parsed.error), 400);
  }

  try {
    const job = await updateThresholds(auth.supabase, id.data, parsed.data);
    return job ? jsonData(toApi(job, JOB_SCORES)) : notFoundResponse();
  } catch (error) {
    return failureResponse(error);
  }
}
