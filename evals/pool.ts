/** Runs `work` over `items` with at most `limit` in flight; results keep the order of `items`. */
export async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** How `withRetry` decides to retry and how long it waits. */
export type RetryOptions = {
  /** Attempts in all, the first included. */
  attempts: number;
  /** Seconds to wait before retrying `error`, or null when it is not retryable. */
  retryAfter: (error: unknown) => number | null;
  /** First back-off in milliseconds; doubles each attempt, and is never shorter than the error's own wait. */
  baseMs: number;
  sleep: (ms: number) => Promise<void>;
};

/** Calls `call` until it succeeds, retrying only the errors `retryAfter` accepts; the last error is thrown. */
export async function withRetry<T>(call: () => Promise<T>, options: RetryOptions): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      const seconds = options.retryAfter(error);
      if (seconds === null || attempt >= options.attempts) throw error;
      await options.sleep(Math.max(seconds * 1000, options.baseMs * 2 ** (attempt - 1)));
    }
  }
}
