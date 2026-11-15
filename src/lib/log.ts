function postgresCode(error: unknown): string | undefined {
  const sources: unknown[] = [error, error instanceof Error ? error.cause : undefined];
  for (const source of sources) {
    if (typeof source === "object" && source !== null && "code" in source) {
      const { code } = source;
      if (typeof code === "string" && code.length <= 16) return code;
    }
  }
  return undefined;
}

/**
 * The one place server code writes an error to the log. It records a short
 * message and the Postgres error code, never the error text itself, which
 * can echo request data.
 */
export function logServerError(message: string, error: unknown): void {
  const code = postgresCode(error);
  console.error(code ? `${message} (code ${code})` : message);
}
