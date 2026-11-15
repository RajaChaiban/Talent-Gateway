import { SCORE_WEIGHTS as W } from "@/lib/config";
import { isScore, SCORE_SCALE_MESSAGE, toStored, type Score, type StoredScore } from "@/lib/score";

/**
 * Adds up a match score from the parts the scoring model returns. The model
 * classifies the role and each must-have and gives small part-scores; this
 * function does the arithmetic, with every weight from SCORE_WEIGHTS. Pure.
 */

export const ROLE_MATCHES = ["same", "related", "unrelated"] as const;
export type RoleMatch = (typeof ROLE_MATCHES)[number];

export const MUST_HAVE_STATUSES = ["shown", "equivalent", "listed", "missing"] as const;
export type MustHaveStatus = (typeof MUST_HAVE_STATUSES)[number];

/** What the total is computed from, on the 0 to 10 scale. */
export type ScoreParts = {
  role_match: RoleMatch;
  start_score: number;
  must_haves: ReadonlyArray<{ status: MustHaveStatus }>;
  evidence: number;
  proof_of_work: number;
  education: number;
};

/** Each part as it counted, before the additions are scaled by start / 5, and the total. */
export type ScoreTotal = {
  start: number;
  skills: number;
  evidence: number;
  proof_of_work: number;
  education: number;
  /** The total on the 0 to 10 scale, one decimal. */
  total: Score;
  /** The same total as stored tenths. */
  stored: StoredScore;
};

/** Absorbs floating-point error such as 7.249999 for 7.25 before rounding to one decimal. */
const ROUNDING_EPSILON = 1e-9;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function startScore(roleMatch: RoleMatch, modelValue: number): number {
  if (roleMatch === "same") return W.start.same;
  const range = W.start[roleMatch];
  return clamp(modelValue, range.min, range.max);
}

/** skillsMax x (the sum of each must-have's status weight) / the number of must-haves; 0 when there are none. */
export function skillsScore(mustHaves: ReadonlyArray<{ status: MustHaveStatus }>): number {
  if (mustHaves.length === 0) return 0;
  const earned = mustHaves.reduce((sum, item) => sum + W.mustHaveStatus[item.status], 0);
  return (W.skillsMax * earned) / mustHaves.length;
}

/**
 * start + (skills + evidence + proof of work + education) x start / 5, rounded
 * to one decimal. The start is exactly 5.0 for the same role whatever the model
 * wrote, and clamped to its range otherwise; evidence, proof of work and
 * education are clamped to their ranges.
 */
export function totalScore(parts: ScoreParts): ScoreTotal {
  const start = startScore(parts.role_match, parts.start_score);
  const skills = skillsScore(parts.must_haves);
  const evidence = clamp(parts.evidence, 0, W.evidenceMax);
  const proofOfWork = clamp(parts.proof_of_work, 0, W.proofOfWorkMax);
  const education = clamp(parts.education, 0, W.educationMax);
  const additions = (skills + evidence + proofOfWork + education) * (start / W.start.same);
  const total = Math.round((start + additions) * 10 + ROUNDING_EPSILON) / 10;
  if (!isScore(total)) throw new RangeError(`Total score ${SCORE_SCALE_MESSAGE}, got ${String(total)}`);
  return { start, skills, evidence, proof_of_work: proofOfWork, education, total, stored: toStored(total) };
}
