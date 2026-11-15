import type { LanguageModel } from "ai";
import type { FakeReply } from "./model";

/**
 * Test-only stand-in model for the browser suite: deterministic answers, no
 * network. Reached only through resolveModel when fakeModelAllowed() is true,
 * which is never the case on a Vercel deployment (see model.ts). `ai/test` is
 * loaded only here, and only when a stand-in is built.
 *
 * Markers a test can put in a resume's text:
 * - `E2E-SCORE: 85` sets match_score (stored tenths), default 75.
 * - `E2E-FAIL-ONCE` makes the first call of each kind for that exact resume
 *   text fail, and later calls succeed, so "Retry failed" can be proven.
 */

const DELAY_MS = 300;
const DEFAULT_SCORE = 75;
const failedOnce = new Set<string>();

/** A stand-in model that answers every call with `reply(prompt)`, where `prompt` is the user message text. */
export async function createFakeModel(reply: FakeReply, modelId: string): Promise<LanguageModel> {
  const { MockLanguageModelV4 } = await import("ai/test");
  return new MockLanguageModelV4({
    provider: "test",
    modelId,
    doGenerate: async (options) => {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      const prompt = options.prompt
        .filter((message) => message.role === "user")
        .map((message) =>
          message.content.map((part) => (part.type === "text" ? part.text : "")).join(""),
        )
        .join("\n");
      return {
        content: [{ type: "text", text: reply(prompt) }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 0, text: 0, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
}

function resumeOf(prompt: string): string {
  return /<resume>\n([\s\S]*?)\n<\/resume>/.exec(prompt)?.[1] ?? "";
}

function failOnceFor(kind: string, resume: string): void {
  const key = `${kind}:${resume}`;
  if (resume.includes("E2E-FAIL-ONCE") && !failedOnce.has(key)) {
    failedOnce.add(key);
    throw new Error("Test model failure");
  }
}

/** The stand-in for scoreResume: the first line is the name; `E2E-SCORE: n` sets the score. */
export function fakeScoreReply(prompt: string): string {
  const resume = resumeOf(prompt);
  failOnceFor("score", resume);
  const marked = /E2E-SCORE:\s*(\d{1,3})/.exec(resume);
  const firstLine = resume.split("\n").find((line) => line.trim().length > 0) ?? "";
  return JSON.stringify({
    full_name: firstLine.trim().slice(0, 120),
    match_score: marked ? Math.min(100, Number(marked[1])) : DEFAULT_SCORE,
    match_summary: "Deterministic test summary.",
    strengths: ["Relevant experience for the role."],
    gaps: ["No gap found by the test model."],
  });
}

/** The stand-in for runRadar: nothing flagged. */
export function fakeRadarReply(prompt: string): string {
  failOnceFor("radar", resumeOf(prompt));
  const clear = { flagged: false, note: "" };
  return JSON.stringify({
    copycat: clear,
    employment_gaps: clear,
    job_hopping: clear,
    ai_written: clear,
  });
}
