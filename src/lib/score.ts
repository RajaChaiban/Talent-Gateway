/**
 * The only place that converts between the two scales, and it imports nothing,
 * so client components can use it without pulling anything else into a bundle.
 *
 * Stored scores are whole tenths from 0 to 100 (83 in the database). People see
 * and type scores from 0.0 to 10.0 with one decimal (8.3). The two are different
 * types, so passing one where the other belongs is a compile error: the only way
 * from `StoredScore` to `Score` is `toScore`, and back is `toStored`.
 *
 * The compiler is the guard against converting anywhere else.
 */

declare const storedBrand: unique symbol;
declare const shownBrand: unique symbol;

/** Whole tenths from 0 to 100, as the database, queries, config and functions hold them. */
export type StoredScore = number & { readonly [storedBrand]: true };

/** A score from 0 to 10 with at most one decimal: what the API sends and receives and people see. */
export type Score = number & { readonly [shownBrand]: true };

export const STORED_MIN = 0;
export const STORED_MAX = 100;

/** The sentence every message about a score field ends with. */
export const SCORE_SCALE_MESSAGE = "must be a number from 0 to 10 with at most one decimal";

export function isStoredScore(value: unknown): value is StoredScore {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= STORED_MIN &&
    value <= STORED_MAX
  );
}

/** Marks a number as stored tenths. Throws a RangeError unless it is a whole number from 0 to 100. */
export function asStored(value: number): StoredScore {
  if (!isStoredScore(value)) {
    throw new RangeError(`Stored score must be a whole number from 0 to 100, got ${String(value)}`);
  }
  return value;
}

/**
 * True for a number from 0 to 10 with at most one decimal.
 *
 * `score * 10` is not always exact, so the product is only used to find the
 * nearest tenth. The check is that dividing that tenth by 10 gives back exactly
 * the number that was passed in. Division is correctly rounded, so 83 / 10 is
 * the very double that the literal 8.3 parses to, while 8.25 (nearest tenth 83,
 * 83 / 10 = 8.3) is rejected.
 */
export function isScore(value: unknown): value is Score {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  const tenths = Math.round(value * 10);
  return tenths >= STORED_MIN && tenths <= STORED_MAX && tenths / 10 === value;
}

/** Stored tenths to the 0 to 10 score: 83 gives 8.3. */
export function toScore(stored: StoredScore): Score {
  return (asStored(stored) / 10) as Score;
}

/** A 0 to 10 score to stored tenths: 8.3 gives 83. Throws a RangeError unless `score` has at most one decimal and is within 0 to 10. */
export function toStored(score: Score): StoredScore {
  if (!isScore(score)) {
    throw new RangeError(`Score ${SCORE_SCALE_MESSAGE}, got ${String(score)}`);
  }
  return (Math.round(score * 10) || 0) as StoredScore;
}

/** The text people see: "8.3", "10.0", "0.0". */
export function formatScore(stored: StoredScore): string {
  return toScore(stored).toFixed(1);
}

/**
 * The nearest stored value to any finite number on the 0 to 10 scale, clamped
 * to range. For putting a slider position or a half-typed form value back on
 * the stored scale; never for saving what a person typed.
 */
export function nearestStored(score: number): StoredScore {
  return (Math.min(STORED_MAX, Math.max(STORED_MIN, Math.round(score * 10))) || 0) as StoredScore;
}
