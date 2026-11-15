import type { SaveOutcome } from "@/lib/jobs/save-sequencer";
import type { Score } from "@/lib/score";

/** Statuses whose server message tells the recruiter what to do; any other failure uses the generic "could not save" text. */
const MESSAGE_STATUSES = new Set([401, 403, 404]);

function errorMessage(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("error" in body)) return undefined;
  const { error } = body;
  if (typeof error !== "object" || error === null || !("message" in error)) return undefined;
  return typeof error.message === "string" ? error.message : undefined;
}

/**
 * Sends one or both thresholds, on the 0 to 10 scale, to `PATCH /api/jobs/[id]`.
 * Never throws for an HTTP error: the outcome says whether it was stored.
 */
export async function saveThresholds(
  jobId: string,
  thresholds: Partial<Record<"top_talent_threshold" | "invite_threshold", Score>>,
): Promise<SaveOutcome> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(thresholds),
  });
  if (response.ok) return { ok: true };
  if (!MESSAGE_STATUSES.has(response.status)) return { ok: false };

  const body: unknown = await response.json().catch(() => null);
  return { ok: false, message: errorMessage(body) };
}
