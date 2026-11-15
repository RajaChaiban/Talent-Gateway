import { toScore, type Score, type StoredScore } from "@/lib/score";
import type { Job } from "./types";

/**
 * The one place a job leaves the server as JSON. Queries and database types
 * hold stored tenths (`StoredScore`); every score that crosses the API is a
 * `Score` on the 0 to 10 scale. No route builds its own response body.
 *
 * Whole values are sent as plain JSON numbers (`8`, `10`), not `8.0`; clients
 * format with one decimal.
 */

/** The keys of `Row` whose value is a stored score (or null). Already-serialised keys are not. */
type StoredKey<Row> = {
  [K in keyof Row]: Row[K] extends StoredScore | null ? K : never;
}[keyof Row];

type ShownBrand<T> = T extends StoredScore ? Score : T;
type Shown<Row, Key extends keyof Row> = Omit<Row, Key> & {
  [K in Key]: ShownBrand<Row[K]>;
};

export type ApiJob = Shown<Job, "top_talent_threshold" | "invite_threshold">;

export const JOB_SCORES = ["top_talent_threshold", "invite_threshold"] as const;

/** Converts the named stored-score fields of `row` to 0 to 10 scores. A field that was already converted does not type-check. */
export function toApi<Row extends object, Key extends StoredKey<Row>>(
  row: Row,
  keys: readonly Key[],
): Shown<Row, Key> {
  const out = { ...row } as Record<PropertyKey, unknown>;
  for (const key of keys) {
    const value: unknown = row[key];
    out[key] = value === null ? null : toScore(value as StoredScore);
  }
  return out as unknown as Shown<Row, Key>;
}
