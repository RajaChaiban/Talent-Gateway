import type { AtsCheckId } from "@/lib/config";

export type AtsStatus = "ATS_READY" | "NOT_ATS_READY";

export type AtsInput = {
  /** Text extracted from the resume file. */
  text: string;
  /** MIME type of the uploaded file; parameters such as "; charset=" are ignored. */
  contentType: string;
  sizeBytes: number;
};

export type CheckResult = {
  id: AtsCheckId;
  passed: boolean;
  /** Points this check adds to the score when it passes. */
  weight: number;
  /** A failed required check makes the resume NOT_ATS_READY whatever the score. */
  required: boolean;
  /**
   * What was measured: characters read (readable_text), emails found (contact_info),
   * sections found (standard_sections), symbol share 0 to 1 (layout_noise),
   * file size in bytes (file).
   */
  value: number;
};

export type AtsResult = {
  status: AtsStatus;
  /** 0 to 100: the sum of the weights of the passed checks. ATS_READY needs this at the pass mark and every required check passed. */
  score: number;
  /** One sentence per failed check, in the order of the checks; empty when all pass. */
  reasons: string[];
  /** All five checks, always in the same order. */
  checks: CheckResult[];
};
