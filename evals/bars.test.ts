import { describe, expect, it } from "vitest";
import { JOB_THRESHOLD_DEFAULTS } from "@/lib/config";
import { asStored } from "@/lib/score";
import {
  BAR_SETTINGS,
  DEFAULT_BARS,
  gradeBars,
  placementText,
  placeScore,
  settingText,
  summaryText,
  type BarPlacement,
} from "./bars";

describe("the bar settings", () => {
  it("takes the default from a new job's bars, then strict and lenient", () => {
    expect(DEFAULT_BARS).toMatchObject({ topTalent: JOB_THRESHOLD_DEFAULTS.topTalent, invite: JOB_THRESHOLD_DEFAULTS.invite });
    expect(BAR_SETTINGS.map((setting) => [setting.id, settingText(setting)])).toEqual([
      ["default", "top talent 8.0, invite 7.0"],
      ["strict", "top talent 9.0, invite 8.0"],
      ["lenient", "top talent 6.0, invite 5.0"],
    ]);
  });
});

describe("placeScore", () => {
  it("counts a score on a bar as clearing it", () => {
    expect(placeScore(asStored(80), DEFAULT_BARS)).toEqual({ topTalent: true, invite: true });
    expect(placeScore(asStored(79), DEFAULT_BARS)).toEqual({ topTalent: false, invite: true });
    expect(placeScore(asStored(70), DEFAULT_BARS)).toEqual({ topTalent: false, invite: true });
    expect(placeScore(asStored(69), DEFAULT_BARS)).toEqual({ topTalent: false, invite: false });
  });

  it("names the highest bar cleared", () => {
    expect(placementText({ topTalent: true, invite: true })).toBe("top talent");
    expect(placementText({ topTalent: false, invite: true })).toBe("invite");
    expect(placementText({ topTalent: false, invite: false })).toBe("below");
  });
});

describe("gradeBars", () => {
  const cases = [
    { id: "strong-high", band: "strong", score: 92 },
    { id: "strong-low", band: "strong", score: 76 },
    { id: "partial", band: "partial", score: 55 },
    { id: "weak", band: "weak", score: 30 },
  ] as const;

  it("places every case under every setting and counts each setting", () => {
    const result = gradeBars(cases);
    const text = (placement: BarPlacement | null) => (placement === null ? "not scored" : placementText(placement));
    expect(result.rows.map((row) => [row.id, ...BAR_SETTINGS.map((setting) => text(row.placements[setting.id]))])).toEqual([
      ["strong-high", "top talent", "top talent", "top talent"],
      ["strong-low", "invite", "below", "top talent"],
      ["partial", "below", "below", "invite"],
      ["weak", "below", "below", "below"],
    ]);
    expect(result.summaries.map(summaryText)).toEqual([
      "1 top talent, 2 clear the invite bar, 2 below",
      "1 top talent, 1 clear the invite bar, 3 below",
      "2 top talent, 3 clear the invite bar, 1 below",
    ]);
  });

  it("checks strong and weak cases against the default bars only, and skips partial ones", () => {
    expect(gradeBars(cases).defaultChecks).toEqual([
      { id: "strong-high", ok: true },
      { id: "strong-low", ok: true },
      { id: "weak", ok: true },
    ]);
    const misses = gradeBars([
      { id: "strong-below", band: "strong", score: 69 },
      { id: "weak-invite", band: "weak", score: 70 },
    ]);
    expect(misses.defaultChecks).toEqual([
      { id: "strong-below", ok: false },
      { id: "weak-invite", ok: false },
    ]);
  });

  it("fails a case with no score and counts it apart", () => {
    const result = gradeBars([
      { id: "strong-missing", band: "strong", score: null },
      { id: "weak-missing", band: "weak", score: null },
    ]);
    expect(result.rows[0].placements).toEqual({ default: null, strict: null, lenient: null });
    expect(result.defaultChecks.every((check) => !check.ok)).toBe(true);
    expect(summaryText(result.summaries[0])).toBe("0 top talent, 0 clear the invite bar, 0 below, 2 not scored");
  });
});
