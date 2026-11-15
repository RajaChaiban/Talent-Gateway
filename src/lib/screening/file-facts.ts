import type { AtsInput } from "@/lib/ats/types";

const BY_EXTENSION: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/**
 * Size the ATS file check is given. `resumes` stores no size: the upload routes
 * refuse a file over 5 MB (and the bucket enforces the same limit) before a row
 * can reach `extracted`, so every stored file is within the limit.
 */
export const STORED_FILE_SIZE_BYTES = 0;

/**
 * The file facts for `checkAts`. `resumes` has no content-type column, so the
 * type comes from the file name's extension; the upload route has already
 * checked the real type from the file's first bytes. Any other extension is
 * passed on as unknown, and the file check fails it.
 */
export function fileFacts(fileName: string): Pick<AtsInput, "contentType" | "sizeBytes"> {
  const extension = /\.([a-z0-9]+)$/i.exec(fileName.trim())?.[1]?.toLowerCase() ?? "";
  return {
    contentType: BY_EXTENSION[extension] ?? "application/octet-stream",
    sizeBytes: STORED_FILE_SIZE_BYTES,
  };
}

/** The candidate's name when the model gives none: the file name without its extension. */
export function nameFromFileName(fileName: string): string {
  const base = fileName.trim().replace(/\.[a-z0-9]+$/i, "").trim();
  return base.length > 0 ? base : fileName.trim();
}
