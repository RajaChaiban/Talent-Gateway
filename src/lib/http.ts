/** Every error code a route handler may put in its error body. docs/BACKEND.md says what each one means. */
export type ErrorCode =
  | "unauthorized"
  | "auth_unavailable"
  | "forbidden"
  | "invalid_input"
  | "not_found"
  | "conflict"
  | "unsupported_media_type"
  | "payload_too_large"
  | "storage_unavailable"
  | "model_busy"
  | "email_failed"
  | "server_error";

/**
 * The one shape every route handler error takes: `{ error: { code, message } }`.
 * `headers` adds headers such as Retry-After.
 */
export function jsonError(
  code: ErrorCode,
  message: string,
  status: number,
  headers?: HeadersInit,
): Response {
  return Response.json({ error: { code, message } }, { status, headers });
}

/** The one shape every successful route handler answer takes: `{ data }`, with the given status (200 unless told otherwise). */
export function jsonData<T>(data: T, status = 200): Response {
  return Response.json({ data }, { status });
}
