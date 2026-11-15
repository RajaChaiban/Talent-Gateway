"use client";

import { useEffect, useState } from "react";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import {
  ThresholdSliders,
  type ThresholdField,
  type Thresholds,
} from "@/components/jobs/threshold-sliders";
import { commitDelay, createCommitScheduler } from "@/lib/jobs/commit-scheduler";
import { SAVE_FAILED_MESSAGE } from "@/lib/jobs/messages";
import { createSaveSequencer, type SaveEvent } from "@/lib/jobs/save-sequencer";
import { asStored, toScore } from "@/lib/score";
import { saveThresholds } from "./save-thresholds";

const FIELD_NAMES: readonly ThresholdField[] = ["top_talent_threshold", "invite_threshold"];

type SaveStates = Partial<Record<ThresholdField, SaveEvent>>;

function SaveStatus({ event, shown }: { event: SaveEvent | undefined; shown: number }) {
  if (!event || event.status === "synced") return null;
  if (event.status === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        Saving…
      </span>
    );
  }
  if (event.status === "saved") {
    return event.value === shown ? (
      <span className="inline-flex items-center gap-1.5 text-success">
        <Check className="size-3.5" aria-hidden />
        Saved
      </span>
    ) : null;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-error">
      <CircleAlert className="size-3.5" aria-hidden />
      {event.message ?? SAVE_FAILED_MESSAGE}
    </span>
  );
}

/**
 * One save sequencer and one commit scheduler per field, so the two sliders
 * save independently and a run of key presses sends only its last value.
 */
function createEngine(
  jobId: string,
  initial: Thresholds,
  onEvent: (field: ThresholdField, event: SaveEvent) => void,
) {
  const sequencers = {} as Record<ThresholdField, ReturnType<typeof createSaveSequencer>>;
  const schedulers = {} as Record<ThresholdField, ReturnType<typeof createCommitScheduler>>;
  for (const field of FIELD_NAMES) {
    sequencers[field] = createSaveSequencer({
      stored: initial[field],
      save: (value) => saveThresholds(jobId, { [field]: toScore(asStored(value)) }),
      notify: (event) => onEvent(field, event),
    });
    schedulers[field] = createCommitScheduler((value) => sequencers[field].request(value));
  }
  return { sequencers, schedulers };
}

/**
 * The job's two thresholds, saved from the browser to `PATCH /api/jobs/[id]`
 * as each slider is released, with a saving, saved or error note per field.
 */
export function JobThresholds({ jobId, initial }: { jobId: string; initial: Thresholds }) {
  const [values, setValues] = useState<Thresholds>(initial);
  const [saves, setSaves] = useState<SaveStates>({});

  const [engine] = useState(() =>
    createEngine(jobId, initial, (field, event) => {
      setSaves((current) => ({ ...current, [field]: event.status === "synced" ? undefined : event }));
      if (event.status === "failed" || event.status === "synced") {
        setValues((current) => ({ ...current, [field]: asStored(event.value) }));
      }
    }),
  );

  useEffect(() => {
    return () => {
      for (const field of FIELD_NAMES) engine.schedulers[field].flush();
    };
  }, [engine]);

  const { top_talent_threshold: topTalent, invite_threshold: invite } = initial;
  useEffect(() => {
    const server: Thresholds = { top_talent_threshold: topTalent, invite_threshold: invite };
    for (const field of FIELD_NAMES) {
      engine.sequencers[field].sync(server[field]);
    }
  }, [engine, topTalent, invite]);

  return (
    <ThresholdSliders
      values={values}
      onChange={(field, value) => setValues((current) => ({ ...current, [field]: value }))}
      onCommit={(field, value, reason) =>
        engine.schedulers[field].schedule(value, commitDelay(reason))
      }
      onBlur={(field) => engine.schedulers[field].flush()}
      status={(field) => <SaveStatus event={saves[field]} shown={values[field]} />}
    />
  );
}
