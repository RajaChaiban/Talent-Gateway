/**
 * The browser's Analyze queue: a small pure module with no DOM or React, so
 * it is unit tested without a browser. It runs at most `concurrency` resumes
 * at once (a resume waiting to retry keeps its slot), retries a busy answer
 * (429 or 503, or a network error) with back-off that honours Retry-After,
 * and stops starting work once `stop()` is called.
 */

export type ServerStatus = "scored" | "ats_failed" | "not_extracted" | "failed";

/** What one attempt at one resume came back with. */
export type AttemptResult =
  | { kind: "ok"; status: ServerStatus }
  /** Busy (429 / 503) or the network failed; `retryAfterMs` from Retry-After when given. */
  | { kind: "retry"; retryAfterMs: number | null }
  /** Any other failure: not retried automatically. */
  | { kind: "error" };

/** Where a resume is in the queue: waiting for a slot, running, waiting to retry, or finished. */
export type ItemState = "queued" | "running" | "waiting" | "done" | "failed";

/** One resume in the queue: its state, how many attempts were made, and the status the server last gave. */
export type QueueItem = {
  id: string;
  state: ItemState;
  attempts: number;
  status: ServerStatus | null;
};

/** A copy of the queue's items and counts, safe for the page to hold. */
export type QueueSnapshot = {
  items: readonly QueueItem[];
  total: number;
  /** Finished, successfully or not. */
  finished: number;
  failed: number;
  /** Requests started and not yet answered: never more than `concurrency`. */
  inFlight: number;
  waiting: number;
  active: boolean;
};

/** Settings for `createAnalyzeQueue`. `run` makes one attempt at one resume; `sleep` and `random` are replaced in tests. */
export type QueueOptions = {
  run: (id: string, signal: AbortSignal) => Promise<AttemptResult>;
  concurrency: number;
  maxAttempts: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  onChange?: (snapshot: QueueSnapshot) => void;
  /** Waits `ms` or until `signal` aborts. Replaced in tests. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** 0 to 1, for jitter. Replaced in tests. */
  random?: () => number;
};

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

/**
 * The wait before attempt `attempt + 1`: Retry-After when the server sent one,
 * otherwise exponential back-off from `base` with jitter (50 to 100 % of the
 * step); never more than `max`.
 */
export function backoffDelay(
  attempt: number,
  retryAfterMs: number | null,
  options: { base: number; max: number; random: () => number },
): number {
  if (retryAfterMs !== null) return Math.min(options.max, Math.max(0, retryAfterMs));
  const step = Math.min(options.max, options.base * 2 ** Math.max(0, attempt - 1));
  return Math.round(step * (0.5 + options.random() / 2));
}

/** Makes the queue. `run(ids)` resolves when every id has finished or the queue was stopped; `stop()` aborts what is in flight; `snapshot()` reads the current state. */
export function createAnalyzeQueue(options: QueueOptions) {
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const controller = new AbortController();
  const items: QueueItem[] = [];
  let inFlight = 0;
  let idleWaiters: (() => void)[] = [];

  function snapshot(): QueueSnapshot {
    const count = (state: ItemState) => items.filter((item) => item.state === state).length;
    const finished = count("done") + count("failed");
    return {
      items: items.map((item) => ({ ...item })),
      total: items.length,
      finished,
      failed: count("failed"),
      inFlight,
      waiting: count("waiting"),
      active: finished < items.length && !controller.signal.aborted,
    };
  }

  function emit() {
    options.onChange?.(snapshot());
  }

  function settleIfIdle() {
    const busy = items.some((item) => item.state === "running" || item.state === "waiting");
    const queued = items.some((item) => item.state === "queued");
    if (busy || (queued && !controller.signal.aborted)) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  async function attempt(item: QueueItem): Promise<AttemptResult> {
    inFlight += 1;
    emit();
    try {
      return await options.run(item.id, controller.signal);
    } catch {
      return { kind: "retry", retryAfterMs: null };
    } finally {
      inFlight -= 1;
    }
  }

  async function work(item: QueueItem) {
    item.state = "running";
    for (;;) {
      item.attempts += 1;
      const result = await attempt(item);
      if (controller.signal.aborted) {
        item.state = "queued";
        return;
      }
      if (result.kind === "ok") {
        item.status = result.status;
        item.state = result.status === "failed" ? "failed" : "done";
        return;
      }
      if (result.kind === "error" || item.attempts >= options.maxAttempts) {
        item.state = "failed";
        return;
      }
      item.state = "waiting";
      emit();
      await sleep(
        backoffDelay(item.attempts, result.retryAfterMs, {
          base: options.backoffBaseMs,
          max: options.backoffMaxMs,
          random,
        }),
        controller.signal,
      );
      if (controller.signal.aborted) {
        item.state = "queued";
        return;
      }
      item.state = "running";
    }
  }

  function slotsInUse(): number {
    return items.filter((item) => item.state === "running" || item.state === "waiting").length;
  }

  function pump() {
    while (!controller.signal.aborted && slotsInUse() < options.concurrency) {
      const next = items.find((item) => item.state === "queued");
      if (!next) break;
      void work(next).then(() => {
        emit();
        pump();
      });
    }
    emit();
    settleIfIdle();
  }

  function whenIdle(): Promise<QueueSnapshot> {
    return new Promise((resolve) => {
      idleWaiters.push(() => resolve(snapshot()));
      settleIfIdle();
    });
  }

  return {
    /**
     * Queues `ids` and resolves when everything has finished or the queue
     * stopped. An id seen before is queued again only if it failed ("Retry
     * failed"); one that finished or is still running is not repeated.
     */
    run(ids: readonly string[]): Promise<QueueSnapshot> {
      const known = new Set(items.map((item) => item.id));
      for (const id of ids) {
        if (!known.has(id)) items.push({ id, state: "queued", attempts: 0, status: null });
        else {
          const item = items.find((existing) => existing.id === id);
          if (item && item.state === "failed") Object.assign(item, { state: "queued", attempts: 0 });
        }
      }
      const done = whenIdle();
      pump();
      return done;
    },
    /** Starts nothing new and aborts the requests in flight. */
    stop() {
      controller.abort();
      settleIfIdle();
    },
    snapshot,
  };
}
