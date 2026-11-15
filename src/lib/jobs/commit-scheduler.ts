/** How long a keyboard-driven slider change waits before it is saved. */
export const KEYBOARD_COMMIT_DELAY_MS = 500;

/** Pointer and other commits are final the moment they happen; arrow keys repeat. */
export function commitDelay(reason: string): number {
  return reason === "keyboard" ? KEYBOARD_COMMIT_DELAY_MS : 0;
}

/**
 * Runs `run` with the latest value once changes stop for `delay` ms. `flush`
 * runs it now (blur, pointer release); `cancel` drops it.
 */
export function createCommitScheduler(run: (value: number) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: number | undefined;

  function clear() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function flush() {
    clear();
    if (pending === undefined) return;
    const value = pending;
    pending = undefined;
    run(value);
  }

  return {
    schedule(value: number, delay: number) {
      pending = value;
      clear();
      if (delay <= 0) flush();
      else timer = setTimeout(flush, delay);
    },
    flush,
    cancel() {
      clear();
      pending = undefined;
    },
  };
}
