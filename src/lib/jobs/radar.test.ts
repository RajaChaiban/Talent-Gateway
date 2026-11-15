import { describe, expect, it } from "vitest";
import { parseRadarResults, radarChips } from "./radar";

describe("radar results", () => {
  it("an empty object, null or garbage means nothing flagged", () => {
    for (const value of [{}, null, "x", 3, { copycat: { flagged: "yes" } }]) {
      expect(radarChips(parseRadarResults(value))).toEqual([]);
    }
  });

  it("keeps the valid flags when one flag is malformed", () => {
    const radar = parseRadarResults({
      copycat: { flagged: "yes", note: 4 },
      job_hopping: { flagged: true, note: "4 roles in 2 years" },
    });
    expect(radar).toEqual({ job_hopping: { flagged: true, note: "4 roles in 2 years" } });
    expect(radarChips(radar).map((chip) => chip.key)).toEqual(["job_hopping"]);
  });

  it("makes one chip per set flag in a fixed order, with its note", () => {
    const radar = parseRadarResults({
      ai_written: { flagged: true, note: "Uniform phrasing" },
      copycat: { flagged: true, note: "Matches another resume" },
      employment_gaps: { flagged: false, note: "None" },
      job_hopping: { flagged: true, note: "4 roles in 2 years" },
    });
    expect(radarChips(radar)).toEqual([
      { key: "copycat", label: "Copycat", note: "Matches another resume" },
      { key: "job_hopping", label: "Job hopping", note: "4 roles in 2 years" },
      { key: "ai_written", label: "AI-written", note: "Uniform phrasing" },
    ]);
  });
});
