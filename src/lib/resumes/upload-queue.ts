import { RESUME_LIMITS } from "@/lib/config";

export type ItemStage = "queued" | "running" | "waiting" | "done" | "failed";

export type QueueItem<T> = {
  id: string;
  payload: T;
  stage: ItemStage;
  /** What a running item is doing right now, as reported by the worker. */
  detail: string | null;
  /** The failure reason, or why a waiting item is waiting. */
  message: string | null;
  /** How many times the worker has been started for the current run of this item. */
  attempts: number;
  /** A failure that trying again cannot fix: no Retry for it, and "retry all failed" skips it. */
  final: boolean;
};

export type QueueProgress = {
  total: number;
  done: number;
  failed: number;
  queued: number;
  running: number;
  waiting: number;
};

export type QueueState<T> = {
  items: readonly QueueItem<T>[];
  progress: QueueProgress;
};

/** What a worker reports for one attempt on one item. */
export type Outcome =
  | { kind: "done" }
  | { kind: "failed"; message: string; final?: boolean }
  | { kind: "retry"; message: string; retryAfterMs?: number };

export type WorkerContext = {
  report: (detail: string) => void;
  /** Aborted when the queue is stopped; the worker passes it to every request. */
  signal: AbortSignal;
};

export type QueueOptions<T> = {
  limit: number;
  worker: (payload: T, context: WorkerContext) => Promise<Outcome>;
  maxAttempts?: number;
  baseMs?: number;
  capMs?: number;
  maxRetryAfterMs?: number;
  /** Runs `callback` after `ms`. Injected so tests control time. */
  schedule?: (callback: () => void, ms: number) => unknown;
  cancelSchedule?: (handle: unknown) => void;
  random?: () => number;
};

export const WORKER_CRASHED_MESSAGE = "Something went wrong. Try again.";

/**
 * Delay before the next attempt: `Retry-After` when the server gave one,
 * otherwise exponential back-off with jitter, capped.
 */
export function backoffDelay(
  failures: number,
  options: {
    retryAfterMs?: number;
    random: () => number;
    baseMs: number;
    capMs: number;
    maxRetryAfterMs: number;
  },
): number {
  if (options.retryAfterMs !== undefined) {
    return Math.min(Math.max(options.retryAfterMs, 0), options.maxRetryAfterMs);
  }
  const exponential = options.baseMs * 2 ** Math.max(failures - 1, 0);
  const jittered = exponential * (0.75 + options.random() * 0.5);
  return Math.min(Math.round(jittered), options.capMs);
}

/**
 * A pure upload queue. It starts items in the order they were added, never
 * runs more than `limit` at once, lets one item fail without stopping the
 * others, and retries items the worker marks `retry` after a back-off.
 * It has no DOM or network code; the worker does the real work.
 *
 * `stop()` is for when the page goes away: it starts nothing new, aborts the
 * signal given to running workers and cancels waiting retries. `start()`
 * undoes it (React may run an effect's cleanup and setup again).
 */
export function createUploadQueue<T>(options: QueueOptions<T>) {
  const {
    limit,
    worker,
    maxAttempts = RESUME_LIMITS.retry.maxAttempts,
    baseMs = RESUME_LIMITS.retry.baseMs,
    capMs = RESUME_LIMITS.retry.capMs,
    maxRetryAfterMs = RESUME_LIMITS.retry.maxRetryAfterMs,
    schedule = (callback, ms) => setTimeout(callback, ms),
    cancelSchedule = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    random = Math.random,
  } = options;

  let items: QueueItem<T>[] = [];
  let nextId = 0;
  let running = 0;
  let stopped = false;
  /** Raised by every `start()`: the outcome of a worker started before it is stale and ignored. */
  let generation = 0;
  let controller = new AbortController();
  let state: QueueState<T> = { items, progress: progressOf(items) };
  const timers = new Map<string, unknown>();
  const listeners = new Set<() => void>();

  function progressOf(list: readonly QueueItem<T>[]): QueueProgress {
    const count = (stage: ItemStage) => list.filter((item) => item.stage === stage).length;
    return {
      total: list.length,
      done: count("done"),
      failed: count("failed"),
      queued: count("queued"),
      running: count("running"),
      waiting: count("waiting"),
    };
  }

  function commit(next: QueueItem<T>[]) {
    items = next;
    state = { items, progress: progressOf(items) };
    for (const listener of listeners) listener();
  }

  function update(id: string, changes: Partial<QueueItem<T>>) {
    commit(items.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }

  function pump() {
    while (!stopped && running < limit) {
      const next = items.find((item) => item.stage === "queued");
      if (!next) return;
      void run(next);
    }
  }

  async function run(item: QueueItem<T>) {
    running += 1;
    const mine = generation;
    const attempts = item.attempts + 1;
    update(item.id, { stage: "running", detail: null, message: null, attempts, final: false });

    let outcome: Outcome;
    try {
      outcome = await worker(item.payload, {
        report: (detail) => {
          if (!stopped && mine === generation) update(item.id, { detail });
        },
        signal: controller.signal,
      });
    } catch {
      outcome = { kind: "failed", message: WORKER_CRASHED_MESSAGE };
    }
    running -= 1;
    if (stopped || mine !== generation) {
      // A run from before the last `start()`: its outcome is ignored, but the slot it
      // held is free now, and nothing else would start the items waiting for it.
      pump();
      return;
    }

    if (outcome.kind === "done") {
      update(item.id, { stage: "done", detail: null, message: null });
    } else if (outcome.kind === "failed") {
      update(item.id, {
        stage: "failed",
        detail: null,
        message: outcome.message,
        final: outcome.final === true,
      });
    } else if (attempts >= maxAttempts) {
      update(item.id, { stage: "failed", detail: null, message: outcome.message });
    } else {
      update(item.id, { stage: "waiting", detail: null, message: outcome.message });
      const delay = backoffDelay(attempts, {
        retryAfterMs: outcome.retryAfterMs,
        random,
        baseMs,
        capMs,
        maxRetryAfterMs,
      });
      timers.set(
        item.id,
        schedule(() => {
          timers.delete(item.id);
          update(item.id, { stage: "queued", message: null });
          pump();
        }, delay),
      );
    }
    pump();
  }

  return {
    getState: () => state,

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Adds items at the end and starts what fits. Finished items from an earlier batch are dropped once the queue is idle. */
    add(payloads: readonly T[]): string[] {
      const idle = state.progress.queued + state.progress.running + state.progress.waiting === 0;
      const kept = idle ? items.filter((item) => item.stage === "failed") : items;
      const added = payloads.map((payload): QueueItem<T> => ({
        id: `item-${nextId++}`,
        payload,
        stage: "queued",
        detail: null,
        message: null,
        attempts: 0,
        final: false,
      }));
      commit([...kept, ...added]);
      pump();
      return added.map((item) => item.id);
    },

    /** Starts a failed item again from its first attempt. */
    retry(id: string) {
      const item = items.find((candidate) => candidate.id === id);
      if (item?.stage !== "failed" || item.final) return;
      update(id, { stage: "queued", message: null, attempts: 0 });
      pump();
    },

    retryAllFailed() {
      commit(
        items.map((item) =>
          item.stage === "failed" && !item.final
            ? { ...item, stage: "queued", message: null, attempts: 0 }
            : item,
        ),
      );
      pump();
    },

    /** Removes an item that is not running. Returns whether it was removed. */
    remove(id: string): boolean {
      const item = items.find((candidate) => candidate.id === id);
      if (!item || item.stage === "running") return false;
      const timer = timers.get(id);
      if (timer !== undefined) {
        cancelSchedule(timer);
        timers.delete(id);
      }
      commit(items.filter((candidate) => candidate.id !== id));
      return true;
    },

    /** Removes items that have not started yet. Returns how many. */
    cancelQueued(): number {
      const cancelled = items.filter((item) => item.stage === "queued" && item.attempts === 0);
      if (cancelled.length > 0) {
        commit(items.filter((item) => !(item.stage === "queued" && item.attempts === 0)));
      }
      return cancelled.length;
    },

    /** Starts nothing new, aborts running workers and cancels waiting retries. */
    stop() {
      stopped = true;
      controller.abort();
      for (const timer of timers.values()) cancelSchedule(timer);
      timers.clear();
    },

    /** Allows the queue to run again after `stop()`. */
    start() {
      if (!stopped) return;
      stopped = false;
      generation += 1;
      controller = new AbortController();
      commit(
        items.map((item) =>
          item.stage === "running" || item.stage === "waiting"
            ? { ...item, stage: "queued", detail: null, message: null }
            : item,
        ),
      );
      pump();
    },
  };
}

export type UploadQueue<T> = ReturnType<typeof createUploadQueue<T>>;
