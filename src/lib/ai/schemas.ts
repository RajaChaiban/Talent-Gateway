import { z } from "zod";
import { SCREENING_AI_LIMITS as LIMITS } from "@/lib/config";

const listItem = z.string().trim().min(1).max(LIMITS.listItemMaxChars);

/**
 * What scoreResume asks the model for. `match_score` is stored tenths, a whole
 * number from 0 to 100, saved as-is; the model is never asked for 0 to 10.
 */
export const scoreOutputSchema = z.object({
  full_name: z
    .string()
    .max(LIMITS.fullNameMaxChars)
    .describe("The candidate's full name as written in the resume, or an empty string if none is given"),
  match_score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("How well the resume matches the job, a whole number from 0 to 100"),
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
