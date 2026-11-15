import { describe, expect, it } from "vitest";
import { runPool, withRetry } from "./pool";

describe("runPool", () => {
  it("keeps the order of the items and never runs more than the limit at once", async () => {
    let running = 0;
    let most = 0;
    const results = await runPool([5, 1, 4, 2, 3], 2, async (value) => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, value));
      running -= 1;
      return value * 10;
    });
    expect(results).toEqual([50, 10, 40, 20, 30]);
    expect(most).toBe(2);
  });

  it("returns nothing for no items", async () => {
    expect(await runPool([], 3, async () => 1)).toEqual([]);
  });
});

describe("withRetry", () => {
  const busy = new Error("busy");
  const fatal = new Error("fatal");
  const retryAfter = (error: unknown) => (error === busy ? 3 : null);

  it("retries a retryable error, waiting the longer of its wait and the back-off", async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 4) throw busy;
        return "done";
      },
      { attempts: 4, retryAfter, baseMs: 2_000, sleep: async (ms) => void waits.push(ms) },
    );
    expect(result).toBe("done");
    expect(waits).toEqual([3_000, 4_000, 8_000]);
  });

  it("throws the last error once the attempts are used up", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw busy;
        },
        { attempts: 3, retryAfter, baseMs: 1, sleep: async () => undefined },
      ),
    ).rejects.toBe(busy);
    expect(calls).toBe(3);
  });

  it("does not retry any other error", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw fatal;
        },
        { attempts: 3, retryAfter, baseMs: 1, sleep: async () => undefined },
      ),
    ).rejects.toBe(fatal);
    expect(calls).toBe(1);
  });
});
