import { MockLanguageModelV4 } from "ai/test";
import { fakeScoreParts } from "@/lib/ai/fake-model";
import { asStored } from "@/lib/score";

export type CallOptions = MockLanguageModelV4["doGenerateCalls"][number];
type GenerateResult = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;

/** A model answer whose text is `value` as JSON (or `value` itself when it is a string). */
export function answer(value: unknown): GenerateResult {
  return {
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }],
    finishReason: { unified: "stop", raw: undefined },
    usage: {
      inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    },
    warnings: [],
  };
}

/** Text of every message with `role` in one call, joined. */
export function messageText(options: CallOptions, role: "system" | "user"): string {
  return options.prompt
    .filter((message) => message.role === role)
    .map((message) =>
      typeof message.content === "string"
        ? message.content
        : message.content.map((part) => (part.type === "text" ? part.text : "")).join(""),
    )
    .join("\n");
}

/** The stored total of SCORE_ANSWER once its parts are added up. */
export const SCORE_TOTAL = 83;

/** A scoring answer whose parts add up to `stored` tenths; the other fields are SCORE_ANSWER's. */
export function scoreAnswer(stored: number) {
  return {
    full_name: "Ada Lovelace",
    ...fakeScoreParts(asStored(stored)),
    match_summary: "Strong backend match.",
    strengths: ["Built APIs in TypeScript."],
    gaps: ["No Kubernetes."],
  };
}

export const SCORE_ANSWER = scoreAnswer(SCORE_TOTAL);

export const RADAR_ANSWER = {
  copycat: { flagged: false, note: "" },
  employment_gaps: { flagged: true, note: "Gap in 2021." },
  job_hopping: { flagged: false, note: "" },
  ai_written: { flagged: false, note: "" },
};
