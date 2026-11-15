import { ModelBusyError } from "@/lib/ai/errors";
import { jsonError } from "@/lib/http";
import { failureResponse, SERVER_ERROR_MESSAGE } from "@/lib/jobs/api";
import type { ServerClient } from "@/lib/auth/verified-user";
import { getJob, JobsDataError } from "@/lib/jobs/queries";
import { logServerError } from "@/lib/log";
import { resumeNotFoundResponse } from "@/lib/resumes/api";
import { settleJob } from "./queries";

export { resumeNotFoundResponse };
/** The 409 message of score-anyway for a resume that already has a candidate. */
export const ALREADY_SCORED_MESSAGE = "This resume has already been scored.";
/** The 409 message of score-anyway for a resume the ATS check did not set aside. */
export const NOT_SET_ASIDE_MESSAGE = "This resume was not set aside.";
const MODEL_BUSY_MESSAGE = "The AI service is busy. Trying again shortly.";

/**
 * After a per-resume call: settles the resume's job (see `settleJob`), so a run
 * the browser abandoned still ends DONE or ERROR. A failure here is logged and
 * does not change the resume's answer, which is already saved.
 */
export async function settleAfterResume(supabase: ServerClient, jobId: string): Promise<void> {
  try {
    const job = await getJob(supabase, jobId);
    if (job) await settleJob(supabase, job);
  } catch (error) {
    logServerError("Settling the job after a resume failed", error);
  }
}

/**
 * A screening route's failure as a response: a gateway rate limit is a
 * retryable 503 `model_busy` with Retry-After, a database failure a 500
 * (through the jobs helper), anything else is logged once without request data
 * and is a 500.
 */
export function screeningFailureResponse(error: unknown): Response {
  if (error instanceof ModelBusyError) {
    return jsonError("model_busy", MODEL_BUSY_MESSAGE, 503, {
      "Retry-After": String(error.retryAfterSeconds),
    });
  }
  if (error instanceof JobsDataError) return failureResponse(error);
  logServerError("Screening route failed", error);
  return jsonError("server_error", SERVER_ERROR_MESSAGE, 500);
}
