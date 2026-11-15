import { z } from "zod";
import type { Grade } from "./grade";
import type { RunMeta } from "./report";
import { ALL_TESTS, type TestNumber } from "./types";

/**
 * The scores of one run as a small JSON file next to its report
 * (`docs/evals/<same-name>.json`), for `npm run eval:compare`. It holds each
 * case's score, role match and parts only: no resume text, no names and no
 * must-have texts.
 */

const parts = z.object({
  start: z.number(),
  skills: z.number(),
  evidence: z.number(),
  proofOfWork: z.number(),
  education: z.number(),
});

const caseScores = z.object({
  test: z.number().int(),
  job: z.string(),
  /** The total in stored tenths, or null when the case has no score. */
  score: z.number().nullable(),
  roleMatch: z.enum(["same", "related", "unrelated"]).nullable(),
  parts: parts.nullable(),
});

const testNumber = z.number().refine((value): value is TestNumber => ALL_TESTS.some((test) => test === value), {
  message: "a test number from 1 to 8",
});

/** The shape of the scores JSON a run writes; `eval:compare` checks any file it reads against it. */
export const scoresFileSchema = z.object({
  model: z.string(),
  standIn: z.boolean(),
  promptVersion: z.string(),
  date: z.string(),
  label: z.string(),
  tests: z.array(testNumber),
  /** Total cost in USD at the gateway's rates, or null when unknown. */
  costUsd: z.number().nullable(),
  medianSeconds: z.number().nullable(),
  calls: z.number().int(),
  cases: z.record(z.string(), caseScores),
});

/** A parsed scores file. */
export type ScoresFile = z.infer<typeof scoresFileSchema>;
/** The saved scores of one case. */
export type CaseScores = z.infer<typeof caseScores>;

/** The JSON a run writes next to its report. */
export function scoresFile(meta: RunMeta, result: Grade): ScoresFile {
  return {
    model: meta.model,
    standIn: meta.standIn,
    promptVersion: meta.promptVersion,
    date: meta.date,
    label: meta.label,
    tests: [...meta.tests],
    costUsd: result.tokens.costUsd,
    medianSeconds: result.speed.medianSeconds,
    calls: result.speed.calls,
    cases: Object.fromEntries(
      result.cases.map((item) => {
        const breakdown = item.breakdown;
        return [
          item.case.id,
          {
            test: item.case.test,
            job: item.case.job,
            score: item.score,
            roleMatch: breakdown?.roleMatch ?? null,
            parts: breakdown
              ? {
                  start: breakdown.start,
                  skills: breakdown.skills,
                  evidence: breakdown.evidence,
                  proofOfWork: breakdown.proofOfWork,
                  education: breakdown.education,
                }
              : null,
          },
        ];
      }),
    ),
  };
}

/** `<date>-<label>.json` for the report `<date>-<label>.md`. */
export function scoresFileName(reportName: string): string {
  return reportName.replace(/\.md$/, ".json");
}

/** Reads a scores file; throws an Error naming `source` when it is not one. */
export function parseScoresFile(text: string, source: string): ScoresFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${source} is not JSON`);
  }
  const parsed = scoresFileSchema.safeParse(json);
  if (!parsed.success) throw new Error(`${source} is not a scores file: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  return parsed.data;
}
