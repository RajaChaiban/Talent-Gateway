import { MockLanguageModelV4 } from "ai/test";

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

export const SCORE_ANSWER = {
  full_name: "Ada Lovelace",
  match_score: 83,
  match_summary: "Strong backend match.",
  strengths: ["Built APIs in TypeScript."],
  gaps: ["No Kubernetes."],
};

export const RADAR_ANSWER = {
  copycat: { flagged: false, note: "" },
  employment_gaps: { flagged: true, note: "Gap in 2021." },
  job_hopping: { flagged: false, note: "" },
  ai_written: { flagged: false, note: "" },
};
