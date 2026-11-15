import { describe, expect, it } from "vitest";
import { asStored } from "@/lib/score";
import { fakeRadarReply, fakeScoreParts, fakeScoreReply } from "./fake-model";
import { radarPrompt, scorePrompt } from "./prompts";
import { radarResultsSchema, scoreOutputSchema } from "./schemas";
import { totalScore } from "./total-score";

function storedTotal(resume: string): number {
  return totalScore(scoreOutputSchema.parse(JSON.parse(fakeScoreReply(scorePrompt("JD", resume))))).stored;
}

describe("stand-in replies", () => {
  it("score: the first line is the name and the answer fits the schema, with no total of its own", () => {
    const reply = scoreOutputSchema.parse(JSON.parse(fakeScoreReply(scorePrompt("JD", "Ada Okafor\nE2E-SCORE: 91"))));
    expect(reply.full_name).toBe("Ada Okafor");
    expect(reply).not.toHaveProperty("match_score");
  });

  it("score: E2E-SCORE sets the total the parts add up to, 75 by default, at most 100", () => {
    expect(storedTotal("Ada\nE2E-SCORE: 85")).toBe(85);
    expect(storedTotal("Ben")).toBe(75);
    expect(storedTotal("Cy\nE2E-SCORE: 250")).toBe(100);
  });

  it("score: every total from 0 to 100 can be reached, with a role match that fits it", () => {
    for (let target = 0; target <= 100; target += 1) {
      const parts = scoreOutputSchema.parse({
        full_name: "",
        ...fakeScoreParts(asStored(target)),
        match_summary: "Summary.",
        strengths: [],
        gaps: [],
      });
      expect(totalScore(parts).stored, `target ${target}`).toBe(target);
      expect(parts.role_match).toBe(target >= 50 ? "same" : target >= 25 ? "related" : "unrelated");
    }
  });

  it("radar: nothing flagged, and the answer fits the schema", () => {
    const reply = JSON.parse(fakeRadarReply(radarPrompt("Ben", [])));
    expect(radarResultsSchema.parse(reply).copycat).toEqual({ flagged: false, note: "" });
  });

  it("E2E-FAIL-ONCE fails the first call of each kind for that text, then succeeds", () => {
    const text = `Cy ${crypto.randomUUID()}\nE2E-FAIL-ONCE`;
    expect(() => fakeScoreReply(scorePrompt("JD", text))).toThrow("Test model failure");
    expect(() => fakeScoreReply(scorePrompt("JD", text))).not.toThrow();
    expect(() => fakeRadarReply(radarPrompt(text, []))).toThrow("Test model failure");
    expect(() => fakeRadarReply(radarPrompt(text, []))).not.toThrow();
  });
});
