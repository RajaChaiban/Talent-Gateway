import { describe, expect, it } from "vitest";
import { fakeRadarReply, fakeScoreReply } from "./fake-model";
import { radarPrompt, scorePrompt } from "./prompts";
import { radarResultsSchema, scoreOutputSchema } from "./schemas";

describe("stand-in replies", () => {
  it("score: the first line is the name and E2E-SCORE sets the score; the answer fits the schema", () => {
    const reply = JSON.parse(fakeScoreReply(scorePrompt("JD", "Ada Okafor\nE2E-SCORE: 91")));
    expect(scoreOutputSchema.parse(reply)).toMatchObject({ full_name: "Ada Okafor", match_score: 91 });
    expect(JSON.parse(fakeScoreReply(scorePrompt("JD", "Ben"))).match_score).toBe(75);
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
