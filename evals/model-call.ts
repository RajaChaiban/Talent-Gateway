import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { customProvider, gateway, NoObjectGeneratedError, registerTelemetry } from "ai";
import { rateLimitRetryAfter } from "@/lib/ai/errors";
import { fakeModelAllowed } from "@/lib/ai/model";
import { SCORE_INSTRUCTIONS } from "@/lib/ai/prompts";
import { scoreResume } from "@/lib/ai/score-resume";
import { AI_MODELS } from "@/lib/config";
import type { Breakdown, Price } from "./types";

/**
 * The evaluation's only door to the AI layer (screening/boundary.test.ts
 * holds it to that). It calls the app's own `scoreResume`, so a run uses the
 * same prompt, schema, limits and gateway path as the screening pipeline. It
 * skips the pipeline's ATS gate on purpose: the written resumes are built to
 * pass it (evals/set.test.ts), and the runner checks every local file itself
 * before scoring it, sending only the ready ones.
 *
 * Nothing here changes how the app calls a model: the overrides below are
 * set in the runner's own process only.
 */

type Usage = { input: number | null; output: number | null };

const usageOfCall = new AsyncLocalStorage<Usage[]>();
let usageRecorded = false;

/**
 * Token usage of each model call, read from the AI SDK's global telemetry
 * hook (`registerTelemetry`), which every `generateText` call reports to. The
 * call it belongs to is found by async context, so concurrent calls do not mix.
 */
function recordUsage(): void {
  if (usageRecorded) return;
  usageRecorded = true;
  registerTelemetry({
    onLanguageModelCallEnd: (event) => {
      usageOfCall.getStore()?.push({
        input: event.usage.inputTokens ?? null,
        output: event.usage.outputTokens ?? null,
      });
    },
  });
}

function total(values: readonly (number | null)[]): number | null {
  return values.length === 0 || values.some((value) => value === null)
    ? null
    : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

export type ScoreCall = {
  /** The total in stored tenths. */
  score: number;
  breakdown: Breakdown;
  inputTokens: number | null;
  outputTokens: number | null;
};

/** One `scoreResume` call, how its total was added up, and the tokens it used (both parse attempts together). */
export async function scoreOnce(jobDescription: string, resumeText: string): Promise<ScoreCall> {
  recordUsage();
  const usage: Usage[] = [];
  const output = await usageOfCall.run(usage, () => scoreResume(jobDescription, resumeText));
  const { breakdown } = output;
  return {
    score: output.match_score,
    breakdown: {
      roleMatch: breakdown.role_match,
      start: breakdown.start,
      skills: breakdown.skills,
      evidence: breakdown.evidence,
      proofOfWork: breakdown.proof_of_work,
      education: breakdown.education,
      mustHaves: breakdown.must_haves.map((item) => ({ requirement: item.requirement, status: item.status })),
    },
    inputTokens: total(usage.map((item) => item.input)),
    outputTokens: total(usage.map((item) => item.output)),
  };
}

/**
 * Sends the scoring call to `slug` instead of AI_MODELS.scoring for this
 * process, through the AI SDK's global default provider: AI_MODELS.scoring
 * maps to `slug` on the gateway, and every other id goes to the gateway as
 * usual.
 */
export function routeScoringTo(slug: string): void {
  globalThis.AI_SDK_DEFAULT_PROVIDER = customProvider({
    languageModels: { [AI_MODELS.scoring]: gateway(slug) },
    fallbackProvider: gateway,
  });
}

/** Whether the stand-in model answers instead of the gateway (E2E_FAKE_MODEL=1, never on Vercel). */
export function usingStandIn(): boolean {
  return fakeModelAllowed(process.env);
}

/** The prompt version in a report: the first 8 hex digits of the SHA-256 of the scoring instructions. */
export function promptVersion(): string {
  return createHash("sha256").update(SCORE_INSTRUCTIONS).digest("hex").slice(0, 8);
}

/** Seconds to wait when the gateway rate-limited the call (the app's ModelBusyError rule); null for any other error. */
export function rateLimitWait(error: unknown): number | null {
  return rateLimitRetryAfter(error);
}

/** Whether the model's answer failed the schema on both attempts. */
export function isInvalidOutput(error: unknown): boolean {
  return NoObjectGeneratedError.isInstance(error);
}

/** USD per token for `slug` from the gateway's model list; null when it cannot be read. */
export async function gatewayPrice(slug: string): Promise<Price | null> {
  try {
    const { models } = await gateway.getAvailableModels();
    const pricing = models.find((model) => model.id === slug)?.pricing;
    if (!pricing) return null;
    const price = { input: Number(pricing.input), output: Number(pricing.output) };
    return Number.isFinite(price.input) && Number.isFinite(price.output) ? price : null;
  } catch {
    return null;
  }
}
