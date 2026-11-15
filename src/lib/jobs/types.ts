import type { StoredScore } from "@/lib/score";
import type { Tables } from "@/lib/supabase/database.types";

/**
 * Database rows with their score columns typed as `StoredScore`. The generated
 * database types stay plain numbers; the `as...` functions below are the one
 * place a row from the database is marked as holding stored tenths.
 */
type Branded<T> = T extends number ? StoredScore : T;
type StoredRow<Row, Key extends keyof Row> = Omit<Row, Key> & {
  [K in Key]: Branded<Row[K]>;
};

type JobRow = Tables<"jobs">;

type Job = StoredRow<JobRow, "top_talent_threshold" | "invite_threshold">;

export type JobListItem = Omit<Job, "description"> & { resume_count: number };

type ListRow = Omit<JobRow, "description">;

/**
 * The database constrains both thresholds to whole numbers from 0 to 100, so
 * the values are not rechecked here.
 */
export function asJobListItem(row: ListRow, resumeCount: number): JobListItem {
  return { ...row, resume_count: resumeCount } as JobListItem;
}
