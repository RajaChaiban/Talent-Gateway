import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  commitDelay,
  createCommitScheduler,
  KEYBOARD_COMMIT_DELAY_MS,
} from "./commit-scheduler";

describe("commitDelay", () => {
  it("waits for keyboard commits and not for pointer ones", () => {
    expect(commitDelay("keyboard")).toBe(KEYBOARD_COMMIT_DELAY_MS);
    expect(commitDelay("drag")).toBe(0);
    expect(commitDelay("track-press")).toBe(0);
    expect(commitDelay("none")).toBe(0);
  });
});

describe("createCommitScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves only the last value of a run of key presses", () => {
    const run = vi.fn();
    const scheduler = createCommitScheduler(run);
    for (const value of [81, 82, 83]) {
      scheduler.schedule(value, 500);
      vi.advanceTimersByTime(100);
    }
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(83);
  });

  it("runs at once with a zero delay and drops the waiting value", () => {
    const run = vi.fn();
    const scheduler = createCommitScheduler(run);
    scheduler.schedule(81, 500);
    scheduler.schedule(90, 0);
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(90);
  });

  it("flush runs the waiting value now, once", () => {
    const run = vi.fn();
    const scheduler = createCommitScheduler(run);
    scheduler.schedule(81, 500);
    scheduler.flush();
    scheduler.flush();
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(81);
  });

  it("cancel drops the waiting value", () => {
    const run = vi.fn();
    const scheduler = createCommitScheduler(run);
    scheduler.schedule(81, 500);
    scheduler.cancel();
    vi.advanceTimersByTime(1000);
    expect(run).not.toHaveBeenCalled();
  });
});
