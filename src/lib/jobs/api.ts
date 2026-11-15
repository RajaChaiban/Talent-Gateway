import { jsonError } from "@/lib/http";
import { logServerError } from "@/lib/log";
import { JobsDataError } from "./queries";

/** Message of the 400 response for a body that is not JSON. */
export const INVALID_JSON_MESSAGE = "Request body must be valid JSON";
/** Message of the 404 response for an unknown job. */
export const NOT_FOUND_MESSAGE = "Job not found";
/** Message of the 500 response. It never carries database details. */
export const SERVER_ERROR_MESSAGE = "Something went wrong. Try again in a moment.";

/** The parsed request body, or the 400 response to return. */
export type JsonBody = { ok: true; value: unknown } | { ok: false; response: Response };

/** Parses the request body as JSON. A body that is not valid JSON gives a ready 400 response instead of throwing. */
export async function readJsonBody(request: Request): Promise<JsonBody> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return {
      ok: false,
      response: jsonError("invalid_input", INVALID_JSON_MESSAGE, 400),
    };
  }
}

/** The 404 response for a job that does not exist or is not visible to the recruiter. */
export function notFoundResponse(): Response {
  return jsonError("not_found", NOT_FOUND_MESSAGE, 404);
}

/**
 * Database failures become a 500 with a safe message; anything else is rethrown.
 *
 * DECISION: the database error is logged, never sent. Its text can name
 * tables, columns or the values that were sent, which the browser has no use
 * for and an attacker could.
 */
export function failureResponse(error: unknown): Response {
  if (error instanceof JobsDataError) {
    logServerError(error.message, error);
    return jsonError("server_error", SERVER_ERROR_MESSAGE, 500);
  }
  throw error;
}
