import type { ServerClient } from "@/lib/auth/verified-user";
import { logServerError } from "@/lib/log";
import { invitationMessage } from "./message";
import {
  claimRetry,
  getCandidateForInvite,
  getInvitation,
  insertInvitation,
  markInvitationFailed,
  markInvitationSent,
  setInviteStatus,
  type Approval,
  type CandidateForInvite,
  type Invitation,
} from "./queries";
import { sendInvitationEmail, type SendInvitationEmail } from "./send";
import { invitationStatus, isStaleApproval, type InviteStatus } from "./status";

type Client = Pick<ServerClient, "from">;

/** What the route answers with 200. */
type InviteState = {
  candidate_id: string;
  invite_status: Exclude<InviteStatus, "NONE">;
  sent_to: string;
  sent_at: string | null;
};

/**
 * - `sent`: this request sent the email.
 * - `stored`: nothing was sent by this request; the invitation as it stands
 *   (already sent, or failed for the request that won a race).
 * - `failed`: this request tried to send and the send failed; now FAILED.
 * - `in_progress`: another request is sending; nothing was sent.
 * - `not_found`: no such candidate.
 */
export type InviteOutcome =
  | { kind: "sent" | "stored" | "failed"; state: InviteState }
  | { kind: "in_progress" }
  | { kind: "not_found" };

type InviteInput = { candidateId: string; email: string; approvedBy: string };

type InviteDeps = { now: () => Date; send: SendInvitationEmail };

const DEFAULT_DEPS: InviteDeps = { now: () => new Date(), send: sendInvitationEmail };

/** The longest send error kept on the invitation row. */
const ERROR_MAX_CHARS = 500;

function stateOf(invitation: Invitation): InviteState {
  return {
    candidate_id: invitation.candidate_id,
    invite_status: invitationStatus(invitation),
    sent_to: invitation.sent_to,
    sent_at: invitation.sent_at,
  };
}

function sendErrorText(error: unknown): string {
  const text = error instanceof Error ? error.message.trim() : "";
  return (text || "The email could not be sent").slice(0, ERROR_MAX_CHARS);
}

/**
 * The invitation as another request left it, for a request that did not get
 * to send: sent or failed is answered as stored, still sending is a conflict.
 * This request never sends from here.
 */
async function afterLostClaim(supabase: Client, candidateId: string): Promise<InviteOutcome> {
  const current = await getInvitation(supabase, candidateId);
  if (!current || invitationStatus(current) === "APPROVED") return { kind: "in_progress" };
  return { kind: "stored", state: stateOf(current) };
}

/**
 * Sends the email for an invitation this request holds, then records the
 * result on the invitation first and on the candidate second.
 */
async function deliver(
  supabase: Client,
  candidate: CandidateForInvite,
  invitation: Invitation,
  deps: InviteDeps,
): Promise<InviteOutcome> {
  await setInviteStatus(supabase, candidate.id, "APPROVED");
  const message = invitationMessage(candidate.full_name, candidate.job_title);

  let messageId: string;
  try {
    messageId = await deps.send({
      to: invitation.sent_to,
      subject: message.subject,
      text: message.text,
      idempotencyKey: invitation.id,
    });
  } catch (error) {
    logServerError("Sending an invitation email failed", error);
    const text = sendErrorText(error);
    await markInvitationFailed(supabase, invitation.id, text);
    await setInviteStatus(supabase, candidate.id, "FAILED");
    return { kind: "failed", state: stateOf({ ...invitation, error: text }) };
  }

  const sent = { sent_at: deps.now().toISOString(), message_id: messageId };
  await markInvitationSent(supabase, invitation.id, sent);
  await setInviteStatus(supabase, candidate.id, "SENT");
  return { kind: "sent", state: stateOf({ ...invitation, ...sent, error: null }) };
}

/**
 * The recruiter's click on "Invite to interview": the click is the approval.
 * Sends the invitation email at most once per candidate, whatever the
 * recruiter or the network does:
 *
 * - no invitation: insert one (the lock), set APPROVED, send, then SENT or FAILED;
 * - already sent: answer the stored state; no send, and a different address is ignored;
 * - FAILED, or APPROVED for longer than `INVITE_LIMITS.staleApprovalMs`: claim
 *   the same row for a retry (the address may be corrected) and send;
 * - APPROVED more recently: another request is sending; no send;
 * - lost the insert or the claim to another request: no send.
 *
 * DECISION: a row with `sent_at` is never sent again. A repeated click, a
 * retried request or a second tab gets the stored answer, so a candidate can
 * never receive the same invitation twice.
 */
export async function inviteCandidate(
  supabase: Client,
  input: InviteInput,
  deps: InviteDeps = DEFAULT_DEPS,
): Promise<InviteOutcome> {
  const candidate = await getCandidateForInvite(supabase, input.candidateId);
  if (!candidate) return { kind: "not_found" };

  const now = deps.now();
  const approval: Approval = {
    approved_by: input.approvedBy,
    approved_at: now.toISOString(),
    sent_to: input.email,
  };
  const existing = candidate.invitation;

  if (!existing) {
    const inserted = await insertInvitation(supabase, candidate.id, approval);
    return inserted
      ? deliver(supabase, candidate, inserted, deps)
      : afterLostClaim(supabase, candidate.id);
  }

  const status = invitationStatus(existing);
  if (status === "SENT") {
    if (candidate.invite_status !== "SENT") await setInviteStatus(supabase, candidate.id, "SENT");
    return { kind: "stored", state: stateOf(existing) };
  }
  if (status === "APPROVED" && !isStaleApproval(existing.approved_at, now)) {
    return { kind: "in_progress" };
  }

  const claimed = await claimRetry(supabase, existing, approval);
  return claimed
    ? deliver(supabase, candidate, claimed, deps)
    : afterLostClaim(supabase, candidate.id);
}
