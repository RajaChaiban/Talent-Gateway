import { generateText, NoObjectGeneratedError, Output } from "ai";
import type { z } from "zod";
import { SCREENING_AI_LIMITS as LIMITS } from "@/lib/config";
import { resolveModel, type FakeReply } from "./model";

type StructuredCall<T> = {
  slug: string;
  instructions: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** The deterministic stand-in the browser tests use (see model.ts); never used on Vercel. */
  fake: FakeReply;
  /** Aborts the call early, e.g. when a sibling call has already failed. */
  abortSignal?: AbortSignal;
  /** The abort budget for the whole call; SCREENING_AI_LIMITS.callTimeoutMs when left out. */
  timeoutMs?: number;
};

/**
 * One structured model call through AI Gateway. An answer that fails the Zod
 * schema (NoObjectGeneratedError) is asked for once more; any other error is
 * thrown at once. Every attempt, and the SDK's own transport retry, shares one
 * abort budget (`timeoutMs`, SCREENING_AI_LIMITS.callTimeoutMs by default), so a
 * call can never stack up into minutes.
 */
export async function generateStructured<T>({
  slug,
  instructions,
  prompt,
  schema,
  fake,
  abortSignal: external,
  timeoutMs = LIMITS.callTimeoutMs,
}: StructuredCall<T>): Promise<T> {
  const model = await resolveModel(slug, fake);
  const timeout = AbortSignal.timeout(timeoutMs);
  const abortSignal = external ? AbortSignal.any([timeout, external]) : timeout;
  let lastError: unknown;
  for (let attempt = 0; attempt < LIMITS.parseAttempts; attempt += 1) {
    try {
      const { output } = await generateText({
        model,
        instructions,
        prompt,
        output: Output.object({ schema }),
        maxRetries: LIMITS.maxRetries,
        abortSignal,
      });
      return output;
    } catch (error) {
      if (!NoObjectGeneratedError.isInstance(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}
