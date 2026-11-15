import { describe, expect, it } from "vitest";
import {
  backoffDelay,
  createAnalyzeQueue,
  type AttemptResult,
  type QueueOptions,
} from "./analyze-queue";

/** A run function whose calls the test answers by hand. */
function manualRun() {
  const pending = new Map<string, ((result: AttemptResult) => void)[]>();
  const started: string[] = [];
  let peak = 0;
  let open = 0;
  const run: QueueOptions["run"] = (id) =>
    new Promise<AttemptResult>((resolve) => {
      started.push(id);
      open += 1;
      peak = Math.max(peak, open);
      const list = pending.get(id) ?? [];
      list.push((result) => {
        open -= 1;
        resolve(result);
      });
      pending.set(id, list);
    });
  const answer = async (id: string, result: AttemptResult) => {
    const resolve = pending.get(id)?.shift();
    if (!resolve) throw new Error(`no open call for ${id}`);
    resolve(result);
    await flush();
  };
  return { run, answer, started, peak: () => peak, open: () => open };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const ok = (status: "scored" | "ats_failed" | "failed" = "scored"): AttemptResult => ({ kind: "ok", status });

const base = {
  concurrency: 3,
  maxAttempts: 5,
  backoffBaseMs: 1000,
  backoffMaxMs: 30_000,
  random: () => 1,
};

describe("createAnalyzeQueue", () => {
  it("never runs more than three at once and starts in order", async () => {
    const calls = manualRun();
    const queue = createAnalyzeQueue({ ...base, run: calls.run });
    const ids = ["a", "b", "c", "d", "e", "f"];
    const done = queue.run(ids);
    await flush();
    expect(calls.started).toEqual(["a", "b", "c"]);

    await calls.answer("b", ok());
    expect(calls.started).toEqual(["a", "b", "c", "d"]);
    for (const id of ["a", "c", "d", "e", "f"]) {
      while (!calls.started.includes(id)) await flush();
      await calls.answer(id, ok());
    }
    const snapshot = await done;
    expect(calls.peak()).toBe(3);
    expect(snapshot).toMatchObject({ total: 6, finished: 6, failed: 0, active: false });
  });

  it("lets one resume fail without stopping the others, and counts it", async () => {
    const calls = manualRun();
    const queue = createAnalyzeQueue({ ...base, run: calls.run });
    const done = queue.run(["a", "b"]);
    await flush();
    await calls.answer("a", ok("failed"));
    await calls.answer("b", ok("ats_failed"));
    const snapshot = await done;
    expect(snapshot.failed).toBe(1);
    expect(snapshot.items.map((item) => [item.id, item.state, item.status])).toEqual([
      ["a", "failed", "failed"],
      ["b", "done", "ats_failed"],
    ]);
  });

  it("waits Retry-After on 429/503 and then retries, holding the slot", async () => {
    const calls = manualRun();
    const waits: number[] = [];
    let release: () => void = () => undefined;
    const queue = createAnalyzeQueue({
      ...base,
      concurrency: 1,
      run: calls.run,
      sleep: (ms) => {
        waits.push(ms);
        return new Promise((resolve) => (release = resolve));
      },
    });
    const done = queue.run(["a", "b"]);
    await flush();
    await calls.answer("a", { kind: "retry", retryAfterMs: 2000 });
    expect(waits).toEqual([2000]);
    expect(queue.snapshot()).toMatchObject({ waiting: 1, inFlight: 0 });
    expect(calls.started).toEqual(["a"]);

    release();
    await flush();
    expect(calls.started).toEqual(["a", "a"]);
    await calls.answer("a", ok());
    await calls.answer("b", ok());
    await expect(done).resolves.toMatchObject({ finished: 2, failed: 0 });
  });

  it("backs off exponentially without Retry-After and gives up after maxAttempts", async () => {
    const waits: number[] = [];
    const queue = createAnalyzeQueue({
      ...base,
      run: async () => ({ kind: "retry", retryAfterMs: null }),
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    const snapshot = await queue.run(["a"]);
    expect(waits).toEqual([1000, 2000, 4000, 8000]);
    expect(snapshot.items[0]).toMatchObject({ state: "failed", attempts: 5 });
  });

  it("treats a thrown network error as retryable", async () => {
    let calls = 0;
    const queue = createAnalyzeQueue({
      ...base,
      run: async () => {
        calls += 1;
        if (calls === 1) throw new TypeError("Failed to fetch");
        return ok();
      },
      sleep: async () => undefined,
    });
    await expect(queue.run(["a"])).resolves.toMatchObject({ failed: 0, finished: 1 });
    expect(calls).toBe(2);
  });

  it("does not retry other errors", async () => {
    let calls = 0;
    const queue = createAnalyzeQueue({
      ...base,
      run: async () => {
        calls += 1;
        return { kind: "error" };
      },
    });
    await expect(queue.run(["a"])).resolves.toMatchObject({ failed: 1 });
    expect(calls).toBe(1);
  });

  it("queues failed ids again on a later run and leaves finished ones alone", async () => {
    const answers: Record<string, AttemptResult[]> = { a: [ok("failed"), ok()], b: [ok()] };
    const runs: string[] = [];
    const queue = createAnalyzeQueue({
      ...base,
      run: async (id) => {
        runs.push(id);
        return answers[id].shift() ?? ok();
      },
    });
    await queue.run(["a", "b"]);
    const second = await queue.run(["a", "b"]);
    expect(runs).toEqual(["a", "b", "a"]);
    expect(second).toMatchObject({ total: 2, failed: 0, finished: 2 });
  });

  it("stop() starts nothing new, aborts the calls in flight and resolves", async () => {
    const signals: AbortSignal[] = [];
    const calls = manualRun();
    const queue = createAnalyzeQueue({
      ...base,
      run: (id, signal) => {
        signals.push(signal);
        return calls.run(id, signal);
      },
    });
    const done = queue.run(["a", "b", "c", "d", "e"]);
    await flush();
    queue.stop();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    for (const id of ["a", "b", "c"]) await calls.answer(id, ok());
    const snapshot = await done;
    expect(calls.started).toEqual(["a", "b", "c"]);
    expect(snapshot.active).toBe(false);
  });

  it("stop() cuts a back-off wait short without retrying", async () => {
    const calls = manualRun();
    const queue = createAnalyzeQueue({ ...base, concurrency: 1, run: calls.run });
    const done = queue.run(["a"]);
    await flush();
    await calls.answer("a", { kind: "retry", retryAfterMs: 30_000 });
    queue.stop();
    await done;
    expect(calls.started).toEqual(["a"]);
  });

  it("resolves at once for an empty list", async () => {
    const queue = createAnalyzeQueue({ ...base, run: async () => ok() });
    await expect(queue.run([])).resolves.toMatchObject({ total: 0, active: false });
  });

  it("reports changes", async () => {
    const seen: number[] = [];
    const queue = createAnalyzeQueue({
      ...base,
      run: async () => ok(),
      onChange: (snapshot) => seen.push(snapshot.finished),
    });
    await queue.run(["a", "b"]);
    expect(seen.at(-1)).toBe(2);
  });
});

describe("backoffDelay", () => {
  const options = { base: 1000, max: 30_000, random: () => 0 };

  it("honours Retry-After up to the cap", () => {
    expect(backoffDelay(1, 5000, options)).toBe(5000);
    expect(backoffDelay(1, 120_000, options)).toBe(30_000);
  });

  it("doubles per attempt with jitter between half and all of the step, capped", () => {
    expect(backoffDelay(1, null, options)).toBe(500);
    expect(backoffDelay(3, null, options)).toBe(2000);
    expect(backoffDelay(3, null, { ...options, random: () => 1 })).toBe(4000);
    expect(backoffDelay(10, null, { ...options, random: () => 1 })).toBe(30_000);
  });
});
