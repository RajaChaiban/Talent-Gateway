/**
 * The only place that converts between the two scales, and it imports nothing,
 * so client components can use it without pulling anything else into a bundle.
 *
 * Stored scores are whole tenths from 0 to 100 (83 in the database). People see
 * scores from 0.0 to 10.0 with one decimal (8.3). The two are different types,
 * so passing one where the other belongs is a compile error.
 */

declare const storedBrand: unique symbol;
declare const shownBrand: unique symbol;

/** Whole tenths from 0 to 100, as the database, queries, config and functions hold them. */
export type StoredScore = number & { readonly [storedBrand]: true };

/** A score from 0 to 10 with at most one decimal: what people see. */
type Score = number & { readonly [shownBrand]: true };

const STORED_MIN = 0;
const STORED_MAX = 100;

function isStoredScore(value: unknown): value is StoredScore {
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

/** Stored tenths to the 0 to 10 score: 83 gives 8.3. */
function toScore(stored: StoredScore): Score {
  return (asStored(stored) / 10) as Score;
}

/** The text people see: "8.3", "10.0", "0.0". */
export function formatScore(stored: StoredScore): string {
  return toScore(stored).toFixed(1);
}
