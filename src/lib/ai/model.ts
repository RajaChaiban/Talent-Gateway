import type { LanguageModel } from "ai";

/** Set to "1" by the Playwright web server only (playwright.config.ts). */
export const FAKE_MODEL_ENV = "E2E_FAKE_MODEL";

type EnvSource = Readonly<Record<string, string | undefined>>;

/** A stand-in model's answer to the user prompt (JSON text), for the browser tests. */
export type FakeReply = (prompt: string) => string;

/**
 * Whether this process may use a test stand-in at all: never on a Vercel
 * deployment. Refused when VERCEL_ENV
 * is production or preview, when VERCEL is "1" outside local development, and
 * for any other VERCEL_ENV value than "development" (anything unexpected
 * refuses).
 */
export function standInAllowed(env: EnvSource): boolean {
  const vercelEnv = env.VERCEL_ENV;
  if (vercelEnv !== undefined && vercelEnv !== "development") return false;
  if (env.VERCEL === "1" && vercelEnv !== "development") return false;
  return true;
}

/**
 * The browser tests must never call a real model, so the Playwright web server
 * sets E2E_FAKE_MODEL=1. The flag is honoured only where `standInAllowed`
 * says so: on a Vercel deployment the real gateway model is always used.
 */
export function fakeModelAllowed(env: EnvSource): boolean {
  return standInAllowed(env) && env[FAKE_MODEL_ENV] === "1";
}

/**
 * A "provider/model" slug goes to Vercel AI Gateway as a plain string. When the
 * test flag is honoured, the call's stand-in (`fake`) answers instead, and a
 * call without one throws: the browser suite fails closed rather than reach a
 * real model.
 */
export async function resolveModel(
  slug: string,
  fake?: FakeReply,
  env: EnvSource = process.env,
): Promise<LanguageModel> {
  if (!fakeModelAllowed(env)) return slug;
  if (!fake) {
    throw new Error(`${FAKE_MODEL_ENV} is set but this call to ${slug} has no stand-in reply`);
  }
  const { createFakeModel } = await import("./fake-model");
  return createFakeModel(fake, slug);
}
