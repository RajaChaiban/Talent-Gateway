type Timers = {
  now: () => number;
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

const realTimers: Timers = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Calls `fn` at most once per `intervalMs`: the first request runs at once,
 * later ones inside the interval are folded into one trailing call. `flush`
 * runs a pending call now; `cancel` drops it.
 */
export function createThrottle(fn: () => void, intervalMs: number, timers: Timers = realTimers) {
  let last = -Infinity;
  let pending: unknown = null;

  function fire() {
    pending = null;
    last = timers.now();
    fn();
  }

  return {
    request() {
      if (pending !== null) return;
      const wait = last + intervalMs - timers.now();
      if (wait <= 0) fire();
      else pending = timers.setTimeout(fire, wait);
    },
    flush() {
      if (pending === null) return;
      timers.clearTimeout(pending);
      fire();
    },
    cancel() {
      if (pending !== null) timers.clearTimeout(pending);
      pending = null;
    },
  };
}
