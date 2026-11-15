import { RESUME_LIMITS, UPLOAD_LIMITS } from "@/lib/config";
import type { ResumeKind } from "./files";
import { SIZE_LIMIT_TEXT } from "./messages";
import {
  readZipParts,
  storedZip,
  ZipMalformedError,
  ZipTooLargeError,
  type ZipLimits,
  type ZipPart,
} from "./zip-inflate";

export type ExtractionFailure = "too_large" | "too_complex" | "timeout" | "malformed" | "unreadable";

/** A file whose text could not be read. `reason` is safe to show to a recruiter. */
export class ExtractionError extends Error {
  constructor(
    readonly failure: ExtractionFailure,
    readonly reason: string,
    cause?: unknown,
  ) {
    super(`Text extraction failed: ${failure}`, { cause });
    this.name = "ExtractionError";
  }
}

export const REASONS = {
  too_large: `The file is larger than ${SIZE_LIMIT_TEXT}.`,
  too_complex: "The file is too long or too complex to read.",
  timeout: "Reading the file took too long.",
  malformed: "The file is damaged: its contents do not match the sizes it declares.",
  unreadable: "The file could not be read. It may be damaged or password-protected.",
} as const satisfies Record<ExtractionFailure, string>;

function fail(failure: ExtractionFailure, cause?: unknown): ExtractionError {
  return new ExtractionError(failure, REASONS[failure], cause);
}

/** Postgres text cannot hold NUL, and layout whitespace is noise for later checks. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Reads a file's text. `deadline` is a `Date.now()` value the reader must not run past. */
export type TextReader = (bytes: Uint8Array, deadline: number) => Promise<string>;

export type PdfLike = {
  numPages: number;
  getPage(pageNumber: number): Promise<{
    getTextContent(): Promise<{ items: readonly unknown[] }>;
  }>;
};

function textOf(item: unknown): string {
  if (typeof item !== "object" || item === null || !("str" in item)) return "";
  const { str } = item;
  const lineEnds = "hasEOL" in item && item.hasEOL === true;
  return typeof str === "string" ? str + (lineEnds ? "\n" : "") : "";
}

/**
 * Reads a PDF page by page and checks the clock before each page, so a long
 * document stops at the deadline instead of running on. Refuses a PDF with too
 * many pages before reading any of them.
 */
export async function readPdfPages(
  pdf: PdfLike,
  deadline: number,
  now: () => number = Date.now,
): Promise<string> {
  if (pdf.numPages > RESUME_LIMITS.maxPdfPages) throw fail("too_complex");

  const pages: string[] = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    if (now() > deadline) throw fail("timeout");
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    pages.push(content.items.map(textOf).join(""));
  }
  return pages.join("\n\n");
}

/** Loads the library first, so the time guard covers reading the file, not loading code. */
async function pdfReader(): Promise<TextReader> {
  const { getDocumentProxy } = await import("unpdf");
  return async (bytes, deadline) => {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    try {
      return await readPdfPages(pdf, deadline);
    } finally {
      await pdf.loadingTask.destroy();
    }
  };
}

const DOCX_LIMITS: ZipLimits = {
  entries: RESUME_LIMITS.maxDocxEntries,
  markupBytes: RESUME_LIMITS.maxDocxMarkupBytes,
  totalBytes: RESUME_LIMITS.maxDocxUncompressedBytes,
};

/**
 * The XML parts of a DOCX, inflated under the limits before the Word parser
 * sees anything. Too many entries, too much XML or too many bytes in all is
 * "too long or too complex"; an entry whose real size is not its declared size
 * is a damaged archive, whichever way it lies; anything else is unreadable.
 */
export function docxParts(bytes: Uint8Array, limits: ZipLimits = DOCX_LIMITS): ZipPart[] {
  try {
    return readZipParts(bytes, limits);
  } catch (error) {
    if (error instanceof ZipTooLargeError) throw fail("too_complex", error);
    if (error instanceof ZipMalformedError) throw fail("malformed", error);
    throw fail("unreadable", error);
  }
}

/**
 * The Word parser is only ever given an archive rebuilt from the checked XML
 * parts, so it cannot inflate or parse more than `maxDocxMarkupBytes`.
 */
async function docxReader(): Promise<TextReader> {
  const mammoth = (await import("mammoth")).default;
  return async (bytes) => {
    const checked = storedZip(docxParts(bytes));
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(checked) });
    return value;
  };
}

export type ExtractOptions = {
  timeoutMs?: number;
  /** Replaces the PDF or DOCX reader; tests use it to simulate a slow parse. */
  reader?: TextReader;
};

/**
 * Plain text of a PDF or DOCX held in memory. No network call. Files over
 * the upload limit are refused, a PDF is read page by page against a deadline,
 * a DOCX is inflated under small caps and only its XML parts reach the parser,
 * and the whole read is abandoned after `extractTimeoutMs` whenever the parser
 * yields.
 *
 * Limit: a parser that never yields cannot be interrupted on this thread; the
 * page, entry and size caps are what bound it. See docs/BACKEND.md.
 *
 * DECISION: extraction has size, page, entry and time limits because the file
 * is untrusted. A small DOCX can inflate to gigabytes and a PDF can hold
 * thousands of pages; without the caps one upload could use up the function's
 * memory or run until the platform stops it, and the row would stay pending.
 */
export async function extractText(
  bytes: Uint8Array,
  kind: ResumeKind,
  options: ExtractOptions = {},
): Promise<string> {
  if (bytes.byteLength > UPLOAD_LIMITS.maxBytes) throw fail("too_large");

  let read: TextReader;
  try {
    read = options.reader ?? (kind === "pdf" ? await pdfReader() : await docxReader());
  } catch (error) {
    throw fail("unreadable", error);
  }

  const timeoutMs = options.timeoutMs ?? RESUME_LIMITS.extractTimeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(fail("timeout")), timeoutMs);
  });

  try {
    const work = read(bytes, Date.now() + timeoutMs);
    work.catch(() => undefined);
    return normalizeText(await Promise.race([work, timeout]));
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    throw fail("unreadable", error);
  } finally {
    clearTimeout(timer);
  }
}
