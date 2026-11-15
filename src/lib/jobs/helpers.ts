import type { StoredScore } from "@/lib/score";
import { parseRadarResults } from "./radar";
import type {
  Candidate,
  CandidateWithInvitation,
  NotAtsReadyResume,
  QueuedResume,
  RankedCandidate,
  ResumeCounts,
  ResumeForFilter,
} from "./types";

/** Highest match first; equal scores keep the earlier-created candidate first. */
export function sortCandidates<T extends Pick<Candidate, "match_score" | "created_at">>(
  candidates: readonly T[],
): T[] {
  return candidates.toSorted(
    (a, b) =>
      b.match_score - a.match_score || Date.parse(a.created_at) - Date.parse(b.created_at),
  );
}

/** Resumes the ATS check rejected, the recruiter has not overridden and that have no candidate row. */
export function selectNotAtsReady(
  resumes: readonly ResumeForFilter[],
  scoredResumeIds: ReadonlySet<string>,
): NotAtsReadyResume[] {
  return resumes
    .filter(
      (resume) =>
        resume.ats_status === "NOT_ATS_READY" &&
        !resume.ats_override &&
        !scoredResumeIds.has(resume.id),
    )
    .map(({ id, file_name, ats_score, ats_reasons, created_at }) => ({
      id,
      file_name,
      ats_score,
      ats_reasons,
      created_at,
    }));
}

/** True when the score is at or above the job's top-talent threshold (equal counts). */
export function isTopTalent(score: StoredScore, threshold: StoredScore): boolean {
  return score >= threshold;
}

/** Overridden resumes that have no candidate row yet: waiting for the scoring run. */
export function selectQueued(
  resumes: readonly ResumeForFilter[],
  scoredResumeIds: ReadonlySet<string>,
): QueuedResume[] {
  return resumes
    .filter((resume) => resume.ats_override && !scoredResumeIds.has(resume.id))
    .map(({ id, file_name, created_at }) => ({ id, file_name, created_at }));
}

/** Puts every resume in exactly one bucket; the buckets add up to `resumes`. */
export function countResumes(
  resumes: readonly ResumeForFilter[],
  scoredResumeIds: ReadonlySet<string>,
): ResumeCounts {
  const counts: ResumeCounts = {
    resumes: resumes.length,
    scored: 0,
    queued: 0,
    unchecked: 0,
    not_ats_ready: 0,
    awaiting_scoring: 0,
  };
  for (const resume of resumes) {
    if (scoredResumeIds.has(resume.id)) counts.scored += 1;
    else if (resume.ats_override) counts.queued += 1;
    else if (resume.ats_status === null) counts.unchecked += 1;
    else if (resume.ats_status === "NOT_ATS_READY") counts.not_ats_ready += 1;
    else counts.awaiting_scoring += 1;
  }
  return counts;
}

/** Ranked candidates with radar parsed and the resume file name and invitation attached. */
export function rankCandidates(
  rows: readonly CandidateWithInvitation[],
  resumes: readonly ResumeForFilter[],
): RankedCandidate[] {
  const fileNames = new Map(resumes.map((resume) => [resume.id, resume.file_name]));
  return sortCandidates(rows).map(({ radar_results, invitations, ...candidate }) => ({
    ...candidate,
    radar_results: parseRadarResults(radar_results),
    resume_file_name: fileNames.get(candidate.resume_id) ?? "",
    invitation: invitations,
  }));
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const LOCAL_DATE_FORMAT = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function formatWith(format: Intl.DateTimeFormat, iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : format.format(date);
}

/** Fixed locale and zone, so the server and the browser print the same text. */
export function formatJobDate(iso: string): string {
  return formatWith(DATE_FORMAT, iso);
}

/** The same date in the time zone of the machine it runs on (the viewer's browser). */
export function formatLocalJobDate(iso: string): string {
  return formatWith(LOCAL_DATE_FORMAT, iso);
}

/** "1 resume" or "3 resumes". */
export function resumeCountLabel(count: number): string {
  return count === 1 ? "1 resume" : `${count} resumes`;
}
