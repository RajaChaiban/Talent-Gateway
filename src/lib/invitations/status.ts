import { INVITE_LIMITS } from "@/lib/config";

/** Where a candidate's invitation stands. NONE means no invitation row exists yet. */
export type InviteStatus = "NONE" | "APPROVED" | "SENT" | "FAILED";

/**
 * True when an approval that has not been sent or failed is old enough to be
 * a send that died part-way (see `INVITE_LIMITS.staleApprovalMs`). An
 * unreadable date counts as stale, so a bad value can never block a retry
 * for good.
 */
export function isStaleApproval(approvedAt: string, now: Date): boolean {
  const approved = Date.parse(approvedAt);
  return Number.isNaN(approved) || now.getTime() - approved >= INVITE_LIMITS.staleApprovalMs;
}

/**
 * The status an invitation row stands for: `sent_at` set is SENT, an error
 * recorded is FAILED, anything else is a send that was approved and has not
 * finished.
 *
 * DECISION: the invitation row, not `candidates.invite_status`, decides what
 * happens next. The row is written first at every step, so a request that died
 * between the two writes leaves the row telling the truth.
 */
export function invitationStatus(row: {
  sent_at: string | null;
  error: string | null;
}): Exclude<InviteStatus, "NONE"> {
  if (row.sent_at !== null) return "SENT";
  return row.error !== null ? "FAILED" : "APPROVED";
}
