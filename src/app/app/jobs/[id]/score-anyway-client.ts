import { z } from "zod";

/**
 * The browser side of "Score anyway": one call that sets the override and runs
 * the analysis, so it takes seconds. Every response body is checked with Zod;
 * nothing here imports server code.
 */

const okSchema = z.object({
  data: z.object({ status: z.enum(["scored", "ats_failed", "not_extracted", "failed"]) }),
});
const errorSchema = z.object({ error: z.object({ message: z.string().trim().min(1) }) });

/** Shown when the score-anyway request fails for a reason other than a busy model service. */
export const SCORE_ANYWAY_FAILED_MESSAGE = "Could not score this resume. Try again in a moment.";
/** Shown when the model service reports it is busy. */
export const SCORE_ANYWAY_BUSY_MESSAGE = "The AI service is busy. Try again in a moment.";

/** What the page should tell the recruiter after a score-anyway attempt, and whether to reload its data. */
export type ScoreAnywayOutcome = {
  /** `done`: scored. `notice`: the page changed but the resume was not scored. `error`: nothing changed. */
  kind: "done" | "notice" | "error";
  message: string;
  /** The server state changed (or the page is stale), so the page should reload its data. */
  refresh: boolean;
};

/**
 * What to tell the recruiter about one score-anyway response.
 *
 * - 200 `scored`: the resume is now a ranked candidate.
 * - 200 with any other status: the override is saved but there is no score, so
 *   the resume waits under "Queued for scoring" and Analyze picks it up.
 * - 409: the server's reason (already scored, or not set aside); the list is stale.
 * - 503 (the model is busy) and everything else: nothing to reload, try again.
 */
export async function scoreAnywayOutcome(
  response: Response,
  fileName: string,
): Promise<ScoreAnywayOutcome> {
  if (response.status === 503) {
    return { kind: "error", message: SCORE_ANYWAY_BUSY_MESSAGE, refresh: false };
  }
  const body: unknown = await response.json().catch(() => null);
  if (response.status === 409) {
    const parsed = errorSchema.safeParse(body);
    return parsed.success
      ? { kind: "notice", message: `${fileName}: ${parsed.data.error.message}`, refresh: true }
      : { kind: "error", message: SCORE_ANYWAY_FAILED_MESSAGE, refresh: false };
  }
  const parsed = response.ok ? okSchema.safeParse(body) : null;
  if (!parsed?.success) {
    return { kind: "error", message: SCORE_ANYWAY_FAILED_MESSAGE, refresh: false };
  }
  if (parsed.data.data.status === "scored") {
    return {
      kind: "done",
      message: `${fileName} was scored. It is now on the Ranked tab.`,
      refresh: true,
    };
  }
  const why =
    parsed.data.data.status === "not_extracted"
      ? "has no readable text yet, so it was not scored"
      : "was not scored: the analysis failed";
  return {
    kind: "notice",
    message: `${fileName} ${why}. It is listed under Queued for scoring on the Ranked tab.`,
    refresh: true,
  };
}

/** POST /api/resumes/[id]/score-anyway. A network failure is an ordinary error outcome. */
export async function requestScoreAnyway(
  resumeId: string,
  fileName: string,
): Promise<ScoreAnywayOutcome> {
  try {
    const response = await fetch(`/api/resumes/${encodeURIComponent(resumeId)}/score-anyway`, {
      method: "POST",
    });
    return await scoreAnywayOutcome(response, fileName);
  } catch {
    return { kind: "error", message: SCORE_ANYWAY_FAILED_MESSAGE, refresh: false };
  }
}
