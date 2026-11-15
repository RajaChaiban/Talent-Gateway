import { RESUME_LIMITS, UPLOAD_LIMITS } from "@/lib/config";
import type { ResumeKind } from "./files";
import { SIZE_LIMIT_TEXT } from "./messages";
import {
  readZipParts,
  storedZip,
  ZipMalformedError,
  ZipTooLargeError,
  type ZipContents,
  type ZipLimits,
} from "./zip-inflate";

/** Why a read failed. Each value has a recruiter-safe sentence in `REASONS`. */
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

/** The sentence shown to the recruiter for each `ExtractionFailure`. None of them carries file content. */
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

/** What a file holds: its text, and how many pictures it holds (null when they were not counted). */
export type Extracted = { text: string; imageCount: number | null };

/** Reads a file's text and counts its pictures. `deadline` is a `Date.now()` value the reader must not run past. */
export type TextReader = (bytes: Uint8Array, deadline: number) => Promise<Extracted>;

/** The few members of a pdf.js document that `readPdfPages` uses, so a stand-in can replace it in tests. */
export type PdfLike = {
  numPages: number;
  getPage(pageNumber: number): Promise<{
    getTextContent(): Promise<{ items: readonly unknown[] }>;
    /** The page's drawing operations; only their operator codes are read. */
    getOperatorList(): Promise<{ fnArray: readonly number[] }>;
  }>;
};

/** The pdf.js operator codes that paint a picture. */
export type ImagePaintOps = ReadonlySet<number>;

type PdfOps = Readonly<
  Record<
    | "paintImageXObject"
    | "paintImageXObjectRepeat"
    | "paintInlineImageXObject"
    | "paintInlineImageXObjectGroup"
    | "paintImageMaskXObject"
    | "paintImageMaskXObjectGroup"
    | "paintImageMaskXObjectRepeat",
    number
  >
>;

/**
 * Every pdf.js operation that paints a picture, taken from its `OPS` table: an
 * image object, an inline image or an image mask, and the grouped and repeated
 * forms pdf.js merges runs of them into. Each operation counts as one picture,
 * so a picture repeated in one run (a row of identical icons) counts once. A
 * 1x1 mask that pdf.js turns into a solid fill (`paintSolidColorImageMask`) is
 * a fill, not a picture, and is left out.
 */
export function imagePaintOps(ops: PdfOps): ImagePaintOps {
  return new Set([
    ops.paintImageXObject,
    ops.paintImageXObjectRepeat,
    ops.paintInlineImageXObject,
    ops.paintInlineImageXObjectGroup,
    ops.paintImageMaskXObject,
    ops.paintImageMaskXObjectGroup,
    ops.paintImageMaskXObjectRepeat,
  ]);
}

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
 *
 * Pictures are counted from each page's operator list (its drawing operations,
 * built without rendering anything): every operation in `imageOps` is one
 * picture. A page whose operations cannot be listed fails the whole read like
 * any other unreadable page, so a picture is never hidden by a count that
 * quietly gave up.
 */
export async function readPdfPages(
  pdf: PdfLike,
  deadline: number,
  imageOps: ImagePaintOps,
  now: () => number = Date.now,
): Promise<Extracted> {
  if (pdf.numPages > RESUME_LIMITS.maxPdfPages) throw fail("too_complex");

  const pages: string[] = [];
  let imageCount = 0;
  for (let number = 1; number <= pdf.numPages; number += 1) {
    if (now() > deadline) throw fail("timeout");
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    pages.push(content.items.map(textOf).join(""));
    const { fnArray } = await page.getOperatorList();
    imageCount += fnArray.filter((op) => imageOps.has(op)).length;
  }
  return { text: pages.join("\n\n"), imageCount };
}

/** Loads the library first, so the time guard covers reading the file, not loading code. */
async function pdfReader(): Promise<TextReader> {
  const { getDocumentProxy, getResolvedPDFJS } = await import("unpdf");
  const imageOps = imagePaintOps((await getResolvedPDFJS()).OPS);
  return async (bytes, deadline) => {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    try {
      return await readPdfPages(pdf, deadline, imageOps);
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

/** Where a DOCX keeps its pictures. Part names are case-insensitive in the package format. */
const DOCX_MEDIA_FOLDER = "word/media/";

/**
 * The pictures of a DOCX: the files in its `word/media/` folder (a folder entry
 * itself is not counted). Names are decoded as UTF-8, which leaves the ASCII
 * folder name intact whatever the archive's name encoding.
 */
export function docxImageCount(contents: ZipContents): number {
  const decoder = new TextDecoder();
  return contents.names.filter((raw) => {
    const name = decoder.decode(raw).toLowerCase();
    return name.startsWith(DOCX_MEDIA_FOLDER) && !name.endsWith("/");
  }).length;
}

/**
 * The XML parts of a DOCX, inflated under the limits before the Word parser
 * sees anything, and the names of all its entries. Too many entries, too much
 * XML or too many bytes in all is "too long or too complex"; an entry whose
 * real size is not its declared size is a damaged archive, whichever way it
 * lies; anything else is unreadable.
 */
export function docxParts(bytes: Uint8Array, limits: ZipLimits = DOCX_LIMITS): ZipContents {
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
 * parts, so it cannot inflate or parse more than `maxDocxMarkupBytes`. The
 * pictures are counted from the same checked walk of the archive.
 */
async function docxReader(): Promise<TextReader> {
  const mammoth = (await import("mammoth")).default;
  return async (bytes) => {
    const contents = docxParts(bytes);
    const checked = storedZip(contents.parts);
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(checked) });
    return { text: value, imageCount: docxImageCount(contents) };
  };
}

/** Optional overrides for `extractText`. `timeoutMs` defaults to `RESUME_LIMITS.extractTimeoutMs`. */
export type ExtractOptions = {
  timeoutMs?: number;
  /** Replaces the PDF or DOCX reader; tests use it to simulate a slow parse. */
  reader?: TextReader;
};

/**
 * Plain text of a PDF or DOCX held in memory, and the number of pictures it
 * holds (see `readPdfPages` and `docxImageCount`). No network call. Files over
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
): Promise<Extracted> {
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
    const { text, imageCount } = await Promise.race([work, timeout]);
    return { text: normalizeText(text), imageCount };
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    throw fail("unreadable", error);
  } finally {
    clearTimeout(timer);
  }
}
