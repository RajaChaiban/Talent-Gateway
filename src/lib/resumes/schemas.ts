import { z } from "zod";
import { jobIdSchema, resumeIdSchema } from "@/lib/jobs/schemas";
import { DOCX_MIME, isAllowedMimeType, PDF_MIME } from "./files";

/** The most characters a cleaned file name may have. */
export const FILE_NAME_MAX = 255;

/** More than this is refused before any cleaning, so a huge name cannot cost work. */
const FILE_NAME_RAW_MAX = 1024;

const FILE_NAME_MISSING = "File name must have at least one printable character";
const FILE_NAME_INVALID = "File name is not valid";
const FILE_NAME_TOO_LONG = `File name must be ${FILE_NAME_MAX} characters or fewer`;

/** C0 and C1 controls (NUL, bell, ESC, ...), DEL, bidirectional overrides and isolates, and zero-width marks. */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
/** A high surrogate with no low one after it, or a low one with no high one before it. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/**
 * The name to store and show: controls, lone surrogates and direction
 * overrides removed (Postgres rejects NUL and a lone surrogate, and an
 * override can disguise an extension), normalised to NFC and trimmed.
 */
export function cleanFileName(raw: string): string {
  return raw.replace(LONE_SURROGATE, "").replace(INVISIBLE, "").normalize("NFC").trim();
}

/** The file part of a name, after the last slash of either kind. */
function lastSegment(name: string): string {
  return name.split(/[\\/]/).pop() ?? "";
}

const EXTENSION_FOR_TYPE: Readonly<Record<string, string>> = {
  [PDF_MIME]: ".pdf",
  [DOCX_MIME]: ".docx",
};

/**
 * The body of `POST /api/resumes/sign`. The type and size are only checked
 * for shape here; the route turns a wrong type into 415 and a big file into
 * 413, which a plain 400 could not tell apart. For an accepted type the name
 * must end in that type's extension, so `cv.exe` cannot be stored as a PDF.
 * `resume_id` is the id the browser chose for the row, which makes signing the
 * same file twice safe.
 */
export const signBodySchema = z
  .object({
    resume_id: resumeIdSchema.optional(),
    job_id: jobIdSchema,
    file_name: z
      .string({ error: "File name is required" })
      .max(FILE_NAME_RAW_MAX, FILE_NAME_TOO_LONG)
      .transform(cleanFileName)
      .pipe(z.string().min(1, FILE_NAME_MISSING).max(FILE_NAME_MAX, FILE_NAME_TOO_LONG))
      .refine((name) => /[^.]/.test(lastSegment(name)), FILE_NAME_INVALID),
    content_type: z.string({ error: "Content type is required" }).trim().min(1, "Content type is required"),
    size: z
      .number({ error: "Size must be a whole number of bytes" })
      .int("Size must be a whole number of bytes")
      .min(1, "The file is empty"),
  })
  .superRefine((body, ctx) => {
    if (!isAllowedMimeType(body.content_type)) return;
    const extension = EXTENSION_FOR_TYPE[body.content_type];
    if (extension && !body.file_name.toLowerCase().endsWith(extension)) {
      ctx.addIssue({
        code: "custom",
        path: ["file_name"],
        message: `File name must end in ${extension} for this file type`,
      });
    }
  });

/** The checked body of the sign route, with the file name already cleaned. */
export type SignBody = z.infer<typeof signBodySchema>;
