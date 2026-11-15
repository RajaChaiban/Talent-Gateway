export type SaveOutcome = { ok: true } | { ok: false; message?: string };

export type SaveEvent =
  | { status: "saving"; value: number }
  | { status: "saved"; value: number }
  | { status: "failed"; value: number; message?: string }
  | { status: "synced"; value: number };

type Options = {
  stored: number;
  save: (value: number) => Promise<SaveOutcome>;
  notify: (event: SaveEvent) => void;
};

/**
 * Saves one number at a time, last write wins. The caller says what it wants
 * stored with `request`; the sequencer sends one save, and when it settles
 * sends another if what is wanted still differs from what is stored.
 *
 * - "saved" is reported only once the stored value equals the wanted value.
 * - A failed save reverts to the last stored value only when nothing newer
 *   was asked for meanwhile; otherwise the newer value is sent next.
 *
 * `value` on every event is the value the control should show.
 *
 * DECISION: saves are sequenced, never sent in parallel. Two requests in
 * flight can finish in either order, so the database could end on an older
 * value than the slider shows; one at a time keeps the last choice the one
 * that is stored.
 */
export function createSaveSequencer({ stored: initial, save, notify }: Options) {
  let stored = initial;
  let desired = initial;
  let running = false;

  async function attempt(value: number): Promise<SaveOutcome> {
    try {
      return await save(value);
    } catch {
      return { ok: false };
    }
  }

  async function drain() {
    running = true;
    let failure: { message?: string } | null = null;

    while (desired !== stored) {
      const sent = desired;
      notify({ status: "saving", value: desired });
      const outcome = await attempt(sent);
      if (outcome.ok) {
        stored = sent;
        failure = null;
      } else if (desired === sent) {
        desired = stored;
        failure = { message: outcome.message };
      }
    }

    running = false;
    notify(
      failure
        ? { status: "failed", value: stored, message: failure.message }
        : { status: "saved", value: stored },
    );
  }

  return {
    /** Ask for `value` to become the stored value. */
    request(value: number) {
      desired = value;
      if (!running && desired !== stored) void drain();
    },
    /**
     * Adopt a value the server reports, but only while nothing is pending, so
     * a slow refresh can never overwrite a newer choice. Returns whether it
     * was adopted.
     */
    sync(value: number): boolean {
      if (running || desired !== stored || value === stored) return false;
      stored = value;
      desired = value;
      notify({ status: "synced", value });
      return true;
    },
    stored: () => stored,
  };
}
