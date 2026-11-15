import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeOne, fetchProgress, retryAfterMs, startJobAnalysis } from "./analyze-client";
import { createThrottle } from "./throttle";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

afterEach(() => fetchMock.mockReset());

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const signal = () => new AbortController().signal;

describe("analyzeOne", () => {
  it("returns the status of a 200", async () => {
    fetchMock.mockResolvedValue(json({ data: { resume_id: "r", status: "ats_failed" } }));
    await expect(analyzeOne("r", signal())).resolves.toEqual({ kind: "ok", status: "ats_failed" });
    expect(fetchMock).toHaveBeenCalledWith("/api/resumes/r/analyze", expect.objectContaining({ method: "POST" }));
  });

  it("makes 429 and 503 retryable with Retry-After in milliseconds", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 503, { "Retry-After": "4" }));
    await expect(analyzeOne("r", signal())).resolves.toEqual({ kind: "retry", retryAfterMs: 4000 });
    fetchMock.mockResolvedValueOnce(json({}, 429));
    await expect(analyzeOne("r", signal())).resolves.toEqual({ kind: "retry", retryAfterMs: null });
  });

  it("does not retry other errors or a malformed body", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: "not_found", message: "x" } }, 404));
    await expect(analyzeOne("r", signal())).resolves.toEqual({ kind: "error" });
    fetchMock.mockResolvedValueOnce(json({ data: { resume_id: "r", status: "great" } }));
    await expect(analyzeOne("r", signal())).resolves.toEqual({ kind: "error" });
  });
});

describe("startJobAnalysis", () => {
  it("returns the ids", async () => {
    fetchMock.mockResolvedValue(json({ data: { resume_ids: ["a", "b"] } }));
    await expect(startJobAnalysis("j", signal())).resolves.toEqual({ ok: true, resumeIds: ["a", "b"] });
  });

  it("passes on the server's safe message", async () => {
    fetchMock.mockResolvedValue(json({ error: { code: "not_found", message: "Job not found" } }, 404));
    await expect(startJobAnalysis("j", signal())).resolves.toEqual({ ok: false, message: "Job not found" });
  });

  it("turns a network failure into a message", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(startJobAnalysis("j", signal())).resolves.toMatchObject({ ok: false });
  });
});

describe("fetchProgress", () => {
  it("parses the counts and is null on failure", async () => {
    const data = { total: 6, extracted: 6, ats_failed: 1, scored: 2, failed: 0, remaining: 3, status: "ANALYZING" };
    fetchMock.mockResolvedValueOnce(json({ data }));
    await expect(fetchProgress("j", signal())).resolves.toEqual(data);
    fetchMock.mockResolvedValueOnce(json({}, 500));
    await expect(fetchProgress("j", signal())).resolves.toBeNull();
  });
});

describe("retryAfterMs", () => {
  it("reads seconds and ignores junk", () => {
    expect(retryAfterMs(new Response(null, { headers: { "Retry-After": "2" } }))).toBe(2000);
    expect(retryAfterMs(new Response(null, { headers: { "Retry-After": "x" } }))).toBeNull();
    expect(retryAfterMs(new Response(null))).toBeNull();
  });
});

describe("createThrottle", () => {
  function fakeTimers() {
    let now = 0;
    const timers: { at: number; fn: () => void; id: number }[] = [];
    let next = 1;
    return {
      timers: {
        now: () => now,
        setTimeout: (fn: () => void, ms: number) => {
          const id = next++;
          timers.push({ at: now + ms, fn, id });
          return id;
        },
        clearTimeout: (id: unknown) => {
          const index = timers.findIndex((timer) => timer.id === id);
          if (index >= 0) timers.splice(index, 1);
        },
      },
      advance(ms: number) {
        now += ms;
        for (const timer of timers.filter((t) => t.at <= now)) {
          timers.splice(timers.indexOf(timer), 1);
          timer.fn();
        }
      },
    };
  }

  it("runs the first call at once and folds the rest into one trailing call", () => {
    const clock = fakeTimers();
    const fn = vi.fn();
    const throttle = createThrottle(fn, 1000, clock.timers);
    throttle.request();
    throttle.request();
    throttle.request();
    expect(fn).toHaveBeenCalledTimes(1);
    clock.advance(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("flush runs a pending call now; cancel drops it", () => {
    const clock = fakeTimers();
    const fn = vi.fn();
    const throttle = createThrottle(fn, 1000, clock.timers);
    throttle.request();
    throttle.request();
    throttle.flush();
    expect(fn).toHaveBeenCalledTimes(2);
    throttle.request();
    throttle.cancel();
    clock.advance(5000);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
