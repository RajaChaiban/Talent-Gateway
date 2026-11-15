import { asStored, formatScore } from "@/lib/score";
import { BANDS, type Band, type ScoreRange } from "./types";

/**
 * The evaluation keeps scores, margins and bars in stored tenths, as the app
 * does, and shows them on the 0.0 to 10.0 scale through `src/lib/score.ts`.
 */

/** A stored score as people see it: 84 gives "8.4". */
export function shown(stored: number): string {
  return formatScore(asStored(stored));
}

/** A signed difference of stored scores on the 0 to 10 scale: 6 gives "+0.6", -12 gives "-1.2". */
export function shownDifference(stored: number): string {
  const sign = stored > 0 ? "+" : stored < 0 ? "-" : "";
  return `${sign}${shown(Math.abs(stored))}`;
}

/** "8.0 to 10.0" */
export function rangeText(range: ScoreRange): string {
  return `${shown(range.min)} to ${shown(range.max)}`;
}

/** "7.5 to 10.0" */
export function bandRange(band: Band): string {
  return rangeText(BANDS[band]);
}
