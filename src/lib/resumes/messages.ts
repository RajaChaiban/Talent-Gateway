import { RESUME_LIMITS, UPLOAD_LIMITS } from "@/lib/config";

/** "5 MB", derived from the upload limit so the text can never disagree with the check. */
export const SIZE_LIMIT_TEXT = `${UPLOAD_LIMITS.maxBytes >> 20} MB`;

/** The file rule shown beside the drop zone: the types and the size limit. */
export const FILE_RULE_MESSAGE = `PDF or DOCX, up to ${SIZE_LIMIT_TEXT}`;

/** Refusal for a file that is not a PDF or a DOCX. */
export const TYPE_REJECTED = `Only PDF or Word (.docx) files up to ${SIZE_LIMIT_TEXT} are accepted.`;
/** Refusal for a file over the size limit. Also shown when storage answers 413. */
export const SIZE_REJECTED = `This file is larger than ${SIZE_LIMIT_TEXT}.`;
/** Refusal for a file with no bytes, found in the browser before upload. */
export const EMPTY_REJECTED = "This file is empty.";
/** Refusal for a file beyond the per-drop limit. */
export const DROP_LIMIT_REJECTED = `Only ${RESUME_LIMITS.maxFilesPerDrop} files can be added at a time.`;

/** Used by the browser check and by the sign route. */
export const JOB_FULL_MESSAGE = `A job holds at most ${RESUME_LIMITS.maxPerJob} resumes. Remove one to add another.`;

/** What a resume whose upload or read failed shows when its own reason is not known (after a reload). */
export const STORED_FAILED_MESSAGE =
  "This file could not be read. Remove it and upload it again.";

/** A row whose file never arrived or was never read. */
export const UPLOAD_UNFINISHED_MESSAGE = "Upload did not finish";

/** Storage answered 415 (invalid_mime_type): the bucket only holds PDF and DOCX. */
export const TYPE_REFUSED_BY_STORAGE = "This file type was refused by storage.";

/** Shown when storage stayed busy through every retry. */
export const STORAGE_BUSY_MESSAGE = "File storage is busy. Try again in a moment.";
