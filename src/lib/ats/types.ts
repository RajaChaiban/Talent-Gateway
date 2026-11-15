import type { AtsCheckId } from "@/lib/config";

/** Whether a resume is readable enough to go on to AI scoring. */
export type AtsStatus = "ATS_READY" | "NOT_ATS_READY";

/** What the ATS check reads about one resume file. */
export type AtsInput = {
  /** Text extracted from the resume file. */
  text: string;
  /** MIME type of the uploaded file; parameters such as "; charset=" are ignored. */
  contentType: string;
  sizeBytes: number;
  /** Pictures counted in the file when its text was extracted; null when it was not counted, which passes the picture check. */
  imageCount: number | null;
};

/** The outcome of one ATS check. */
export type CheckResult = {
  id: AtsCheckId;
  passed: boolean;
  /** Points this check adds to the score when it passes. */
  weight: number;
  /** A failed required check makes the resume NOT_ATS_READY whatever the score. */
  required: boolean;
  /**
   * What was measured: characters read (readable_text), emails found (contact_info),
   * phone numbers found (phone), sections found (standard_sections), symbol share 0 to 1
   * (layout_noise), file size in bytes (file), pictures counted (picture; 0 when not counted).
   */
  value: number;
};

/** The outcome of the whole ATS check for one resume. */
export type AtsResult = {
  status: AtsStatus;
  /** 0 to 100: the sum of the weights of the passed checks. ATS_READY needs this at the pass mark and every required check passed. */
  score: number;
  /** One sentence per failed check, in the order of the checks; empty when all pass. */
  reasons: string[];
  /** All seven checks, always in the same order. */
  checks: CheckResult[];
};
