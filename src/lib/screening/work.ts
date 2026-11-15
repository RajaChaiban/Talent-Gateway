/**
 * Pure rules for which resumes still need analysis and how far a job has got.
 * Everything is derived from rows, so the answer is right after a crash, a
 * retried call or a closed tab.
 */

export type JobStatus = "CREATED" | "ANALYZING" | "DONE" | "ERROR";

/** One resume as the selection and progress rules see it. */
export type WorkRow = {
  id: string;
  /** `resumes.status`: pending, extracted, or failed (extraction or analysis failed). */
  status: string;
  ats_status: string | null;
  ats_override: boolean;
  /** `extracted_text` is not null. */
  has_text: boolean;
};

/**
 * A resume needs work when it has text, has no candidate, and either has no ATS
 * result yet or passed (or was overridden). A resume whose analysis failed
 * keeps its ATS result and still needs work, so Analyze picks it up again.
 */
export function needsWork(row: WorkRow, scored: ReadonlySet<string>): boolean {
  if (!row.has_text || scored.has(row.id)) return false;
  return row.ats_status === null || row.ats_status === "ATS_READY" || row.ats_override;
}

export function resumesNeedingWork(
  rows: readonly WorkRow[],
  scored: ReadonlySet<string>,
): string[] {
  return rows.filter((row) => needsWork(row, scored)).map((row) => row.id);
}

/** A job's resumes and the ids that have a candidate. */
export type Work = { rows: WorkRow[]; scored: Set<string> };

export type Progress = {
  /** Every resume of the job, uploads in progress included. */
  total: number;
  /** Resumes with extracted text. */
  extracted: number;
  /** Not ATS-ready and not overridden. */
  ats_failed: number;
  /** Resumes with a candidate row. */
  scored: number;
  /** Resumes with text whose analysis failed (status `failed`); retryable. */
  failed: number;
  /** Resumes that need work and have not failed: what a running Analyze is still waiting for. */
  remaining: number;
};

export function summarize(rows: readonly WorkRow[], scored: ReadonlySet<string>): Progress {
  const withText = rows.filter((row) => row.has_text);
  const failed = withText.filter((row) => row.status === "failed" && !scored.has(row.id));
  return {
    total: rows.length,
    extracted: withText.length,
    ats_failed: withText.filter(
      (row) => row.ats_status === "NOT_ATS_READY" && !row.ats_override && !scored.has(row.id),
    ).length,
    scored: rows.filter((row) => scored.has(row.id)).length,
    failed: failed.length,
    remaining: withText.filter((row) => needsWork(row, scored) && row.status !== "failed").length,
  };
}

/**
 * The status a job in ANALYZING should move to, or null to leave it: DONE when
 * nothing remains, ERROR when nothing remains and every resume with text failed.
 */
export function settledStatus(current: string, progress: Progress): JobStatus | null {
  if (current !== "ANALYZING" || progress.remaining > 0) return null;
  return progress.failed > 0 && progress.failed === progress.extracted ? "ERROR" : "DONE";
}
