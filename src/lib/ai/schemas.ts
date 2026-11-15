import { z } from "zod";
import { SCREENING_AI_LIMITS as LIMITS, SCORE_WEIGHTS as WEIGHTS } from "@/lib/config";
import { MUST_HAVE_STATUSES, ROLE_MATCHES } from "./total-score";

const listItem = z.string().trim().min(1).max(LIMITS.listItemMaxChars);

/** A part-score on the 0 to 10 scale, from 0 to `max`. */
const part = (max: number, description: string) => z.number().min(0).max(max).describe(description);

/**
 * What scoreResume asks the model for: a role match, a start score and small
 * part-scores, all on the 0 to 10 scale. The model never returns a total;
 * `totalScore` (total-score.ts) adds the parts up with SCORE_WEIGHTS.
 */
export const scoreOutputSchema = z.object({
  full_name: z
    .string()
    .max(LIMITS.fullNameMaxChars)
    .describe("The candidate's full name as written in the resume, or an empty string if none is given"),
  role_match: z
    .enum(ROLE_MATCHES)
    .describe("How the candidate's most recent job title compares with the job's role"),
  start_score: part(WEIGHTS.start.same, "The start score from the role alone, 0 to 5, one decimal"),
  must_haves: z
    .array(
      z.object({
        requirement: z.string().trim().min(1).max(LIMITS.mustHaveMaxChars),
        status: z.enum(MUST_HAVE_STATUSES),
      }),
    )
    .min(1)
    .max(LIMITS.mustHavesMax)
    .describe("One item per must-have of the job description"),
  evidence: part(WEIGHTS.evidenceMax, "Evidence quality, 0 to 1, one decimal"),
  proof_of_work: part(WEIGHTS.proofOfWorkMax, "Proof of work, 0 to 0.6, one decimal"),
  education: part(WEIGHTS.educationMax, "Education, 0 to 0.4, one decimal"),
  match_summary: z.string().trim().min(1).max(LIMITS.summaryMaxChars),
  strengths: z.array(listItem).max(LIMITS.listMaxItems),
  gaps: z.array(listItem).max(LIMITS.listMaxItems),
});

export type ScoreOutput = z.infer<typeof scoreOutputSchema>;

const radarFlag = z.object({
  flagged: z.boolean(),
  note: z.string().max(LIMITS.radarNoteMaxChars),
});

/** The shape of `candidates.radar_results`, validated on write and on read. */
export const radarResultsSchema = z.object({
  copycat: radarFlag,
  employment_gaps: radarFlag,
  job_hopping: radarFlag,
  ai_written: radarFlag,
});

export type RadarResults = z.infer<typeof radarResultsSchema>;
