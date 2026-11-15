import { asStored, type StoredScore } from "./score";

export const APP_NAME = "Talent Gateway";
export const APP_DESCRIPTION =
  "Enterprise AI resume screening with zero-token edge filtering and Vercel AI Gateway.";

/** Score bands stored in tenths (0 to 100), representing 0.0 to 10.0 */
export const SCORE_BANDS = {
  /** Top talent: >= 8.0 (green), Consider: 5.0 - 7.9 (amber), Low match: < 5.0 (red) */
  trafficLight: { green: asStored(80), amber: asStored(50) },
} as const;

/** A new job starts with top talent at 8.0 and invite bar at 7.0 */
export const JOB_THRESHOLD_DEFAULTS = {
  topTalent: asStored(80),
  invite: asStored(70),
} as const;

/** ATS scoring thresholds */
export const ATS_THRESHOLDS = {
  passScoreTenths: asStored(60), // 6.0
  minExtractedChars: 300,
  maxNoiseRatio: 0.15,
} as const;

export type TrafficLight = "green" | "amber" | "red";

export function trafficLight(score: StoredScore): TrafficLight {
  if (score >= SCORE_BANDS.trafficLight.green) return "green";
  if (score >= SCORE_BANDS.trafficLight.amber) return "amber";
  return "red";
}
