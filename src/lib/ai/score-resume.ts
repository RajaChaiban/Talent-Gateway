import { AI_MODELS } from "@/lib/config";
import type { StoredScore } from "@/lib/score";
import { fakeScoreReply } from "./fake-model";
import { generateStructured } from "./generate";
import { SCORE_INSTRUCTIONS, scorePrompt } from "./prompts";
import { scoreOutputSchema, type ScoreOutput } from "./schemas";
import { totalScore, type RoleMatch, type ScoreTotal } from "./total-score";

/** How the total was added up, for the model evaluation's report. Not saved. */
export type ScoreBreakdown = Omit<ScoreTotal, "stored"> & {
  role_match: RoleMatch;
  must_haves: ScoreOutput["must_haves"];
};

/**
 * What scoring one resume returns: the name, the total as stored tenths, the summary, strengths and gaps,
 * and how the total was added up.
 */
export type ScoreResult = {
  full_name: string;
  /** The total, added up in code from the model's parts, as stored tenths. */
  match_score: StoredScore;
  match_summary: string;
  strengths: string[];
  gaps: string[];
  breakdown: ScoreBreakdown;
};

/**
 * Internal to the screening pipeline: only src/lib/screening/analyze.ts may
 * import this (enforced by screening/boundary.test.ts), so the ATS gate runs
 * before every call.
 */
export async function scoreResume(
  jobDescription: string,
  resumeText: string,
  abortSignal?: AbortSignal,
): Promise<ScoreResult> {
  const output = await generateStructured({
    slug: AI_MODELS.scoring,
    instructions: SCORE_INSTRUCTIONS,
    prompt: scorePrompt(jobDescription, resumeText),
    schema: scoreOutputSchema,
    fake: fakeScoreReply,
    abortSignal,
  });
  const { stored, ...total } = totalScore(output);
  return {
    full_name: output.full_name,
    match_score: stored,
    match_summary: output.match_summary,
    strengths: output.strengths,
    gaps: output.gaps,
    breakdown: { ...total, role_match: output.role_match, must_haves: output.must_haves },
  };
}
