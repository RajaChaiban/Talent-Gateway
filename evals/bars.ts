import { JOB_THRESHOLD_DEFAULTS } from "@/lib/config";
import { isTopTalent } from "@/lib/jobs/helpers";
import { asStored, formatScore, type StoredScore } from "@/lib/score";
import type { Band } from "./types";

/**
 * Test 7: the two score bars a recruiter sets on a job, applied to the scores
 * the run already has. The bars are never sent to the model; the app applies
 * them to the stored score afterwards, as this does. No model call.
 */

export type BarSettingId = "default" | "strict" | "lenient";

/** One pair of score bars to test: a name and the two stored-tenths scores a candidate must reach. */
export type BarSetting = {
  id: BarSettingId;
  name: string;
  topTalent: StoredScore;
  invite: StoredScore;
};

/** A new job's bars (JOB_THRESHOLD_DEFAULTS). The only setting that is graded. */
export const DEFAULT_BARS: BarSetting = {
  id: "default",
  name: "Default",
  topTalent: JOB_THRESHOLD_DEFAULTS.topTalent,
  invite: JOB_THRESHOLD_DEFAULTS.invite,
};
const STRICT_BARS: BarSetting = { id: "strict", name: "Strict", topTalent: asStored(90), invite: asStored(80) };
const LENIENT_BARS: BarSetting = { id: "lenient", name: "Lenient", topTalent: asStored(60), invite: asStored(50) };

/** Default first; strict and lenient are reported, not graded. */
export const BAR_SETTINGS: readonly BarSetting[] = [DEFAULT_BARS, STRICT_BARS, LENIENT_BARS];

/** Which bars one score clears under one setting. */
export type BarPlacement = {
  topTalent: boolean;
  /** The score is at or above the invite bar (a top-talent score usually is too). */
  invite: boolean;
};

/** Where one score falls under one setting. */
export function placeScore(score: StoredScore, setting: BarSetting): BarPlacement {
  return { topTalent: isTopTalent(score, setting.topTalent), invite: score >= setting.invite };
}

/** "top talent", "invite" or "below": the highest bar the score clears. */
export function placementText(placement: BarPlacement): string {
  if (placement.topTalent) return "top talent";
  return placement.invite ? "invite" : "below";
}

/** A case with a stated band and its run-0 score (null when it has none). */
export type BarCase = { id: string; band: Band; score: number | null };

/** A banded case with its placement under every bar setting. */
export type BarRow = BarCase & {
  /** Per setting id; null when the case has no score. */
  placements: Readonly<Record<BarSettingId, BarPlacement | null>>;
};

/** How many scored cases fall in each place under one bar setting. */
export type BarSummary = {
  setting: BarSetting;
  topTalent: number;
  /** Scored cases at or above the invite bar, top talent included. */
  invite: number;
  /** Scored cases that clear neither bar. */
  below: number;
  /** Cases with no score, left out of the three counts. */
  unscored: number;
};

/** The result of test 7: every row, one summary per setting, and the default setting's pass checks. */
export type BarsGrade = {
  rows: BarRow[];
  summaries: BarSummary[];
  /** The default setting's pass marks, one item per strong or weak case. */
  defaultChecks: Array<{ id: string; ok: boolean }>;
};

/**
 * Places every banded case under every setting and checks the default bars:
 * a case expected strong must clear the invite bar, and a case expected weak
 * must clear neither bar. A case with no score misses its check.
 */
export function gradeBars(cases: readonly BarCase[]): BarsGrade {
  const rows: BarRow[] = cases.map((item) => {
    const stored = item.score === null ? null : asStored(item.score);
    const place = (setting: BarSetting) => (stored === null ? null : placeScore(stored, setting));
    return {
      ...item,
      placements: { default: place(DEFAULT_BARS), strict: place(STRICT_BARS), lenient: place(LENIENT_BARS) },
    };
  });
  const summaries = BAR_SETTINGS.map((setting) => {
    const placed = rows.map((row) => row.placements[setting.id]);
    const scored = placed.filter((placement) => placement !== null);
    return {
      setting,
      topTalent: scored.filter((placement) => placement.topTalent).length,
      invite: scored.filter((placement) => placement.invite).length,
      below: scored.filter((placement) => !placement.topTalent && !placement.invite).length,
      unscored: placed.length - scored.length,
    };
  });
  const defaultChecks = rows.flatMap((row) => {
    const placement = row.placements.default;
    if (row.band === "strong") return [{ id: row.id, ok: placement !== null && placement.invite }];
    if (row.band === "weak") {
      return [{ id: row.id, ok: placement !== null && !placement.invite && !placement.topTalent }];
    }
    return [];
  });
  return { rows, summaries, defaultChecks };
}

/** "top talent 8.0, invite 7.0", on the 0 to 10 scale people see. */
export function settingText(setting: BarSetting): string {
  return `top talent ${formatScore(setting.topTalent)}, invite ${formatScore(setting.invite)}`;
}

/** "2 top talent, 5 clear the invite bar, 7 below", plus the unscored cases when there are any. */
export function summaryText(summary: BarSummary): string {
  const counts = `${summary.topTalent} top talent, ${summary.invite} clear the invite bar, ${summary.below} below`;
  return summary.unscored > 0 ? `${counts}, ${summary.unscored} not scored` : counts;
}
