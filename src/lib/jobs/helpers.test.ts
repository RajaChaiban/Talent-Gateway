import { describe, expect, it } from "vitest";
import { formatJobDate, resumeCountLabel } from "./helpers";

describe("formatJobDate", () => {
  it("prints the UTC date in a fixed locale", () => {
    expect(formatJobDate("2026-03-05T23:30:00Z")).toBe("Mar 5, 2026");
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatJobDate("nope")).toBe("");
  });
});

describe("resumeCountLabel", () => {
  it("pluralises", () => {
    expect(resumeCountLabel(0)).toBe("0 resumes");
    expect(resumeCountLabel(1)).toBe("1 resume");
    expect(resumeCountLabel(6)).toBe("6 resumes");
  });
});
