import { createHash } from "node:crypto";
import { customProvider } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it } from "vitest";
import { fakeScoreParts } from "@/lib/ai/fake-model";
import { SCORE_INSTRUCTIONS } from "@/lib/ai/prompts";
import { asStored } from "@/lib/score";
import { AI_MODELS } from "@/lib/config";
import { promptVersion, routeScoringTo, scoreOnce, usingStandIn } from "./model-call";

/** A mock scoring model whose score and token counts come from a marker in the resume. */
function scoringModel() {
  return new MockLanguageModelV4({
    doGenerate: async (options) => {
      const prompt = JSON.stringify(options.prompt);
      const marker = /MARK-(\d+)/.exec(prompt);
      const n = Number(marker?.[1] ?? 0);
      await new Promise((resolve) => setTimeout(resolve, 100 - n));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              full_name: "A",
              ...fakeScoreParts(asStored(n)),
              match_summary: "Summary.",
              strengths: [],
              gaps: [],
            }),
          },
        ],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: 1_000 + n, noCache: 1_000 + n, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 100 + n, text: 100 + n, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
}

describe("the evaluation's scoring call", () => {
  afterEach(() => {
    globalThis.AI_SDK_DEFAULT_PROVIDER = undefined;
  });

  it("is not the stand-in in unit tests", () => {
    expect(usingStandIn()).toBe(false);
  });

  it("returns the app's added-up score and its breakdown with each call's own token counts, even when calls overlap", async () => {
    globalThis.AI_SDK_DEFAULT_PROVIDER = customProvider({
      languageModels: { [AI_MODELS.scoring]: scoringModel() },
    });
    const [first, second] = await Promise.all([
      scoreOnce("Job", "Resume MARK-10"),
      scoreOnce("Job", "Resume MARK-60"),
    ]);
    expect(first).toMatchObject({ score: 10, inputTokens: 1_010, outputTokens: 110 });
    expect(first.breakdown).toMatchObject({ roleMatch: "unrelated", start: 1 });
    expect(second).toMatchObject({ score: 60, inputTokens: 1_060, outputTokens: 160 });
    expect(second.breakdown).toMatchObject({ roleMatch: "same", start: 5, skills: 0.9, evidence: 0.1 });
    expect(second.breakdown.mustHaves).toHaveLength(10);
  });

  it("routes AI_MODELS.scoring to the --model slug and leaves other ids alone", () => {
    routeScoringTo("provider/other-model");
    const provider = globalThis.AI_SDK_DEFAULT_PROVIDER;
    expect(provider).toBeDefined();
    const languageModel = provider && "languageModel" in provider ? provider.languageModel : undefined;
    expect(languageModel?.(AI_MODELS.scoring).modelId).toBe("provider/other-model");
    expect(languageModel?.("provider/unrelated").modelId).toBe("provider/unrelated");
  });

  it("names the prompt version by a short hash of the scoring instructions", () => {
    const expected = createHash("sha256").update(SCORE_INSTRUCTIONS).digest("hex").slice(0, 8);
    expect(promptVersion()).toBe(expected);
    expect(promptVersion()).toMatch(/^[0-9a-f]{8}$/);
  });
});
