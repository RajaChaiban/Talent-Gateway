import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WRITTEN_CASES, WRITTEN_COMPARISONS } from "./cases";
import { JOB_TYPE_CASES, JOB_TYPE_COMPARISONS, jobTypeFiltering, NEGATIVE_SOURCE } from "./job-types";
import { barBand, caseRuns, selectSet, testsText } from "./select";
import type { EvalSet } from "./types";

const RESUMES = path.join(import.meta.dirname, "resumes");
const texts = new Map(
  JOB_TYPE_CASES.map((item) => [item.id, readFileSync(path.join(RESUMES, item.resume.file), "utf8")] as const),
);

describe("jobTypeFiltering", () => {
  const outcomes = jobTypeFiltering(texts);

  it("finds every one of the 25 resume texts ATS_READY", () => {
    const resumes = outcomes.filter((item) => !item.id.startsWith("negative:"));
    expect(resumes).toHaveLength(25);
    for (const item of resumes) expect(item, item.id).toMatchObject({ status: "ready", failed: [], ok: true });
  });

  it("sets each of the four negatives aside on exactly its check", () => {
    expect(NEGATIVE_SOURCE).toBe("jt-nurse-strong");
    expect(
      outcomes.filter((item) => item.id.startsWith("negative:")).map((item) => [item.id, item.status, item.failed, item.ok]),
    ).toEqual([
      ["negative:no-email", "set_aside", ["contact_info"], true],
      ["negative:no-phone", "set_aside", ["phone"], true],
      ["negative:no-email-no-phone", "set_aside", ["contact_info", "phone"], true],
      ["negative:picture", "set_aside", ["picture"], true],
    ]);
  });

  it("fails a resume the check sets aside, a negative set aside on another check too, and a missing text", () => {
    const broken = new Map(texts);
    broken.set("jt-sales-mid", "No contact details here.");
    // A short source with no headings: each negative also fails other checks, so none is set aside on exactly its own.
    broken.set(NEGATIVE_SOURCE, "Rosa Delgado\nrosa.delgado@example.com\n(602) 555-0131\nRegistered nurse.");
    broken.delete("jt-swe-mid");
    const result = jobTypeFiltering(broken);
    const failing = result.filter((item) => !item.ok).map((item) => item.id);
    expect(failing).toEqual([
      "jt-swe-mid",
      "jt-nurse-strong",
      "jt-sales-mid",
      "negative:no-email",
      "negative:no-phone",
      "negative:no-email-no-phone",
      "negative:picture",
    ]);
    expect(result.find((item) => item.id === "jt-swe-mid")?.failed).toEqual(["missing text"]);
  });
});

describe("--only", () => {
  const set: EvalSet = {
    cases: [...WRITTEN_CASES, ...JOB_TYPE_CASES],
    comparisons: [...WRITTEN_COMPARISONS, ...JOB_TYPE_COMPARISONS],
    files: [{ file: "fails-no-phone.pdf", expect: "set_aside", checks: ["phone"] }],
  };

  it("holds test 8's strong cases to strong and unrelated ones to weak under the bars, and no other kind", () => {
    expect(JOB_TYPE_CASES.map((item) => [item.resumeKind, barBand(item)]).slice(0, 5)).toEqual([
      ["strong", "strong"],
      ["mid", null],
      ["vague", null],
      ["related", null],
      ["unrelated", "weak"],
    ]);
    expect(barBand(WRITTEN_CASES[0])).toBe("strong");
    expect(barBand(WRITTEN_CASES[1])).toBeNull();
  });

  it("with test 8 only, scores the 25 job-type cases and their 20 comparisons, and no stability case", () => {
    const only = selectSet(set, [8]);
    expect(only.cases.map((item) => item.id)).toEqual(JOB_TYPE_CASES.map((item) => item.id));
    expect(only.comparisons).toHaveLength(20);
    expect(only.files).toEqual([]);
    expect(only.cases.some((item) => item.stability)).toBe(false);
  });

  it("with test 5, also scores the stability cases of test 3; with test 7, every case the bars hold", () => {
    expect(selectSet(set, [5]).cases.map((item) => item.id)).toEqual(["swe-for-swe", "pm-for-swe", "injection"]);
    const bars = selectSet(set, [7]);
    expect(bars.cases.every((item) => barBand(item) !== null)).toBe(true);
    expect(bars.cases).toHaveLength(7 + 10);
    expect(bars.comparisons).toEqual([]);
    expect(caseRuns(JOB_TYPE_CASES[1], [7])).toBe(false);
  });

  it("keeps the local files only when test 1 runs, and names the tests that ran", () => {
    expect(selectSet(set, [1]).files).toHaveLength(1);
    expect(testsText([8], true)).toBe("8 (--only 8)");
    expect(testsText([3, 8], true)).toBe("3, 8 (--only 3,8)");
    expect(testsText([1, 2, 3, 4, 5, 6, 7, 8], false)).toBe("all eight (1 to 8)");
  });
});
