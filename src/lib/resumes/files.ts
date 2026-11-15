import { RESUME_LIMITS, UPLOAD_LIMITS } from "@/lib/config";

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const PDF_MIME = "application/pdf";

export type ResumeKind = "pdf" | "docx";

/** The type a file name claims by its extension. */
export function kindOfFileName(fileName: string): ResumeKind | null {
  const name = fileName.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  return null;
}

export function isAllowedMimeType(contentType: string): boolean {
  return (UPLOAD_LIMITS.allowedMimeTypes as readonly string[]).includes(contentType);
}

/**
 * A name that is safe inside a storage key: no folders, no control or
 * non-ASCII characters, at most `maxFileNameLength` characters, and the
 * extension kept. The original name lives in `resumes.file_name`.
 */
export function safeFileName(original: string): string {
  const base = original.split(/[\\/]/).pop() ?? "";
  const ascii = base
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_{2,}/g, "_");

  const dot = ascii.lastIndexOf(".");
  const hasExtension = dot > 0 && /^\.[A-Za-z0-9]{1,5}$/.test(ascii.slice(dot));
  const extension = hasExtension ? ascii.slice(dot) : "";
  const stem = (hasExtension ? ascii.slice(0, dot) : ascii).replace(/^[._-]+|[._-]+$/g, "");
  const cut = stem.slice(0, RESUME_LIMITS.maxFileNameLength - extension.length);
  return `${cut || "resume"}${extension}`;
}

export function storagePath(jobId: string, resumeId: string, fileName: string): string {
  return `${jobId}/${resumeId}/${safeFileName(fileName)}`;
}
