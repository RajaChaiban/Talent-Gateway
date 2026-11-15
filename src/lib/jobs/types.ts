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
type InvitationRow = Tables<"invitations">;

/** A job row with its thresholds as stored tenths. */
export type Job = StoredRow<JobRow, "top_talent_threshold" | "invite_threshold">;
/** A candidate row with its match score as stored tenths. */
export type Candidate = StoredRow<CandidateRow, "match_score">;

/** A job as the list shows it: no description, plus the number of resumes. */
export type JobListItem = Omit<Job, "description"> & { resume_count: number };

/** A resume the ATS check set aside, with what the job page shows of it. */
export type NotAtsReadyResume = StoredRow<
  Pick<ResumeRow, "id" | "file_name" | "ats_score" | "ats_reasons" | "created_at">,
  "ats_score"
>;

/** A resume with its ATS status and override, so it can be sorted into the groups of ResumeCounts. */
export type ResumeForFilter = NotAtsReadyResume &
  Pick<ResumeRow, "ats_status" | "ats_override">;

/** What the job page shows of a candidate's invitation. */
type InvitationSummary = Pick<InvitationRow, "sent_to" | "sent_at" | "approved_at">;

/** A candidate row read with its invitation (null when it has none) in the same query. */
export type CandidateWithInvitation = Candidate & { invitations: InvitationSummary | null };

/** A candidate as the job page uses it: radar parsed, resume file name and invitation attached. */
export type RankedCandidate = Omit<Candidate, "radar_results"> & {
  radar_results: RadarResults;
  resume_file_name: string;
  invitation: InvitationSummary | null;
};

/** A resume the recruiter overrode that is waiting to be scored. */
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

/** Adds the resume count to a job row without its description. */
export function asJobListItem(row: ListRow, resumeCount: number): JobListItem {
  return { ...row, resume_count: resumeCount } as JobListItem;
}

/** A candidate row read on its own (the screening pipeline), with its score as stored tenths. */
export function asCandidate(row: CandidateRow): Candidate {
  return row as Candidate;
}

/** A candidate row with its embedded invitation, with its score as stored tenths. */
export function asCandidateWithInvitation(
  row: CandidateRow & { invitations: InvitationSummary | null },
): CandidateWithInvitation {
  return row as CandidateWithInvitation;
}

/** Marks resume rows read for sorting into groups as ResumeForFilter. */
export function asResumesForFilter(rows: ResumeFilterRow[]): ResumeForFilter[] {
  return rows as ResumeForFilter[];
}
