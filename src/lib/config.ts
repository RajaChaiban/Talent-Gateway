import { asStored, type StoredScore } from "./score";

export const APP_NAME = "Talent Gateway";
export const APP_DESCRIPTION =
  "Intelligent resume screening and candidate ranking for modern hiring teams.";

/** What a resume file may be. The `resumes` Storage bucket enforces the same type list and size. */
export const UPLOAD_LIMITS = {
  allowedMimeTypes: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  maxBytes: 5 * 1024 * 1024,
} as const;

export const RESUME_LIMITS = {
  maxFilesPerDrop: 20,
  maxPerJob: 50,
  uploadConcurrency: 3,
  extractTimeoutMs: 8_000,
  /** A PDF with more pages than this is refused before any text is read. */
  maxPdfPages: 40,
  /** A DOCX whose zip lists more entries than this is refused before inflation. */
  maxDocxEntries: 500,
  /**
   * The XML parts of a DOCX (word/document.xml, styles, relationships: everything the Word
   * parser can read) may inflate to this much together. A resume's XML is tens to a few
   * hundred KB. Measured at the cap with the densest markup: 0.4 to 0.5 s and 86 to 107 MB
   * of extra memory (60 KB: 0.1 s and 12 MB). Without the cap 1 MB cost about 1 to 1.5 s
   * and 173 MB, 3 MB 2.7 to 4 s and 340 to 408 MB.
   */
  maxDocxMarkupBytes: 512 * 1024,
  /** Every entry of a DOCX together, pictures included (they are checked, never parsed). */
  maxDocxUncompressedBytes: 8 * 1024 * 1024,
  maxFileNameLength: 100,
  /** A request that takes longer is abandoned and counted as a lost connection, so a hung one cannot hold a queue slot. */
  requestTimeoutMs: { api: 60_000, upload: 120_000 },
  /** A signed upload token lasts two hours; past this age the file is signed again before its upload is retried. */
  signedUploadMaxAgeMs: 90 * 60_000,
  retry: { maxAttempts: 5, baseMs: 1_000, capMs: 30_000, maxRetryAfterMs: 60_000 },
} as const;

/** Score bands stored in tenths (0 to 100), representing 0.0 to 10.0 */
const SCORE_BANDS = {
  /** Top talent: >= 8.0 (green), Consider: 5.0 - 7.9 (amber), Low match: < 5.0 (red) */
  trafficLight: { green: asStored(80), amber: asStored(50) },
} as const;

/** A new job starts with top talent at 8.0 and invite bar at 7.0 */
export const JOB_THRESHOLD_DEFAULTS = {
  topTalent: asStored(80),
  invite: asStored(70),
} as const;

export type TrafficLight = "green" | "amber" | "red";

export function trafficLight(score: StoredScore): TrafficLight {
  if (score >= SCORE_BANDS.trafficLight.green) return "green";
  if (score >= SCORE_BANDS.trafficLight.amber) return "amber";
  return "red";
}
