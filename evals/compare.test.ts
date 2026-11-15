import { describe, expect, it } from "vitest";
import { compareRuns, comparisonFileName, comparisonSummary, renderComparison } from "./compare";
import { grade } from "./grade";
import { JOB_TYPE_CASES } from "./job-types";
import { parseScoresFile, scoresFile, scoresFileName, type CaseScores, type ScoresFile } from "./scores-file";
import type { Breakdown } from "./types";

const PARTS = { start: 5, skills: 2, evidence: 1, proofOfWork: 0, education: 0.2 };

function caseScores(test: number, job: string, score: number | null): CaseScores {
  return { test, job, score, roleMatch: score === null ? null : "same", parts: score === null ? null : PARTS };
}

/** The software engineer job's five test 8 cases at the given scores, plus one test 3 case. */
function file(label: string, scores: readonly (number | null)[], extra: Record<string, CaseScores> = {}): ScoresFile {
  const swe = JOB_TYPE_CASES.filter((item) => item.job === "software-engineer");
  return {
    model: `provider/${label}`,
    standIn: false,
    promptVersion: "abcd1234",
    date: "2026-11-15",
    label,
    tests: [3, 8],
    costUsd: 0.0123,
    medianSeconds: 4.25,
    calls: 6,
    cases: {
      ...Object.fromEntries(swe.map((item, index) => [item.id, caseScores(8, item.job, scores[index])])),
      "swe-for-swe": caseScores(3, "software-engineer", 88),
      ...extra,
    },
  };
}

const A = file("model-a", [90, 70, 60, 45, 15]);
const B = file("model-b", [92, 58, 66, 45, 30], { "only-in-b": caseScores(3, "software-engineer", 50) });

describe("compareRuns", () => {
  const result = compareRuns(A, B);

  it("lists every case in both runs with the two scores and the difference", () => {
    expect(result.rows.map((row) => [row.id, row.a, row.b, row.difference])).toEqual([
      ["jt-swe-strong", 90, 92, 2],
      ["jt-swe-mid", 70, 58, -12],
      ["jt-swe-vague", 60, 66, 6],
      ["jt-swe-related", 45, 45, 0],
      ["jt-swe-unrelated", 15, 30, 15],
      ["swe-for-swe", 88, 88, 0],
    ]);
    expect(result.scored).toBe(6);
  });

  it("gives the mean absolute and the largest difference, and counts those over 1.0", () => {
    expect(result.meanAbsoluteDifference).toBeCloseTo(35 / 6, 10);
    expect(result.largest?.id).toBe("jt-swe-unrelated");
    expect(result.overLarge).toBe(2);
  });

  it("finds a changed within-job order, and the same order when only the scores move", () => {
    expect(result.orders).toEqual([
      {
        job: "software-engineer",
        name: "Software Engineer",
        orderA: ["jt-swe-strong", "jt-swe-mid", "jt-swe-vague", "jt-swe-related", "jt-swe-unrelated"],
        orderB: ["jt-swe-strong", "jt-swe-vague", "jt-swe-mid", "jt-swe-related", "jt-swe-unrelated"],
        same: false,
      },
    ]);
    expect(result.sameOrderEveryJob).toBe(false);
    expect(compareRuns(A, file("model-c", [99, 75, 61, 40, 0])).sameOrderEveryJob).toBe(true);
  });

  it("treats a tie in one run and not the other as a different order, and a missing score as not comparable", () => {
    expect(compareRuns(A, file("tie", [90, 70, 70, 45, 15])).sameOrderEveryJob).toBe(false);
    const missing = compareRuns(A, file("missing", [90, null, 60, 45, 15]));
    expect(missing.orders[0].same).toBeNull();
    expect(missing.sameOrderEveryJob).toBe(false);
    expect(missing.scored).toBe(5);
  });

  it("has nothing to say when the runs share no case", () => {
    const none = compareRuns({ ...A, cases: {} }, B);
    expect(none).toMatchObject({ rows: [], scored: 0, meanAbsoluteDifference: null, largest: null, overLarge: 0, orders: [] });
    expect(none.sameOrderEveryJob).toBeNull();
  });
});

describe("the comparison report", () => {
  const result = compareRuns(A, B);
  const text = renderComparison("2026-11-16", A, B, result);

  it("names both runs with their model, tests, cost and median speed", () => {
    expect(text).toContain("# Model comparison: model-a vs model-b, 2026-11-16");
    expect(text).toContain("| Model | provider/model-a | provider/model-b |");
    expect(text).toContain("| Tests run | 3, 8 (--only 3,8) | 3, 8 (--only 3,8) |");
    expect(text).toContain("| Cost | $0.0123 over 6 calls | $0.0123 over 6 calls |");
    expect(text).toContain("| Median speed | 4.3 s per call | 4.3 s per call |");
  });

  it("gives the summary, the order per job and every case on the 0 to 10 scale", () => {
    expect(text).toContain("| Mean absolute difference | 0.58 |");
    expect(text).toContain("| Largest difference | +1.5 (`jt-swe-unrelated`) |");
    expect(text).toContain("| Cases differing by more than 1.0 | 2 |");
    expect(text).toContain("| Same within-job order for every job (test 8) | no |");
    expect(text).toContain("| `jt-swe-mid` | 8 | software-engineer | 7.0 | 5.8 | -1.2 |");
    expect(text).toContain("`jt-swe-strong` 9.0 > `jt-swe-mid` 7.0 > `jt-swe-vague` 6.0");
    expect(text).not.toContain("only-in-b");
    expect(text).not.toContain("stand-in");
  });

  it("marks a tie in an order with =", () => {
    const tie = file("tie", [90, 70, 70, 45, 15]);
    expect(renderComparison("2026-11-16", A, tie, compareRuns(A, tie))).toContain(
      "`jt-swe-strong` 9.0 > `jt-swe-mid` 7.0 = `jt-swe-vague` 7.0 > `jt-swe-related` 4.5",
    );
  });

  it("prints a short summary", () => {
    expect(comparisonSummary(A, B, result)).toContain("Same within-job order for every job: no");
  });

  it("is named by date and both labels, never overwriting one", () => {
    expect(comparisonFileName("2026-11-16", A, B, [])).toBe("2026-11-16-compare-model-a-vs-model-b.md");
    expect(comparisonFileName("2026-11-16", A, B, ["2026-11-16-compare-model-a-vs-model-b.md"])).toBe(
      "2026-11-16-compare-model-a-vs-model-b-2.md",
    );
  });
});

describe("the scores file", () => {
  const breakdown: Breakdown = {
    roleMatch: "related",
    start: 3,
    skills: 1.5,
    evidence: 0.5,
    proofOfWork: 0,
    education: 0.2,
    mustHaves: [{ requirement: "Secret Corp tooling", status: "shown" }],
  };
  const result = grade({
    set: {
      cases: [
        { id: "file:high-score-a.pdf", test: 2, title: "high", job: "ai-engineer", resume: { kind: "local", file: "high-score-a.pdf" }, band: "strong" },
        { id: "unscored", test: 3, title: "x", job: "software-engineer", resume: { kind: "written", file: "x.txt" } },
      ],
      comparisons: [],
      files: [],
    },
    calls: [{ caseId: "file:high-score-a.pdf", run: 0, ok: true, score: 43, breakdown, seconds: 2, inputTokens: 10, outputTokens: 5 }],
    structure: null,
    notSent: {},
    runs: 1,
    price: null,
  });
  const meta = {
    date: "2026-11-15",
    label: "baseline",
    model: "provider/model-a",
    standIn: false,
    promptVersion: "abcd1234",
    runs: 1,
    localFiles: "x",
    tests: [2, 3],
    only: true,
  } as const;
  const scores = scoresFile({ ...meta, tests: [...meta.tests] }, result);

  it("holds each case's score, role match and parts, and no must-have, name or text", () => {
    expect(scores.cases["file:high-score-a.pdf"]).toEqual({
      test: 2,
      job: "ai-engineer",
      score: 43,
      roleMatch: "related",
      parts: { start: 3, skills: 1.5, evidence: 0.5, proofOfWork: 0, education: 0.2 },
    });
    expect(scores.cases.unscored).toEqual({ test: 3, job: "software-engineer", score: null, roleMatch: null, parts: null });
    expect(scores).toMatchObject({ model: "provider/model-a", tests: [2, 3], costUsd: null, medianSeconds: 2, calls: 1 });
    expect(JSON.stringify(scores)).not.toContain("Secret Corp");
  });

  it("reads back what it wrote, and refuses anything else", () => {
    expect(parseScoresFile(JSON.stringify(scores), "a.json")).toEqual(scores);
    expect(() => parseScoresFile("{", "a.json")).toThrow("a.json is not JSON");
    expect(() => parseScoresFile(JSON.stringify({ ...scores, tests: [9] }), "b.json")).toThrow("b.json is not a scores file");
    expect(scoresFileName("2026-11-15-baseline-2.md")).toBe("2026-11-15-baseline-2.json");
  });
});
