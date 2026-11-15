import { describe, expect, it } from "vitest";
import {
  backoffDelay,
  createUploadQueue,
  WORKER_CRASHED_MESSAGE,
  type Outcome,
} from "./upload-queue";

type Deferred = { resolve: (outcome: Outcome) => void; name: string };

/** A queue whose worker waits until the test settles each item, and whose clock is manual. */
function harness(over: { limit?: number; maxAttempts?: number } = {}) {
  const started: string[] = [];
  const pending = new Map<string, Deferred>();
  const timers: { callback: () => void; ms: number; cancelled: boolean }[] = [];
  let inFlight = 0;
  let peak = 0;

  const queue = createUploadQueue<string>({
    limit: over.limit ?? 3,
    maxAttempts: over.maxAttempts,
    random: () => 0.5,
    schedule: (callback, ms) => {
      const timer = { callback, ms, cancelled: false };
      timers.push(timer);
      return timer;
    },
    cancelSchedule: (handle) => {
      (handle as { cancelled: boolean }).cancelled = true;
    },
    worker: (name, { report }) => {
      started.push(name);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      report("uploading");
      return new Promise<Outcome>((resolve) => {
        pending.set(name, {
          name,
          resolve: (outcome) => {
            inFlight -= 1;
            resolve(outcome);
          },
        });
      });
    },
  });

  const settle = async (name: string, outcome: Outcome) => {
    const entry = pending.get(name);
    if (!entry) throw new Error(`${name} is not running`);
    pending.delete(name);
    entry.resolve(outcome);
    await Promise.resolve();
    await Promise.resolve();
  };
  const fireTimers = () => {
    for (const timer of timers.splice(0)) if (!timer.cancelled) timer.callback();
  };
  const stages = () => queue.getState().items.map((item) => `${item.payload}:${item.stage}`);

  return { queue, started, settle, timers, fireTimers, stages, peak: () => peak };
}

const names = (count: number) => Array.from({ length: count }, (_, i) => `f${i}`);

describe("createUploadQueue", () => {
  it("never runs more than the limit at once and starts in drop order", async () => {
    const h = harness();
    h.queue.add(names(10));
    expect(h.started).toEqual(["f0", "f1", "f2"]);

    for (let i = 0; i < 10; i += 1) {
      await h.settle(`f${i}`, { kind: "done" });
    }

    expect(h.started).toEqual(names(10));
    expect(h.peak()).toBe(3);
    expect(h.queue.getState().progress).toMatchObject({ total: 10, done: 10, failed: 0 });
  });

  it("lets one item fail without stopping the others", async () => {
    const h = harness();
    h.queue.add(names(5));
    await h.settle("f0", { kind: "failed", message: "bad file" });
    await h.settle("f1", { kind: "done" });
    await h.settle("f2", { kind: "done" });
    await h.settle("f3", { kind: "done" });
    await h.settle("f4", { kind: "done" });

    expect(h.stages()).toEqual(["f0:failed", "f1:done", "f2:done", "f3:done", "f4:done"]);
    expect(h.queue.getState().items[0].message).toBe("bad file");
    expect(h.queue.getState().progress).toMatchObject({ total: 5, done: 4, failed: 1 });
  });

  it("treats a worker that throws as a failed item", async () => {
    const queue = createUploadQueue<string>({
      limit: 2,
      worker: async () => {
        throw new Error("boom");
      },
    });
    queue.add(["a", "b"]);
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.getState().items.map((item) => [item.stage, item.message])).toEqual([
      ["failed", WORKER_CRASHED_MESSAGE],
      ["failed", WORKER_CRASHED_MESSAGE],
    ]);
  });

  it("reports what a running item is doing", () => {
    const h = harness();
    h.queue.add(["a"]);
    expect(h.queue.getState().items[0]).toMatchObject({ stage: "running", detail: "uploading" });
  });

  it("retries a single failed item and all failed items", async () => {
    const h = harness({ limit: 1 });
    h.queue.add(["a", "b", "c"]);
    await h.settle("a", { kind: "failed", message: "x" });
    await h.settle("b", { kind: "failed", message: "y" });
    await h.settle("c", { kind: "done" });

    const [a] = h.queue.getState().items;
    h.queue.retry(a.id);
    expect(h.started.at(-1)).toBe("a");
    await h.settle("a", { kind: "done" });
    expect(h.stages()).toEqual(["a:done", "b:failed", "c:done"]);

    h.queue.retryAllFailed();
    expect(h.started.at(-1)).toBe("b");
    await h.settle("b", { kind: "done" });
    expect(h.queue.getState().progress).toMatchObject({ done: 3, failed: 0 });
  });

  it("ignores retry for an item that has not failed", () => {
    const h = harness();
    h.queue.add(["a"]);
    h.queue.retry(h.queue.getState().items[0].id);
    expect(h.started).toEqual(["a"]);
  });

  it("removes a queued item but not a running one", async () => {
    const h = harness({ limit: 1 });
    const [a, b] = h.queue.add(["a", "b"]);
    expect(h.queue.remove(a)).toBe(false);
    expect(h.queue.remove(b)).toBe(true);
    await h.settle("a", { kind: "done" });
    expect(h.started).toEqual(["a"]);
    expect(h.stages()).toEqual(["a:done"]);
  });

  it("cancels items that have not started and keeps the running ones", async () => {
    const h = harness();
    h.queue.add(names(6));
    expect(h.queue.cancelQueued()).toBe(3);
    expect(h.stages()).toEqual(["f0:running", "f1:running", "f2:running"]);
    for (const name of ["f0", "f1", "f2"]) await h.settle(name, { kind: "done" });
    expect(h.started).toEqual(["f0", "f1", "f2"]);
  });

  it("reports progress as done of total and starts a fresh count for a later batch", async () => {
    const h = harness();
    h.queue.add(names(2));
    await h.settle("f0", { kind: "done" });
    expect(h.queue.getState().progress).toMatchObject({ done: 1, total: 2 });
    await h.settle("f1", { kind: "done" });

    h.queue.add(["g0", "g1", "g2"]);
    expect(h.queue.getState().progress).toMatchObject({ done: 0, total: 3 });
  });

  it("notifies subscribers and stops after unsubscribe", () => {
    const h = harness();
    let calls = 0;
    const unsubscribe = h.queue.subscribe(() => {
      calls += 1;
    });
    h.queue.add(["a"]);
    expect(calls).toBeGreaterThan(0);
    const seen = calls;
    unsubscribe();
    h.queue.add(["b"]);
    expect(calls).toBe(seen);
  });
});

describe("back-off", () => {
  it("waits, then retries a retry outcome, without showing a failure", async () => {
    const h = harness();
    h.queue.add(["a"]);
    await h.settle("a", { kind: "retry", message: "Too many requests, try again" });

    expect(h.stages()).toEqual(["a:waiting"]);
    expect(h.timers).toHaveLength(1);

    h.fireTimers();
    expect(h.started).toEqual(["a", "a"]);
    await h.settle("a", { kind: "done" });
    expect(h.stages()).toEqual(["a:done"]);
  });

  it("frees its slot while waiting so other files keep going", async () => {
    const h = harness({ limit: 1 });
    h.queue.add(["a", "b"]);
    await h.settle("a", { kind: "retry", message: "busy" });
    expect(h.started).toEqual(["a", "b"]);
    expect(h.stages()).toEqual(["a:waiting", "b:running"]);
  });

  it("honours Retry-After over the exponential delay", async () => {
    const h = harness();
    h.queue.add(["a"]);
    await h.settle("a", { kind: "retry", message: "busy", retryAfterMs: 4000 });
    expect(h.timers[0].ms).toBe(4000);
  });

  it("grows the delay on each attempt and caps it", async () => {
    const h = harness({ maxAttempts: 10 });
    h.queue.add(["a"]);
    const delays: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      await h.settle("a", { kind: "retry", message: "busy" });
      delays.push(h.timers.at(-1)!.ms);
      h.fireTimers();
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });

  it("gives up after 5 attempts with the retry message", async () => {
    const h = harness();
    h.queue.add(["a"]);
    for (let i = 0; i < 4; i += 1) {
      await h.settle("a", { kind: "retry", message: "Too many requests, try again" });
      expect(h.stages()).toEqual(["a:waiting"]);
      h.fireTimers();
    }
    await h.settle("a", { kind: "retry", message: "Too many requests, try again" });

    expect(h.started).toHaveLength(5);
    expect(h.stages()).toEqual(["a:failed"]);
    expect(h.queue.getState().items[0].message).toBe("Too many requests, try again");
  });

  it("never retries a failed outcome", async () => {
    const h = harness();
    h.queue.add(["a"]);
    await h.settle("a", { kind: "failed", message: "nope" });
    expect(h.timers).toHaveLength(0);
    expect(h.started).toEqual(["a"]);
  });

  it("a removed waiting item never runs again", async () => {
    const h = harness();
    const [a] = h.queue.add(["a"]);
    await h.settle("a", { kind: "retry", message: "busy" });
    expect(h.queue.remove(a)).toBe(true);
    h.fireTimers();
    expect(h.started).toEqual(["a"]);
  });

  it("a manual retry starts the attempt count again", async () => {
    const h = harness({ maxAttempts: 2 });
    h.queue.add(["a"]);
    await h.settle("a", { kind: "retry", message: "busy" });
    h.fireTimers();
    await h.settle("a", { kind: "retry", message: "busy" });
    expect(h.stages()).toEqual(["a:failed"]);

    h.queue.retry(h.queue.getState().items[0].id);
    expect(h.queue.getState().items[0].attempts).toBe(1);
    await h.settle("a", { kind: "retry", message: "busy" });
    expect(h.stages()).toEqual(["a:waiting"]);
  });
});

describe("backoffDelay", () => {
  const base = { baseMs: 1000, capMs: 30000, maxRetryAfterMs: 60000 };

  it("starts near one second and stays inside the jitter band", () => {
    expect(backoffDelay(1, { ...base, random: () => 0 })).toBe(750);
    expect(backoffDelay(1, { ...base, random: () => 1 })).toBe(1250);
  });

  it("caps a server Retry-After that is far too long", () => {
    expect(backoffDelay(1, { ...base, random: () => 0.5, retryAfterMs: 10 * 60_000 })).toBe(60000);
  });
});

describe("stop and start", () => {
  it("starts nothing new after stop, and aborts the signal given to running workers", async () => {
    const signals: AbortSignal[] = [];
    const started: string[] = [];
    const queue = createUploadQueue<string>({
      limit: 1,
      worker: (name, { signal }) => {
        started.push(name);
        signals.push(signal);
        return new Promise<Outcome>(() => undefined);
      },
    });
    queue.add(["a", "b", "c"]);
    expect(started).toEqual(["a"]);

    queue.stop();

    expect(signals[0].aborted).toBe(true);
    queue.add(["d"]);
    expect(started).toEqual(["a"]);
  });

  it("does not schedule or run a retry after stop, and cancels a waiting one", async () => {
    const h = harness();
    h.queue.add(["a", "b"]);
    await h.settle("a", { kind: "retry", message: "busy" });
    expect(h.timers).toHaveLength(1);

    h.queue.stop();
    h.fireTimers();
    expect(h.started).toEqual(["a", "b", ]);

    await h.settle("b", { kind: "retry", message: "busy" });
    expect(h.timers.filter((timer) => !timer.cancelled)).toHaveLength(0);
  });

  it("start lets an idle queue run again with a fresh signal", () => {
    const signals: AbortSignal[] = [];
    const queue = createUploadQueue<string>({
      limit: 1,
      worker: (_name, { signal }) => {
        signals.push(signal);
        return new Promise<Outcome>(() => undefined);
      },
    });
    queue.stop();
    queue.start();
    queue.add(["a"]);

    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);
    expect(queue.getState().items[0].stage).toBe("running");
  });
});

describe("stale outcomes after start()", () => {
  it("ignores the outcome of a run started before start() and keeps the new run's", async () => {
    const resolvers: ((outcome: Outcome) => void)[] = [];
    const queue = createUploadQueue<string>({
      limit: 2,
      worker: () => new Promise<Outcome>((resolve) => resolvers.push(resolve)),
    });
    queue.add(["a"]);
    queue.stop();
    queue.start();
    expect(resolvers).toHaveLength(2);
    expect(queue.getState().items[0]).toMatchObject({ stage: "running", attempts: 2 });

    resolvers[0]({ kind: "failed", message: "stale" });
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.getState().items[0]).toMatchObject({ stage: "running", message: null });

    resolvers[1]({ kind: "done" });
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.getState().items[0].stage).toBe("done");
  });
});

describe("stop() then start() while every slot is busy", () => {
  it("starts the items again as the runs from before finish, instead of leaving them queued", async () => {
    const h = harness({ limit: 2 });
    h.queue.add(["a", "b", "c"]);
    expect(h.started).toEqual(["a", "b"]);

    h.queue.stop();
    h.queue.start();
    // Both slots are still held by the runs that were aborted, so nothing can start yet.
    expect(h.stages()).toEqual(["a:queued", "b:queued", "c:queued"]);
    expect(h.started).toEqual(["a", "b"]);

    await h.settle("a", { kind: "failed", message: "aborted" });
    expect(h.stages()).toEqual(["a:running", "b:queued", "c:queued"]);
    await h.settle("b", { kind: "failed", message: "aborted" });
    expect(h.stages()).toEqual(["a:running", "b:running", "c:queued"]);
    expect(h.started).toEqual(["a", "b", "a", "b"]);
    expect(h.peak()).toBeLessThanOrEqual(2);

    await h.settle("a", { kind: "done" });
    await h.settle("b", { kind: "done" });
    await h.settle("c", { kind: "done" });
    expect(h.stages()).toEqual(["a:done", "b:done", "c:done"]);
    expect(h.queue.getState().progress).toMatchObject({ done: 3, queued: 0, running: 0 });
  });

  it("does the same with a single slot", async () => {
    const h = harness({ limit: 1 });
    h.queue.add(["a", "b"]);
    h.queue.stop();
    h.queue.start();
    expect(h.stages()).toEqual(["a:queued", "b:queued"]);

    await h.settle("a", { kind: "done" });
    expect(h.stages()).toEqual(["a:running", "b:queued"]);
  });

  it("starts nothing when the old runs finish while the queue is still stopped", async () => {
    const h = harness({ limit: 1 });
    h.queue.add(["a", "b"]);
    h.queue.stop();
    await h.settle("a", { kind: "done" });
    expect(h.started).toEqual(["a"]);
  });
});

describe("final failures", () => {
  it("offers no retry for a final failure, and retry-all skips it", async () => {
    const h = harness({ limit: 2 });
    h.queue.add(["a", "b"]);
    await h.settle("a", { kind: "failed", message: "refused", final: true });
    await h.settle("b", { kind: "failed", message: "flaky" });

    const [a, b] = h.queue.getState().items;
    expect(a).toMatchObject({ stage: "failed", final: true });
    expect(b).toMatchObject({ stage: "failed", final: false });

    h.queue.retry(a.id);
    expect(h.stages()).toEqual(["a:failed", "b:failed"]);

    h.queue.retryAllFailed();
    expect(h.stages()).toEqual(["a:failed", "b:running"]);
  });
});
