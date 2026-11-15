import type { ServerClient } from "@/lib/auth/verified-user";
import { JobsDataError } from "@/lib/jobs/queries";
import type { Tables } from "@/lib/supabase/database.types";
import type { InviteStatus } from "./status";

/**
 * Database access for invitations, always through the recruiter's cookie-bound
 * client (RLS applies). A failed call throws JobsDataError, which the route
 * turns into a 500 with a safe message.
 */

type Client = Pick<ServerClient, "from">;

/** The invitation columns the app reads. */
export type Invitation = Pick<
  Tables<"invitations">,
  "id" | "candidate_id" | "approved_at" | "sent_to" | "sent_at" | "message_id" | "error"
>;

const INVITATION_COLUMNS = "id, candidate_id, approved_at, sent_to, sent_at, message_id, error";

/** A candidate with the title of its job and its invitation (null when none): everything the invite flow needs. */
export type CandidateForInvite = {
  id: string;
  full_name: string;
  invite_status: string;
  job_title: string;
  invitation: Invitation | null;
};

/** The candidate, its job's title and its invitation if it has one; null for an unknown candidate. */
export async function getCandidateForInvite(
  supabase: Client,
  id: string,
): Promise<CandidateForInvite | null> {
  const { data: candidate, error } = await supabase
    .from("candidates")
    .select("id, job_id, full_name, invite_status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new JobsDataError("get candidate", error);
  if (!candidate) return null;

  const [job, invitation] = await Promise.all([
    supabase.from("jobs").select("title").eq("id", candidate.job_id).maybeSingle(),
    getInvitation(supabase, id),
  ]);
  if (job.error) throw new JobsDataError("get job", job.error);
  if (!job.data) return null;

  return {
    id: candidate.id,
    full_name: candidate.full_name,
    invite_status: candidate.invite_status,
    job_title: job.data.title,
    invitation,
  };
}

/** The invitation of a candidate, or null when it has none. There is at most one: `candidate_id` is unique. */
export async function getInvitation(
  supabase: Client,
  candidateId: string,
): Promise<Invitation | null> {
  const { data, error } = await supabase
    .from("invitations")
    .select(INVITATION_COLUMNS)
    .eq("candidate_id", candidateId)
    .maybeSingle();
  if (error) throw new JobsDataError("get invitation", error);
  return data;
}

const UNIQUE_VIOLATION = "23505";

/** What approving an invitation records: who approved, when, and the address approved. */
export type Approval = { approved_by: string; approved_at: string; sent_to: string };

/**
 * Inserts the candidate's invitation. Returns null when the candidate already
 * has one: `unique (candidate_id)` raised 23505 because another request
 * inserted first, which is not an error but a lost race.
 *
 * DECISION: the insert is the lock. Of two requests that both saw no
 * invitation, the database lets exactly one insert, and only that one sends.
 */
export async function insertInvitation(
  supabase: Client,
  candidateId: string,
  approval: Approval,
): Promise<Invitation | null> {
  const { data, error } = await supabase
    .from("invitations")
    .insert({ candidate_id: candidateId, ...approval })
    .select(INVITATION_COLUMNS)
    .single();
  if (error?.code === UNIQUE_VIOLATION) return null;
  if (error) throw new JobsDataError("insert invitation", error);
  return data;
}

/**
 * Claims an unsent invitation for a retry in one guarded write: a new approval
 * (who, when, and the address, which may be corrected) and the last error
 * cleared, only while the row is still as this request read it: unsent, and
 * either failed (an error recorded) or the same stale approval (no error, the
 * same `approved_at`). The claim clears the error and moves `approved_at`, so
 * of two "Try again" clicks only one matches; the other gets null and sends
 * nothing.
 */
export async function claimRetry(
  supabase: Client,
  invitation: Pick<Invitation, "id" | "approved_at" | "error">,
  approval: Approval,
): Promise<Invitation | null> {
  const unsent = supabase
    .from("invitations")
    .update({ ...approval, error: null })
    .eq("id", invitation.id)
    .is("sent_at", null);
  const asRead =
    invitation.error !== null
      ? unsent.not("error", "is", null)
      : unsent.is("error", null).eq("approved_at", invitation.approved_at);
  const { data, error } = await asRead.select(INVITATION_COLUMNS).maybeSingle();
  if (error) throw new JobsDataError("claim invitation retry", error);
  return data;
}

/** Records a delivered email (when, and the provider's message id) and clears any earlier error. */
export async function markInvitationSent(
  supabase: Client,
  id: string,
  sent: { sent_at: string; message_id: string },
): Promise<void> {
  const { error } = await supabase
    .from("invitations")
    .update({ ...sent, error: null })
    .eq("id", id);
  if (error) throw new JobsDataError("mark invitation sent", error);
}

/** Records the send error. Guarded by `sent_at is null`, so a sent invitation is never marked failed. */
export async function markInvitationFailed(
  supabase: Client,
  id: string,
  message: string,
): Promise<void> {
  const { error } = await supabase
    .from("invitations")
    .update({ error: message })
    .eq("id", id)
    .is("sent_at", null);
  if (error) throw new JobsDataError("mark invitation failed", error);
}

/**
 * Sets `candidates.invite_status`. Only the invite flow writes it, and never
 * `candidates.email`: that stays the address read from the resume, and
 * `invitations.sent_to` records the one used.
 */
export async function setInviteStatus(
  supabase: Client,
  candidateId: string,
  status: Exclude<InviteStatus, "NONE">,
): Promise<void> {
  const { error } = await supabase
    .from("candidates")
    .update({ invite_status: status })
    .eq("id", candidateId);
  if (error) throw new JobsDataError("set invite status", error);
}
