import { jsonError } from "@/lib/http";
import { logServerError } from "@/lib/log";
import { failureResponse as jobsFailureResponse, SERVER_ERROR_MESSAGE } from "@/lib/jobs/api";
import { STORAGE_BUSY_MESSAGE } from "./messages";
import { ResumesDataError, StorageUnavailableError } from "./queries";

/** The message of the 404 for a resume that does not exist or that row-level security hides from the signed-in recruiter. */
export const RESUME_NOT_FOUND_MESSAGE = "Resume not found";
const STORAGE_RETRY_AFTER_SECONDS = 2;

/** The 404 `not_found` response for a missing resume. */
export function resumeNotFoundResponse(): Response {
  return jsonError("not_found", RESUME_NOT_FOUND_MESSAGE, 404);
}

/** Database and storage failures become a 500 with a safe message; anything else is rethrown. */
export function failureResponse(error: unknown): Response {
  if (error instanceof ResumesDataError) {
    logServerError(error.message, error);
    return jsonError("server_error", SERVER_ERROR_MESSAGE, 500);
  }
  if (error instanceof StorageUnavailableError) {
    logServerError(error.message, error);
    return jsonError("storage_unavailable", STORAGE_BUSY_MESSAGE, 503, {
      "Retry-After": String(STORAGE_RETRY_AFTER_SECONDS),
    });
  }
  return jobsFailureResponse(error);
}
