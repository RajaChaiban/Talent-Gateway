import { requireUser } from "@/lib/auth/require-user";
import { jsonError } from "@/lib/http";
import { requireSameOrigin } from "@/lib/http-origin";
import { inviteResponse } from "@/lib/invitations/api";
import { inviteCandidate } from "@/lib/invitations/invite";
import { candidateIdSchema, inviteBodySchema } from "@/lib/invitations/schemas";
import { failureResponse, readJsonBody } from "@/lib/jobs/api";
import { inputErrorMessage } from "@/lib/jobs/schemas";

/** A few short Supabase calls and one send. */
export const maxDuration = 30;

/**
 * Invites one candidate to interview with the address the recruiter approved.
 * The click is the approval: `approved_by` is the signed-in recruiter. The
 * email goes out at most once per candidate (see `inviteCandidate`).
 * 200 `{ candidate_id, invite_status, sent_to, sent_at }`, also for a
 * candidate already invited; 404 unknown; 409 a send is in progress; 502
 * `email_failed` when the send failed (the status is now FAILED).
 *
 * DECISION: the address is editable before sending. The one read from a
 * resume is the first in its text, which can be a referee's, so the person
 * approving confirms it. `candidates.email` keeps what the resume said;
 * `invitations.sent_to` records the address actually used.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/candidates/[id]/invite">) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const crossSite = requireSameOrigin(request);
  if (crossSite) return crossSite;

  const id = candidateIdSchema.safeParse((await ctx.params).id);
  if (!id.success) return jsonError("invalid_input", inputErrorMessage(id.error), 400);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = inviteBodySchema.safeParse(body.value);
  if (!parsed.success) return jsonError("invalid_input", inputErrorMessage(parsed.error), 400);

  try {
    const outcome = await inviteCandidate(auth.supabase, {
      candidateId: id.data,
      email: parsed.data.email,
      approvedBy: auth.user.id,
    });
    return inviteResponse(outcome);
  } catch (error) {
    return failureResponse(error);
  }
}
