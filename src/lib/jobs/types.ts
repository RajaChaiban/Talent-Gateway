import type { StoredScore } from "@/lib/score";
import type { Tables } from "@/lib/supabase/database.types";
import type { RadarResults } from "./radar";

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
type CandidateRow = Tables<"candidates">;
type ResumeRow = Tables<"resumes">;

export type Job = StoredRow<JobRow, "top_talent_threshold" | "invite_threshold">;
export type Candidate = StoredRow<CandidateRow, "match_score">;

export type JobListItem = Omit<Job, "description"> & { resume_count: number };

export type NotAtsReadyResume = StoredRow<
  Pick<ResumeRow, "id" | "file_name" | "ats_score" | "ats_reasons" | "created_at">,
  "ats_score"
>;

export type ResumeForFilter = NotAtsReadyResume &
  Pick<ResumeRow, "ats_status" | "ats_override">;

/** A candidate as the job page uses it: radar parsed and resume file name attached. */
export type RankedCandidate = Omit<Candidate, "radar_results"> & {
  radar_results: RadarResults;
  resume_file_name: string;
};

export type QueuedResume = Pick<NotAtsReadyResume, "id" | "file_name" | "created_at">;

/**
 * Every resume of a job is in exactly one of these, so the numbers add up to
 * `resumes`: scored (has a candidate row), queued (overridden, not scored yet),
 * unchecked (no ATS result), not ATS-ready (set aside), or awaiting scoring
 * (ATS-ready, no candidate row yet).
 */
export type ResumeCounts = {
  resumes: number;
  scored: number;
  queued: number;
  unchecked: number;
  not_ats_ready: number;
  awaiting_scoring: number;
};

/** What the job page shows below the resumes: the ranked candidates and the resumes not ranked yet. */
export type JobPage = {
  job: Job;
  candidates: RankedCandidate[];
  notAtsReady: NotAtsReadyResume[];
  queued: QueuedResume[];
  counts: ResumeCounts;
};

type ListRow = Omit<JobRow, "description">;
type ResumeFilterRow = Pick<
  ResumeRow,
  "id" | "file_name" | "ats_score" | "ats_reasons" | "created_at" | "ats_status" | "ats_override"
>;

/**
 * The database constrains both thresholds to whole numbers from 0 to 100, so
 * the values are not rechecked here.
 */
export function asJob(row: JobRow): Job {
  return row as Job;
}

export function asJobListItem(row: ListRow, resumeCount: number): JobListItem {
  return { ...row, resume_count: resumeCount } as JobListItem;
}

/** A candidate row read on its own (the screening pipeline), with its score as stored tenths. */
export function asCandidate(row: CandidateRow): Candidate {
  return row as Candidate;
}

export function asResumesForFilter(rows: ResumeFilterRow[]): ResumeForFilter[] {
  return rows as ResumeForFilter[];
}
