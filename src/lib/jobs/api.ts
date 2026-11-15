import { jsonError } from "@/lib/http";
import { logServerError } from "@/lib/log";
import { JobsDataError } from "./queries";

export const INVALID_JSON_MESSAGE = "Request body must be valid JSON";
export const NOT_FOUND_MESSAGE = "Job not found";
export const SERVER_ERROR_MESSAGE = "Something went wrong. Try again in a moment.";

export type JsonBody = { ok: true; value: unknown } | { ok: false; response: Response };

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
