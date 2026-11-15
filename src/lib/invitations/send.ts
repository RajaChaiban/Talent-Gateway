/** What a mail provider needs to deliver one invitation. */
type InvitationEmail = {
  to: string;
  subject: string;
  text: string;
  /** The invitation id. A provider that honours it delivers a repeated request once. */
  idempotencyKey: string;
};

export type SendInvitationEmail = (email: InvitationEmail) => Promise<string>;

/**
 * The one place an invitation email is delivered. Returns the message id, or
 * throws when the email could not be sent.
 *
 * DECISION: this version is a stand-in outbox. It delivers nothing and returns
 * `outbox:<invitation id>`, so the whole approval flow runs without a mail
 * account or a sending domain, and no test or demo can mail a real person.
 * A real provider replaces the body of this function only; its callers stay.
 */
export async function sendInvitationEmail(email: InvitationEmail): Promise<string> {
  return `outbox:${email.idempotencyKey}`;
}
