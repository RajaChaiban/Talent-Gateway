import { STORED_FAILED_MESSAGE, UPLOAD_UNFINISHED_MESSAGE } from "./messages";
import type { ResumeListItem } from "./types";

/** The label a stored resume shows, and its tone, which picks the colour. */
export type SavedStatus = { tone: "success" | "warning" | "error"; text: string };

/**
 * What a stored resume shows on the job page: `extracted` is ready, `failed`
 * means the upload or the read failed so the file has to be uploaded again,
 * and anything else is an upload that never finished.
 */
export function savedResumeStatus(resume: Pick<ResumeListItem, "status">): SavedStatus {
  if (resume.status === "extracted") return { tone: "success", text: "Ready" };
  if (resume.status === "failed") return { tone: "error", text: STORED_FAILED_MESSAGE };
  return { tone: "warning", text: UPLOAD_UNFINISHED_MESSAGE };
}

/**
 * Whether the stored file can be downloaded. `extracted` and `failed` are
 * only written after the file was read back from storage, so both have one;
 * a `pending` row is an upload that may never have arrived.
 */
export function hasStoredFile(resume: Pick<ResumeListItem, "status">): boolean {
  return resume.status === "extracted" || resume.status === "failed";
}

/** The download route for one resume's file. */
export function resumeFileHref(resumeId: string): string {
  return `/api/resumes/${encodeURIComponent(resumeId)}/file`;
}
