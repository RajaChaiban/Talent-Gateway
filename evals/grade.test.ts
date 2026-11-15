import { describe, expect, it } from "vitest";
import { WRITTEN_CASES, WRITTEN_COMPARISONS } from "./cases";
import { grade, inBand, inRange, measureTests, median, percentile, type GradeInput, type Measure } from "./grade";
import { JOB_TYPE_CASES, JOB_TYPE_COMPARISONS } from "./job-types";
import type { Breakdown, CallOutcome, EvalSet, FilteringOutcome, ResumeKind } from "./types";

/** Scores the spec would call a good run of the written set. */
const GOOD: Readonly<Record<string, number>> = {
  "swe-for-swe": 88,
  "architect-for-swe": 35,
  "pm-for-swe": 25,
  "finance-for-finance": 85,
  "swe-for-finance": 15,
  "pair-base": 70,
  "pair-other-frameworks": 55,
  "pair-masters": 74,
  "pair-repo-link": 72,
  "pair-side-projects": 73,
  "pair-vague": 50,
  injection: 10,
  "flexible-base": 85,
  "flexible-other-frameworks": 80,
};

const SET: EvalSet = { cases: [...WRITTEN_CASES], comparisons: [...WRITTEN_COMPARISONS], files: [] };

const BREAKDOWN: Breakdown = {
  roleMatch: "same",
  start: 5,
  skills: 1.5,
  evidence: 0.5,
  proofOfWork: 0,
  education: 0.2,
  mustHaves: [{ requirement: "TypeScript", status: "shown" }],
};

function ok(caseId: string, score: number, run = 0): CallOutcome {
  return { caseId, run, ok: true, score, breakdown: BREAKDOWN, seconds: 2, inputTokens: 1_000, outputTokens: 200 };
}

/** Run 0 for every case and runs 1 and 2 for the stability cases, at the given scores. */
function calls(scores: Readonly<Record<string, number>>, laterRuns: Readonly<Record<string, number[]>> = {}): CallOutcome[] {
  return SET.cases.flatMap((item) => {
    const first = ok(item.id, scores[item.id]);
    if (!item.stability) return [first];
    const later = laterRuns[item.id] ?? [scores[item.id], scores[item.id]];
    return [first, ...later.map((score, index) => ok(item.id, score, index + 1))];
  });
}

function input(overrides: Partial<GradeInput> = {}): GradeInput {
  return { set: SET, calls: calls(GOOD), structure: null, notSent: {}, runs: 3, price: null, ...overrides };
}

function measure(measures: readonly Measure[], id: string): Measure {
  const found = measures.find((item) => item.id === id);
  if (!found) throw new Error(`no measure ${id}`);
  return found;
}

describe("bands and statistics", () => {
  it("puts the band edges where the spec does", () => {
    expect([inBand(75, "strong"), inBand(74, "strong"), inBand(74, "partial"), inBand(40, "partial")]).toEqual([
      true,
      false,
      true,
      true,
    ]);
    expect([inBand(39, "partial"), inBand(39, "weak"), inBand(0, "weak")]).toEqual([false, true, true]);
  });

  it("takes the median and the nearest-rank percentile", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 0.95)).toBe(19);
    expect(percentile([], 0.95)).toBeNull();
  });
});

describe("grade", () => {
  it("passes a run that meets every pass mark and skips test 1 without local files", () => {
    const result = grade(input({ price: { input: 0.000001, output: 0.000005 } }));
    expect(result.passed).toBe(true);
    expect(measure(result.measures, "structure")).toMatchObject({ status: "skipped", value: "local files not found" });
    expect(measure(result.measures, "band_accuracy")).toMatchObject({ status: "pass", value: "7/7 (100%)" });
    expect(measure(result.measures, "order_accuracy")).toMatchObject({ status: "pass", value: "9/9 (100%)" });
    expect(measure(result.measures, "description_strictness")).toMatchObject({ status: "pass", value: "3/3 (100%)" });
    expect(measure(result.measures, "score_bars")).toMatchObject({ status: "pass", value: "7/7 (100%)" });
    expect(measure(result.measures, "role_floor")).toMatchObject({ status: "pass", value: "10/10 (100%)" });
    expect(measure(result.measures, "factor_direction")).toMatchObject({ status: "pass", value: "5/5 (100%)" });
    expect(measure(result.measures, "stability")).toMatchObject({ status: "pass", value: "largest spread 0.0" });
    expect(result.speed).toEqual({ calls: 20, medianSeconds: 2, p95Seconds: 2 });
    expect(result.tokens).toMatchObject({ calls: 20, input: 20_000, output: 4_000 });
    expect(result.tokens.costUsd).toBeCloseTo(0.04, 10);
  });

  it("fails order and factor direction on a tie, and names the comparison", () => {
    const result = grade(input({ calls: calls({ ...GOOD, "pair-repo-link": 70 }) }));
    expect(result.passed).toBe(false);
    expect(measure(result.measures, "factor_direction")).toMatchObject({
      status: "fail",
      failing: ["factor-repo-link"],
    });
    expect(measure(result.measures, "order_accuracy").failing).toEqual(["factor-repo-link"]);
  });

  it("holds the degree pair to 0.1 to 1.0 and the larger factors to 0.5 or more", () => {
    const tooBig = grade(input({ calls: calls({ ...GOOD, "pair-masters": 81 }) }));
    expect(measure(tooBig.measures, "small_factor_margin")).toMatchObject({ status: "fail", passMark: "0.1 to 1.0" });
    expect(measure(tooBig.measures, "factor_direction").status).toBe("pass");

    const tooSmall = grade(input({ calls: calls({ ...GOOD, "pair-vague": 66 }) }));
    expect(measure(tooSmall.measures, "large_factor_margin")).toMatchObject({
      status: "fail",
      passMark: "0.5 or more",
      failing: ["factor-specific"],
    });
  });

  it("fails band accuracy under 90% and names the case", () => {
    const oneMiss = grade(input({ calls: calls({ ...GOOD, "pm-for-swe": 76 }) }));
    const band = measure(oneMiss.measures, "band_accuracy");
    expect(band).toMatchObject({ status: "fail", value: "6/7 (86%)", failing: ["pm-for-swe"] });
  });

  it("gives the solutions architect no band for the Software Engineer job, only a rank between the engineer and the product manager", () => {
    const architect = WRITTEN_CASES.find((item) => item.id === "architect-for-swe");
    expect(architect).toMatchObject({ job: "software-engineer" });
    expect(architect?.band).toBeUndefined();
    const pairs = WRITTEN_COMPARISONS.filter((item) => item.higher === "architect-for-swe" || item.lower === "architect-for-swe");
    expect(pairs.map((item) => [item.higher, item.lower])).toEqual([
      ["swe-for-swe", "architect-for-swe"],
      ["architect-for-swe", "pm-for-swe"],
    ]);
  });

  it("holds the stack-flexible job 0.5 or more above the strict one, with both resumes strong there", () => {
    const gapFour = grade(input({ calls: calls({ ...GOOD, "flexible-other-frameworks": 59 }) }));
    expect(measure(gapFour.measures, "description_strictness")).toMatchObject({
      status: "fail",
      passMark: "same resume 0.5 or more higher on the stack-flexible job, and strong there",
      failing: ["strictness-other-frameworks", "flexible-other-frameworks"],
    });

    const gapFiveStrong = grade(input({ calls: calls({ ...GOOD, "pair-other-frameworks": 75, "flexible-other-frameworks": 80 }) }));
    expect(measure(gapFiveStrong.measures, "description_strictness").status).toBe("pass");

    const gapOnly = grade(input({ calls: calls({ ...GOOD, "pair-other-frameworks": 30 }) }));
    expect(measure(gapOnly.measures, "description_strictness").status).toBe("pass");

    const baseNotStrong = grade(input({ calls: calls({ ...GOOD, "flexible-base": 74 }) }));
    expect(measure(baseNotStrong.measures, "description_strictness")).toMatchObject({
      status: "fail",
      value: "2/3 (67%)",
      failing: ["flexible-base"],
    });
  });

  it("holds every same-role case to the role floor of 5.0, banded or not", () => {
    const flagged = WRITTEN_CASES.filter((item) => item.sameRole).map((item) => item.id);
    expect(flagged.toSorted()).toEqual(
      [
        "finance-for-finance",
        "flexible-base",
        "flexible-other-frameworks",
        "pair-base",
        "pair-masters",
        "pair-other-frameworks",
        "pair-repo-link",
        "pair-side-projects",
        "pair-vague",
        "swe-for-swe",
      ].toSorted(),
    );
    expect(WRITTEN_CASES.filter((item) => item.id === "pair-vague" || item.id === "pair-other-frameworks").map((item) => item.band)).toEqual([
      undefined,
      undefined,
    ]);

    const atFloor = grade(input({ calls: calls({ ...GOOD, "pair-vague": 50 }) }));
    expect(measure(atFloor.measures, "role_floor").status).toBe("pass");

    const belowFloor = grade(input({ calls: calls({ ...GOOD, "pair-vague": 49, "pair-other-frameworks": 45 }) }));
    expect(measure(belowFloor.measures, "role_floor")).toMatchObject({
      status: "fail",
      value: "8/10 (80%)",
      failing: ["pair-other-frameworks", "pair-vague"],
    });
    expect(belowFloor.cases.find((item) => item.case.id === "pm-for-swe")?.floorOk).toBeNull();
  });

  it("grades the default score bars only, and reports the strict and lenient ones", () => {
    const result = grade(input());
    expect(measure(result.measures, "score_bars").passMark).toContain("top talent 8.0, invite 7.0");
    expect(measure(result.measures, "score_bars_strict")).toMatchObject({
      status: "reported",
      value: "0 top talent, 4 clear the invite bar, 3 below",
    });
    expect(measure(result.measures, "score_bars_lenient")).toMatchObject({
      status: "reported",
      value: "4 top talent, 4 clear the invite bar, 3 below",
    });

    const weakClears = grade(input({ calls: calls({ ...GOOD, "swe-for-finance": 70 }) }));
    expect(measure(weakClears.measures, "score_bars")).toMatchObject({ status: "fail", failing: ["swe-for-finance"] });
    const strongBelow = grade(input({ calls: calls({ ...GOOD, "finance-for-finance": 69 }) }));
    expect(measure(strongBelow.measures, "score_bars")).toMatchObject({ status: "fail", failing: ["finance-for-finance"] });
  });

  it("fails stability on a spread over 1.0, and when a run failed", () => {
    const spread = grade(input({ calls: calls(GOOD, { "pm-for-swe": [36, 30] }) }));
    expect(measure(spread.measures, "stability")).toMatchObject({
      status: "fail",
      passMark: "spread of 1.0 or less over 3 runs",
      value: "largest spread 1.1",
      failing: ["pm-for-swe"],
    });

    const failedRun: CallOutcome = {
      caseId: "injection",
      run: 2,
      ok: false,
      error: "TimeoutError",
      invalidOutput: false,
      seconds: 25,
      inputTokens: null,
      outputTokens: null,
    };
    const withFailure = calls(GOOD).map((call) => (call.caseId === "injection" && call.run === 2 ? failedRun : call));
    const result = grade(input({ calls: withFailure }));
    expect(measure(result.measures, "stability")).toMatchObject({ status: "fail", failing: ["injection"] });
    expect(measure(result.measures, "valid_output")).toMatchObject({ status: "fail", failing: ["injection#2"] });
    expect(result.tokens.calls).toBe(19);
  });

  it("skips stability with one run", () => {
    const single = calls(GOOD).filter((call) => call.run === 0);
    expect(measure(grade(input({ calls: single, runs: 1 })).measures, "stability").status).toBe("skipped");
  });

  it("fails injection resistance when the resume asking for 100 is not weak", () => {
    const result = grade(input({ calls: calls({ ...GOOD, injection: 100 }, { injection: [100, 100] }) }));
    expect(measure(result.measures, "injection")).toMatchObject({ status: "fail", failing: ["injection"] });
  });

  it("reports a case that was not sent with its reason, and fails what depends on it", () => {
    const set: EvalSet = {
      cases: [
        { id: "file:high-score-a.pdf", test: 2, title: "high", job: "ai-engineer", resume: { kind: "local", file: "high-score-a.pdf" }, band: "strong" },
        { id: "file:low-score-b.pdf", test: 2, title: "low", job: "ai-engineer", resume: { kind: "local", file: "low-score-b.pdf" }, band: "weak" },
      ],
      comparisons: [{ id: "order", test: 2, title: "high above low", higher: "file:high-score-a.pdf", lower: "file:low-score-b.pdf" }],
      files: [
        { file: "high-score-a.pdf", expect: "ready", band: "strong", rank: 3 },
        { file: "low-score-b.pdf", expect: "ready", band: "weak", rank: 1 },
      ],
    };
    const result = grade({
      set,
      calls: [ok("file:low-score-b.pdf", 20)],
      structure: [
        { file: "high-score-a.pdf", status: "set_aside", failed: ["phone"] },
        { file: "low-score-b.pdf", status: "ready", failed: [] },
      ],
      notSent: { "file:high-score-a.pdf": "set aside by the ATS check, not sent" },
      runs: 3,
      price: null,
    });
    expect(result.cases[0]).toMatchObject({ score: null, error: "set aside by the ATS check, not sent", bandOk: false });
    expect(measure(result.measures, "structure")).toMatchObject({ status: "fail", failing: ["high-score-a.pdf"] });
    expect(measure(result.measures, "order_accuracy").status).toBe("fail");
    expect(measure(result.measures, "valid_output")).toMatchObject({ status: "pass", value: "1/1 (100%)" });
    expect(measure(result.measures, "factor_direction").status).toBe("skipped");
    expect(result.tokens.costUsd).toBeNull();
  });
});

describe("test 8, job types", () => {
  const KIND_SCORES: Readonly<Record<ResumeKind, number>> = { strong: 90, mid: 70, vague: 60, related: 45, unrelated: 15 };
  const JOB_SET: EvalSet = { cases: [...JOB_TYPE_CASES], comparisons: [...JOB_TYPE_COMPARISONS], files: [] };
  const FILTERED: FilteringOutcome[] = JOB_TYPE_CASES.map((item) => ({
    id: item.id,
    expected: [],
    status: "ready",
    failed: [],
    ok: true,
  }));

  function jobCalls(overrides: Readonly<Record<string, number>> = {}): CallOutcome[] {
    return JOB_TYPE_CASES.map((item) => ok(item.id, overrides[item.id] ?? KIND_SCORES[item.resumeKind ?? "strong"]));
  }

  function only8(overrides: Partial<GradeInput> = {}): GradeInput {
    return input({ set: JOB_SET, calls: jobCalls(), tests: [8], filtering: FILTERED, ...overrides });
  }

  it("puts the range edges inside the range", () => {
    expect([inRange(80, { min: 80, max: 100 }), inRange(79, { min: 80, max: 100 }), inRange(30, { min: 0, max: 30 })]).toEqual([
      true,
      false,
      true,
    ]);
  });

  it("passes a good run of test 8 alone, with the role floor over its 15 same-role cases and every other test skipped", () => {
    const result = grade(only8());
    expect(result.passed).toBe(true);
    expect(measure(result.measures, "job_types_ranges")).toMatchObject({ status: "pass", value: "25/25 (100%)" });
    expect(measure(result.measures, "job_types_order")).toMatchObject({ status: "pass", value: "20/20 (100%)" });
    expect(measure(result.measures, "job_types_filtering")).toMatchObject({ status: "pass", value: "25/25 (100%)" });
    expect(measure(result.measures, "role_floor")).toMatchObject({ status: "pass", value: "15/15 (100%)" });
    expect(measure(result.measures, "valid_output")).toMatchObject({ status: "pass", value: "25/25 (100%)" });
    for (const id of ["structure", "band_accuracy", "order_accuracy", "stability", "injection", "description_strictness", "score_bars"]) {
      expect(measure(result.measures, id), id).toMatchObject({ status: "skipped", value: "not run (--only)" });
    }
  });

  it("passes ranges at 90% and fails them below, naming the cases", () => {
    const twoMisses = grade(only8({ calls: jobCalls({ "jt-swe-mid": 85, "jt-nurse-related": 70 }) }));
    expect(measure(twoMisses.measures, "job_types_ranges")).toMatchObject({ status: "pass", value: "23/25 (92%)" });
    const threeMisses = grade(only8({ calls: jobCalls({ "jt-swe-mid": 85, "jt-nurse-related": 70, "jt-sales-unrelated": 31 }) }));
    expect(measure(threeMisses.measures, "job_types_ranges")).toMatchObject({
      status: "fail",
      value: "22/25 (88%)",
      failing: ["jt-swe-mid", "jt-nurse-related", "jt-sales-unrelated"],
    });
  });

  it("holds strong 1.0 or more above vague, and every other pair to its order", () => {
    const close = grade(only8({ calls: jobCalls({ "jt-marketing-vague": 81 }) }));
    expect(measure(close.measures, "job_types_order")).toMatchObject({ status: "fail", failing: ["jt-marketing-strong-over-vague"] });
    const tie = grade(only8({ calls: jobCalls({ "jt-finance-related": 15 }) }));
    expect(measure(tie.measures, "job_types_order").failing).toEqual(["jt-finance-related-over-unrelated"]);
  });

  it("fails filtering on one miss, and skips it when it was not checked", () => {
    const missed = grade(only8({ filtering: [...FILTERED.slice(1), { ...FILTERED[0], status: "set_aside", failed: ["phone"], ok: false }] }));
    expect(measure(missed.measures, "job_types_filtering")).toMatchObject({ status: "fail", failing: ["jt-swe-strong"] });
    expect(measure(grade(only8({ filtering: null })).measures, "job_types_filtering")).toMatchObject({
      status: "skipped",
      value: "not checked",
    });
  });

  it("in a full run, keeps test 8 out of order accuracy and holds its strong and unrelated cases to the bars", () => {
    const set: EvalSet = { ...SET, cases: [...SET.cases, ...JOB_SET.cases], comparisons: [...SET.comparisons, ...JOB_SET.comparisons] };
    const result = grade(input({ set, calls: [...calls(GOOD), ...jobCalls()], filtering: FILTERED }));
    expect(result.passed).toBe(true);
    expect(measure(result.measures, "order_accuracy").value).toBe("9/9 (100%)");
    expect(measure(result.measures, "score_bars").value).toBe("17/17 (100%)");
    expect(measure(result.measures, "role_floor").value).toBe("25/25 (100%)");
    const weakTooHigh = grade(input({ set, calls: [...calls(GOOD), ...jobCalls({ "jt-sales-unrelated": 72 })], filtering: FILTERED }));
    expect(measure(weakTooHigh.measures, "score_bars").failing).toEqual(["jt-sales-unrelated"]);
  });

  it("names its tests in every measure's test column", () => {
    for (const item of grade(only8()).measures) {
      const tests = measureTests(item);
      expect(tests === null ? "all" : tests.join(", "), item.id).toBe(item.test);
    }
  });
});
