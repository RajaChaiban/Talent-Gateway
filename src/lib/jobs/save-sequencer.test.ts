import { describe, expect, it } from "vitest";
import { createSaveSequencer, type SaveEvent, type SaveOutcome } from "./save-sequencer";

function setup(stored: number) {
  const calls: { value: number; settle: (outcome: SaveOutcome) => void }[] = [];
  const events: SaveEvent[] = [];
  const sequencer = createSaveSequencer({
    stored,
    save: (value) =>
      new Promise<SaveOutcome>((resolve) => {
        calls.push({ value, settle: resolve });
      }),
    notify: (event) => events.push(event),
  });
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { calls, events, sequencer, tick };
}

describe("createSaveSequencer", () => {
  it("saves a value and reports saved", async () => {
    const { calls, events, sequencer, tick } = setup(80);
    sequencer.request(90);
    calls[0].settle({ ok: true });
    await tick();

    expect(calls.map((c) => c.value)).toEqual([90]);
    expect(events.at(-1)).toEqual({ status: "saved", value: 90 });
    expect(sequencer.stored()).toBe(90);
  });

  it("does nothing when the value equals the stored one", () => {
    const { calls, events, sequencer } = setup(80);
    sequencer.request(80);
    expect(calls).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it("sends the original value again when the user goes back while the first save is in flight", async () => {
    const { calls, events, sequencer, tick } = setup(80);
    sequencer.request(90);
    sequencer.request(80);
    expect(calls).toHaveLength(1);

    calls[0].settle({ ok: true });
    await tick();
    expect(calls.map((c) => c.value)).toEqual([90, 80]);
    expect(events.at(-1)).toEqual({ status: "saving", value: 80 });

    calls[1].settle({ ok: true });
    await tick();
    expect(events.at(-1)).toEqual({ status: "saved", value: 80 });
    expect(sequencer.stored()).toBe(80);
  });

  it("does not revert a failed save when a newer value is waiting, and ends saved", async () => {
    const { calls, events, sequencer, tick } = setup(80);
    sequencer.request(90);
    sequencer.request(95);

    calls[0].settle({ ok: false, message: "nope" });
    await tick();
    expect(calls.map((c) => c.value)).toEqual([90, 95]);
    expect(events.some((e) => e.status === "failed")).toBe(false);

    calls[1].settle({ ok: true });
    await tick();
    expect(events.at(-1)).toEqual({ status: "saved", value: 95 });
    expect(sequencer.stored()).toBe(95);
  });

  it("reverts to the last stored value when the newest save fails", async () => {
    const { calls, events, sequencer, tick } = setup(80);
    sequencer.request(90);
    calls[0].settle({ ok: false, message: "nope" });
    await tick();

    expect(events.at(-1)).toEqual({ status: "failed", value: 80, message: "nope" });
    expect(sequencer.stored()).toBe(80);
  });

  it("treats a thrown save as a failure", async () => {
    const events: SaveEvent[] = [];
    const sequencer = createSaveSequencer({
      stored: 70,
      save: () => Promise.reject(new Error("network")),
      notify: (event) => events.push(event),
    });
    sequencer.request(60);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events.at(-1)).toEqual({ status: "failed", value: 70, message: undefined });
  });

  it("adopts a server value only while idle", async () => {
    const { calls, events, sequencer, tick } = setup(80);
    expect(sequencer.sync(85)).toBe(true);
    expect(events.at(-1)).toEqual({ status: "synced", value: 85 });
    expect(sequencer.stored()).toBe(85);

    sequencer.request(90);
    expect(sequencer.sync(60)).toBe(false);
    calls[0].settle({ ok: true });
    await tick();
    expect(sequencer.stored()).toBe(90);
  });
});
