import { UPLOAD_LIMITS } from "@/lib/config";
import { ExtractionError, extractText, REASONS } from "./extract-text";
import { STORED_FAILED_MESSAGE } from "./messages";
import { kindOfFileName, type ResumeKind } from "./files";
import { detectKind } from "./sniff";
import { completeResume, downloadResumeFile } from "./queries";
import type { StoredResume } from "./types";
import type { ServerClient } from "@/lib/auth/verified-user";

/** Shown when the stored file has no bytes. */
export const EMPTY_FILE_MESSAGE = "The file is empty.";
/** Shown when the bytes are neither a PDF nor a DOCX, whatever the name or the declared type says. */
export const WRONG_TYPE_MESSAGE = "The file is not a real PDF or Word (.docx) document.";

/** The bytes are one supported type and the name says the other. */
export const MISTYPED_MESSAGE: Record<ResumeKind, string> = {
  docx: "This is a Word file saved with a .pdf name.",
  pdf: "This is a PDF file saved with a .docx name.",
};

/** The outcome of `completeUpload`: `missing` (no file in storage), `gone` (the row was removed meanwhile), or `done` with the character count or the failure message. */
export type CompleteResult =
  | { state: "missing" }
  | { state: "gone" }
  | { state: "done"; status: "extracted"; characters: number }
  | { state: "done"; status: "failed"; characters: 0; message: string };

/**
 * Reads the uploaded file, checks what it really is, extracts its text and
 * saves the outcome. Safe to repeat: a resume whose text is stored is
 * answered as extracted and a failed one as failed, without downloading the
 * file again, unless the caller asks for an explicit `retry` of a failed
 * one, which judges the file once more.
 *
 * DECISION: the file is judged by its bytes, not by the type the browser
 * declared. The declared type and the name come from the browser and can say
 * anything; the bytes are what the readers will parse, so a file that is not
 * really a PDF or DOCX is refused before any reader sees it.
 */
export async function completeUpload(
  supabase: Pick<ServerClient, "from" | "storage">,
  resume: StoredResume,
  options: { retry?: boolean } = {},
): Promise<CompleteResult> {
  if (resume.extracted_text !== null) {
    return { state: "done", status: "extracted", characters: resume.extracted_text.length };
  }
  if (resume.status === "failed" && !options.retry) {
    return { state: "done", status: "failed", characters: 0, message: STORED_FAILED_MESSAGE };
  }

  const bytes = await downloadResumeFile(supabase, resume.storage_path);
  if (!bytes) return { state: "missing" };

  const failure = async (message: string): Promise<CompleteResult> => {
    if (!(await completeResume(supabase, resume.id, { status: "failed" }))) return { state: "gone" };
    return { state: "done", status: "failed", characters: 0, message };
  };

  if (bytes.byteLength === 0) return failure(EMPTY_FILE_MESSAGE);
  // The size the sign route was told is not stored; the bytes that arrived are what count.
  // The bucket's own file-size limit is the first line of defence, this is the second.
  if (bytes.byteLength > UPLOAD_LIMITS.maxBytes) return failure(REASONS.too_large);
  const kind = detectKind(bytes);
  if (!kind) return failure(WRONG_TYPE_MESSAGE);
  const declared = kindOfFileName(resume.file_name);
  if (declared && declared !== kind) return failure(MISTYPED_MESSAGE[kind]);

  try {
    const { text, imageCount } = await extractText(bytes, kind);
    const saved = await completeResume(supabase, resume.id, {
      status: "extracted",
      extractedText: text,
      imageCount,
    });
    if (!saved) {
      return { state: "gone" };
    }
    return { state: "done", status: "extracted", characters: text.length };
  } catch (error) {
    if (error instanceof ExtractionError) return failure(error.reason);
    throw error;
  }
}
