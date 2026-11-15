/** Seconds the client waits when the gateway says "too many requests" without a usable Retry-After. */
export const DEFAULT_RETRY_AFTER_SECONDS = 5;
const MAX_RETRY_AFTER_SECONDS = 60;

/** The gateway rate-limited the call. Retryable: the resume is not marked failed. */
export class ModelBusyError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("The model gateway is rate limiting requests");
    this.name = "ModelBusyError";
  }
}

type Fields = {
  statusCode?: unknown;
  name?: unknown;
  type?: unknown;
  responseHeaders?: unknown;
  cause?: unknown;
  errors?: unknown;
  lastError?: unknown;
};

function fields(value: unknown): Fields | null {
  return typeof value === "object" && value !== null ? (value as Fields) : null;
}

/** The error itself, its causes, and every attempt a RetryError wrapped. */
function chain(error: unknown): unknown[] {
  const seen: unknown[] = [];
  const queue: unknown[] = [error];
  while (queue.length > 0 && seen.length < 20) {
    const next = queue.shift();
    const f = fields(next);
    if (!f || seen.includes(next)) continue;
    seen.push(next);
    queue.push(f.cause, f.lastError, ...(Array.isArray(f.errors) ? f.errors : []));
  }
  return seen;
}

function isRateLimitError(f: Fields): boolean {
  return f.statusCode === 429 || f.name === "GatewayRateLimitError" || f.type === "rate_limit_exceeded";
}

function retryAfterOf(errors: readonly unknown[]): number | null {
  for (const error of errors) {
    const headers = fields(fields(error)?.responseHeaders);
    const raw = headers ? (headers as Record<string, unknown>)["retry-after"] : undefined;
    const seconds = typeof raw === "string" ? Number(raw) : NaN;
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(MAX_RETRY_AFTER_SECONDS, Math.max(1, Math.ceil(seconds)));
    }
  }
  return null;
}

/**
 * When a model call failed because the gateway rate-limited it (HTTP 429, a
 * GatewayRateLimitError, or a RetryError whose attempts were), the seconds to
 * wait before trying again; otherwise null.
 */
export function rateLimitRetryAfter(error: unknown): number | null {
  const errors = chain(error);
  const limited = errors.some((item) => {
    const f = fields(item);
    return f !== null && isRateLimitError(f);
  });
  if (!limited) return null;
  return retryAfterOf(errors) ?? DEFAULT_RETRY_AFTER_SECONDS;
}
