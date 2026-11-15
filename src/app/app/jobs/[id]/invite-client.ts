import { z } from "zod";

/**
 * The browser side of "Invite to interview": one call to
 * `POST /api/candidates/[id]/invite`. Every response body is checked with Zod;
 * nothing here imports server code.
 */

const okSchema = z.object({
  data: z.object({ invite_status: z.enum(["APPROVED", "SENT", "FAILED"]) }),
});
const errorSchema = z.object({ error: z.object({ message: z.string().trim().min(1) }) });

const INVITE_FAILED_MESSAGE = "Could not send the invitation. Try again in a moment.";

/** Statuses whose server message tells the recruiter what happened: bad address, send in progress, send failed. */
const MESSAGE_STATUSES = new Set([400, 409, 502]);
/** Statuses after which the server state changed (or the page is stale), so the page reloads its data. */
const REFRESH_STATUSES = new Set([409, 502]);

type InviteRequestOutcome =
  | { ok: true }
  | { ok: false; message: string; refresh: boolean };

/** What to tell the recruiter about one invite response. */
async function inviteOutcome(response: Response): Promise<InviteRequestOutcome> {
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) {
    return okSchema.safeParse(body).success
      ? { ok: true }
      : { ok: false, message: INVITE_FAILED_MESSAGE, refresh: true };
  }
  const parsed = errorSchema.safeParse(body);
  const message =
    MESSAGE_STATUSES.has(response.status) && parsed.success
      ? parsed.data.error.message
      : INVITE_FAILED_MESSAGE;
  return { ok: false, message, refresh: REFRESH_STATUSES.has(response.status) };
}

/** POST /api/candidates/[id]/invite. A network failure is an ordinary error outcome. */
export async function requestInvite(
  candidateId: string,
  email: string,
): Promise<InviteRequestOutcome> {
  try {
    const response = await fetch(`/api/candidates/${encodeURIComponent(candidateId)}/invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return await inviteOutcome(response);
  } catch {
    return { ok: false, message: INVITE_FAILED_MESSAGE, refresh: false };
  }
}
