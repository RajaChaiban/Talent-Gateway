import { AI_MODELS } from "@/lib/config";
import { fakeScoreReply } from "./fake-model";
import { generateStructured } from "./generate";
import { SCORE_INSTRUCTIONS, scorePrompt } from "./prompts";
import { scoreOutputSchema, type ScoreOutput } from "./schemas";

/**
 * Internal to the screening pipeline: only src/lib/screening/analyze.ts may
 * import this (enforced by screening/boundary.test.ts), so the ATS gate runs
 * before every call.
 */
export function scoreResume(
  jobDescription: string,
  resumeText: string,
  abortSignal?: AbortSignal,
): Promise<ScoreOutput> {
  return generateStructured({
    slug: AI_MODELS.scoring,
    instructions: SCORE_INSTRUCTIONS,
    prompt: scorePrompt(jobDescription, resumeText),
    schema: scoreOutputSchema,
    fake: fakeScoreReply,
    abortSignal,
  });
}
