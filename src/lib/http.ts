export type ErrorCode =
  | "unauthorized"
  | "auth_unavailable"
  | "forbidden"
  | "invalid_input"
  | "not_found"
  | "server_error";

/** The one shape every route handler error takes: `{ error: { code, message } }`. */
export function jsonError(code: ErrorCode, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

export function jsonData<T>(data: T, status = 200): Response {
  return Response.json({ data }, { status });
}
