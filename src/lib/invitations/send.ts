import { INVITE_LIMITS } from "@/lib/config";

/** What a mail provider needs to deliver one invitation. */
type InvitationEmail = {
  to: string;
  subject: string;
  text: string;
  /** The invitation id. The provider delivers a repeated request with the same key once. */
  idempotencyKey: string;
};

/** Delivers one invitation and resolves to the message id. Callers receive it as a parameter so tests can pass a stand-in. */
export type SendInvitationEmail = (email: InvitationEmail) => Promise<string>;

type EnvSource = Readonly<Record<string, string | undefined>>;

const RESEND_EMAILS_URL = "https://api.resend.com/emails";

/** The id Resend gave the email, or a short reason it could not be read. Never the API key. */
async function readResendReply(response: Response): Promise<{ id?: string; reason: string }> {
  const body: unknown = await response.json().catch(() => null);
  if (typeof body !== "object" || body === null) return { reason: `status ${response.status}` };
  const { id, name, message } = body as { id?: unknown; name?: unknown; message?: unknown };
  const detail = [name, message].filter((part) => typeof part === "string").join(": ");
  return {
    id: typeof id === "string" ? id : undefined,
    reason: detail ? `status ${response.status}, ${detail}` : `status ${response.status}`,
  };
}

/**
 * The one place an invitation email is delivered. Returns the message id, or
 * throws when the email could not be sent.
 *
 * DECISION: email delivery stays outside this app. With `RESEND_API_KEY` set,
 * the email goes to Resend in one HTTPS request (no mail library, and the
 * request fits a short function call). Without the key this is a stand-in
 * outbox: nothing is delivered and the id is `outbox:<invitation id>`, so
 * tests and a setup with no mail account still run the whole approval flow.
 * Swapping the provider means changing this function only; its callers stay.
 *
 * DECISION: `INVITE_REDIRECT_TO` delivers every invitation to one inbox and
 * puts the approved address in the subject. Sample resumes carry made-up
 * addresses, and a provider's test sender may only deliver to its account
 * owner, so a demo can show a real email arriving without mailing a stranger.
 * The invitation row still records the address the recruiter approved.
 */
export async function sendInvitationEmail(
  email: InvitationEmail,
  env: EnvSource = process.env,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return `outbox:${email.idempotencyKey}`;

  const from = env.INVITE_FROM_EMAIL;
  if (!from) throw new Error("INVITE_FROM_EMAIL is not set, so the invitation has no sender");

  const redirectTo = env.INVITE_REDIRECT_TO;
  const response = await fetcher(RESEND_EMAILS_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "idempotency-key": email.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [redirectTo || email.to],
      subject: redirectTo ? `[to: ${email.to}] ${email.subject}` : email.subject,
      text: email.text,
    }),
    signal: AbortSignal.timeout(INVITE_LIMITS.sendTimeoutMs),
  });

  const reply = await readResendReply(response);
  if (!response.ok || !reply.id) {
    throw new Error(`The mail provider did not accept the invitation (${reply.reason})`);
  }
  return reply.id;
}
