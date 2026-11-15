import type { AtsCheckId } from "@/lib/config";

/** The score bands a case can expect, in stored tenths: strong is 7.5 to 10.0 on the scale people see. */
export type Band = "strong" | "partial" | "weak";

export const BANDS: Readonly<Record<Band, { min: number; max: number }>> = {
  strong: { min: 75, max: 100 },
  partial: { min: 40, max: 74 },
  weak: { min: 0, max: 39 },
};

export type JobId =
  | "software-engineer"
  | "software-engineer-flexible"
  | "finance-manager"
  | "ai-engineer"
  | "registered-nurse"
  | "marketing-manager"
  | "account-executive";

/** The eight tests of docs/specs/pre-screen-and-evals.md, section 5. */
export type TestNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const ALL_TESTS: readonly TestNumber[] = [1, 2, 3, 4, 5, 6, 7, 8];

/** A score range in stored tenths, both ends included: { min: 80, max: 100 } is 8.0 to 10.0. */
export type ScoreRange = { min: number; max: number };

/** The five resumes written for each job of test 8 (job types). */
export type ResumeKind = "strong" | "mid" | "vague" | "related" | "unrelated";

/** Where a model case's resume text comes from. */
export type ResumeSource =
  /** A plain-text resume under evals/resumes/, committed. */
  | { kind: "written"; file: string }
  /** A labelled PDF or DOCX in the local folder, read through the real extraction. Never committed. */
  | { kind: "local"; file: string };

/** One resume scored against one job. */
export type ModelCase = {
  id: string;
  /** Tests 1 and 7 make no model call of their own. */
  test: Exclude<TestNumber, 1 | 7>;
  /** One line on what the case checks. */
  title: string;
  job: JobId;
  resume: ResumeSource;
  /** The band its score must fall in, when the case states one. */
  band?: Band;
  /** The range its score must fall in, when the case states one (test 8). */
  range?: ScoreRange;
  /** Which of a job's five resumes this is (test 8). */
  resumeKind?: ResumeKind;
  /** The resume's most recent title is the job's role, so the score must reach the role floor (test 3). */
  sameRole?: boolean;
  /** Scored `runs` times to measure stability (test 5). */
  stability?: boolean;
  /** The score must stay in this band whatever the resume asks for (test 5). */
  injection?: boolean;
};

/** Which pass mark a comparison's margin counts towards. */
export type MarginMeasure = "small_factor" | "large_factor" | "description_strictness" | "job_types";

/** Case `higher` must score above case `lower`, optionally by a stated margin. */
export type Comparison = {
  id: string;
  test: 2 | 3 | 4 | 6 | 8;
  title: string;
  higher: string;
  lower: string;
  /** A one-factor pair (test 4): counts towards factor direction as well as order. */
  factor?: boolean;
  /** The difference `higher - lower` must be at least `min` and, when given, at most `max`. */
  margin?: { min: number; max?: number; measure: MarginMeasure };
};

/** What the ATS check must say about a labelled local file (test 1). */
export type FileExpectation =
  | { file: string; expect: "ready"; band: Band; rank: number }
  /** `checks`: the failed checks the file name names; empty when it names none, so any reason passes. */
  | { file: string; expect: "set_aside"; checks: readonly AtsCheckId[] };

/** The whole set for one run. */
export type EvalSet = {
  cases: ModelCase[];
  comparisons: Comparison[];
  files: FileExpectation[];
};

/** What the ATS check (after the real extraction) said about one local file. */
export type StructureOutcome = {
  file: string;
  status: "ready" | "set_aside";
  /** Failed check ids, or `extraction:<failure>` when the text could not be read at all. */
  failed: string[];
};

/** What the ATS check said about one test 8 resume text, or a negative built from one (no model). */
export type FilteringOutcome = {
  id: string;
  /** The failed checks it must be set aside on, exactly; empty when it must be ATS_READY. */
  expected: readonly AtsCheckId[];
  status: "ready" | "set_aside";
  failed: string[];
  ok: boolean;
};

export type MustHaveStatus = "shown" | "equivalent" | "listed" | "missing";

/**
 * How the app added up one score, on the 0 to 10 scale: the start and each
 * part before the additions are scaled by start / 5. `requirement` is null
 * for a local file, whose text is never kept.
 */
export type Breakdown = {
  roleMatch: "same" | "related" | "unrelated";
  start: number;
  skills: number;
  evidence: number;
  proofOfWork: number;
  education: number;
  mustHaves: Array<{ requirement: string | null; status: MustHaveStatus }>;
};

/** One model call for one case. `run` counts from 0; run 0 is the case's score. */
export type CallOutcome = {
  caseId: string;
  run: number;
  seconds: number;
  inputTokens: number | null;
  outputTokens: number | null;
} & (
  /** `score`: the total in stored tenths. */
  | { ok: true; score: number; breakdown: Breakdown }
  /** `invalidOutput`: the model's answer failed the schema twice; otherwise a transport, timeout or rate-limit error. */
  | { ok: false; error: string; invalidOutput: boolean }
);

/** USD per token, from the gateway's published rates. */
export type Price = { input: number; output: number };
