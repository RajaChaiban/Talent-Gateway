import { RESUME_LIMITS, UPLOAD_LIMITS } from "@/lib/config";
import { DOCX_MIME, isAllowedMimeType, kindOfFileName, PDF_MIME } from "./files";
import {
  DROP_LIMIT_REJECTED,
  EMPTY_REJECTED,
  JOB_FULL_MESSAGE,
  SIZE_REJECTED,
  TYPE_REJECTED,
} from "./messages";

type FileLike = { name: string; type: string; size: number };

export type AcceptedFile<T extends FileLike> = { file: T; contentType: string };
export type RejectedFile = { name: string; reason: string };

/** What a browser reports when it does not know a file's type. */
const UNKNOWN_TYPE = "application/octet-stream";

const MIME_FOR_KIND = { pdf: PDF_MIME, docx: DOCX_MIME } as const;

/**
 * The content type to upload a file as. Browsers sometimes report no type for
 * a Word file, either an empty `type` or `application/octet-stream`; the
 * extension is used then, never otherwise. The server judges the file by its
 * bytes either way.
 */
export function contentTypeFor(file: Pick<FileLike, "name" | "type">): string | null {
  if (file.type && file.type !== UNKNOWN_TYPE) {
    return isAllowedMimeType(file.type) ? file.type : null;
  }
  const kind = kindOfFileName(file.name);
  return kind ? MIME_FOR_KIND[kind] : null;
}

/**
 * Splits dropped files into the ones to upload and the ones refused, each
 * refusal with its own message. The per-drop limit counts valid files only, so
 * invalid ones never use up its slots. `existing` is how many resumes the job
 * already holds or is about to hold.
 */
export function validateDrop<T extends FileLike>(
  files: readonly T[],
  existing: number,
): { accepted: AcceptedFile<T>[]; rejected: RejectedFile[] } {
  const accepted: AcceptedFile<T>[] = [];
  const rejected: RejectedFile[] = [];

  for (const file of files) {
    const contentType = contentTypeFor(file);
    if (!contentType) {
      rejected.push({ name: file.name, reason: TYPE_REJECTED });
    } else if (file.size === 0) {
      rejected.push({ name: file.name, reason: EMPTY_REJECTED });
    } else if (file.size > UPLOAD_LIMITS.maxBytes) {
      rejected.push({ name: file.name, reason: SIZE_REJECTED });
    } else if (accepted.length >= RESUME_LIMITS.maxFilesPerDrop) {
      rejected.push({ name: file.name, reason: DROP_LIMIT_REJECTED });
    } else if (existing + accepted.length >= RESUME_LIMITS.maxPerJob) {
      rejected.push({ name: file.name, reason: JOB_FULL_MESSAGE });
    } else {
      accepted.push({ file, contentType });
    }
  }

  return { accepted, rejected };
}
