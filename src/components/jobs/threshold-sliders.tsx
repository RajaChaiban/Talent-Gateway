"use client";

import type { ReactNode } from "react";
import { Slider } from "@/components/ui/slider";
import {
  asStored,
  nearestStored,
  STORED_MAX,
  STORED_MIN,
  toScore,
  type StoredScore,
} from "@/lib/score";

export type ThresholdField = "top_talent_threshold" | "invite_threshold";
/** Stored tenths (0 to 100): the state stays whole numbers. The slider itself runs on the 0 to 10 scale. */
export type Thresholds = Record<ThresholdField, StoredScore>;

/** The slider's own range, derived from the stored one: 0 to 10 in steps of 0.1, Page Up and Down 1.0. */
const MIN = toScore(asStored(STORED_MIN));
const MAX = toScore(asStored(STORED_MAX));
const STEP = toScore(asStored(1));
const PAGE_STEP = toScore(asStored(10));
/** One decimal always, in a fixed locale, so the number beside the label and `aria-valuetext` read "8.0" everywhere. */
const SCORE_FORMAT = { minimumFractionDigits: 1, maximumFractionDigits: 1 } as const;

const FIELDS: readonly {
  field: ThresholdField;
  label: string;
  hint: string;
}[] = [
  {
    field: "top_talent_threshold",
    label: "Top talent threshold",
    hint: "Candidates scoring at or above this, from 0.0 to 10.0, are top talent.",
  },
  {
    field: "invite_threshold",
    label: "Invite bar",
    hint: "Candidates scoring at or above this, from 0.0 to 10.0, can be invited to interview.",
  },
];

function firstValue(value: number | readonly number[]): number {
  return typeof value === "number" ? value : (value[0] ?? 0);
}

type ThresholdSlidersProps = {
  values: Thresholds;
  onChange: (field: ThresholdField, value: StoredScore) => void;
  onCommit?: (field: ThresholdField, value: StoredScore, reason: string) => void;
  onBlur?: (field: ThresholdField) => void;
  status?: (field: ThresholdField) => ReactNode;
  disabled?: boolean;
};

/** The two 0.0 to 10.0 threshold sliders (step 0.1, Page Up and Down 1.0) with live numbers, shared by the create form and the job page. */
export function ThresholdSliders({
  values,
  onChange,
  onCommit,
  onBlur,
  status,
  disabled,
}: ThresholdSlidersProps) {
  return (
    <div className="grid gap-8 rounded-lg border border-border surface-card p-5 sm:grid-cols-2 sm:gap-10 sm:p-6">
      {FIELDS.map(({ field, label, hint }) => (
        <div key={field} className="flex flex-col gap-3">
          <Slider
            label={label}
            min={MIN}
            max={MAX}
            step={STEP}
            largeStep={PAGE_STEP}
            format={SCORE_FORMAT}
            locale="en-US"
            value={toScore(values[field])}
            disabled={disabled}
            onValueChange={(next) => onChange(field, nearestStored(firstValue(next)))}
            onValueCommitted={(next, details) =>
              onCommit?.(field, nearestStored(firstValue(next)), details.reason)
            }
            onThumbBlur={() => onBlur?.(field)}
          />
          <div className="flex items-start justify-between gap-4 text-copy-13 text-muted-foreground">
            <p>{hint}</p>
            <div aria-live="polite" className="shrink-0 text-right">
              {status?.(field)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
