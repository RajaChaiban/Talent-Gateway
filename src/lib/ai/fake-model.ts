import type { LanguageModel } from "ai";
import { SCORE_WEIGHTS } from "@/lib/config";
import { asStored, STORED_MAX, toScore, type StoredScore } from "@/lib/score";
import type { FakeReply } from "./model";
import type { RoleMatch } from "./total-score";

/**
 * Test-only stand-in model for the browser suite: deterministic answers, no
 * network. Reached only through resolveModel when fakeModelAllowed() is true,
 * which is never the case on a Vercel deployment (see model.ts). `ai/test` is
 * loaded only here, and only when a stand-in is built.
 *
 * Markers a test can put in a resume's text:
 * - `E2E-SCORE: 85` sets the total the parts add up to (stored tenths), default 75.
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

/** Must-haves in a stand-in answer; each one shown adds 0.3 to the additions. */
const FAKE_MUST_HAVES = 10;

/**
 * Parts that totalScore adds up to `target` (stored tenths). A target of 5.0
 * or more is the same role plus additions; below that, a related or unrelated
 * start with additions scaled down by start / 5. Additions are whole tenths,
 * so the scaled total lands within 0.05 of the target and rounds onto it.
 */
export function fakeScoreParts(target: StoredScore) {
  const goal: number = toScore(target);
  const { same, related, unrelated } = SCORE_WEIGHTS.start;
  const [roleMatch, start]: [RoleMatch, number] =
    goal >= same
      ? ["same", same]
      : goal >= related.max
        ? ["related", related.max]
        : goal >= related.min
          ? ["related", goal]
          : goal > unrelated.max
            ? ["unrelated", unrelated.max]
            : ["unrelated", goal];
  const tenths = start === goal ? 0 : Math.round(((goal - start) / (start / same)) * 10);
  const shown = Math.min(FAKE_MUST_HAVES, Math.floor(tenths / 3));
  let rest = tenths - shown * 3;
  const take = (max: number) => {
    const taken = Math.min(Math.round(max * 10), rest);
    rest -= taken;
    return taken / 10;
  };
  return {
    role_match: roleMatch,
    start_score: start,
    must_haves: Array.from({ length: FAKE_MUST_HAVES }, (_, index) => ({
      requirement: `Requirement ${index + 1}`,
      status: index < shown ? ("shown" as const) : ("missing" as const),
    })),
    evidence: take(SCORE_WEIGHTS.evidenceMax),
    proof_of_work: take(SCORE_WEIGHTS.proofOfWorkMax),
    education: take(SCORE_WEIGHTS.educationMax),
  };
}

/** The stand-in for scoreResume: the first line is the name; `E2E-SCORE: n` sets the total. */
export function fakeScoreReply(prompt: string): string {
  const resume = resumeOf(prompt);
  failOnceFor("score", resume);
  const marked = /E2E-SCORE:\s*(\d{1,3})/.exec(resume);
  const firstLine = resume.split("\n").find((line) => line.trim().length > 0) ?? "";
  return JSON.stringify({
    full_name: firstLine.trim().slice(0, 120),
    ...fakeScoreParts(asStored(marked ? Math.min(STORED_MAX, Number(marked[1])) : DEFAULT_SCORE)),
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
