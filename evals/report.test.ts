import { describe, expect, it } from "vitest";
import { grade } from "./grade";
import { JOB_TYPE_CASES, JOB_TYPE_COMPARISONS } from "./job-types";
import {
  comparisonFiles,
  consoleSummary,
  localDate,
  README_COMPARISONS_END,
  README_COMPARISONS_START,
  README_LIST_END,
  README_LIST_START,
  renderReport,
  reportFileName,
  reportFiles,
  slugLabel,
  textTable,
  updateReadme,
  updateReadmeComparisons,
  type RunMeta,
} from "./report";
import { ALL_TESTS, type Breakdown, type EvalSet } from "./types";

const META: RunMeta = {
  date: "2026-11-15",
  label: "baseline",
  model: "provider/model-a",
  standIn: false,
  promptVersion: "abcd1234",
  runs: 3,
  localFiles: "Resume_test/dummy (2 labelled files)",
  tests: ALL_TESTS,
  only: false,
};

const SET: EvalSet = {
  cases: [
    { id: "file:high-score-a.pdf", test: 2, title: "high", job: "software-engineer", resume: { kind: "local", file: "high-score-a.pdf" }, band: "strong" },
    { id: "written", test: 3, title: "A | pipe", job: "finance-manager", resume: { kind: "written", file: "x.txt" }, band: "weak", stability: true },
    { id: "same-role", test: 4, title: "floor only", job: "software-engineer", resume: { kind: "written", file: "y.txt" }, sameRole: true },
  ],
  comparisons: [{ id: "order", test: 3, title: "high above written", higher: "file:high-score-a.pdf", lower: "written", margin: { min: 5, measure: "large_factor" } }],
  files: [
    { file: "high-score-a.pdf", expect: "ready", band: "strong", rank: 3 },
    { file: "fails-no-phone.pdf", expect: "set_aside", checks: ["phone"] },
  ],
};

const WRITTEN_BREAKDOWN: Breakdown = {
  roleMatch: "unrelated",
  start: 1,
  skills: 0.75,
  evidence: 0.2,
  proofOfWork: 0,
  education: 0.4,
  mustHaves: [
    { requirement: "Budgeting", status: "listed" },
    { requirement: "IFRS", status: "missing" },
  ],
};

/** A local file's breakdown as the runner keeps it: statuses only. */
const LOCAL_BREAKDOWN: Breakdown = {
  roleMatch: "same",
  start: 5,
  skills: 2.4,
  evidence: 0.5,
  proofOfWork: 0.3,
  education: 0.2,
  mustHaves: [
    { requirement: null, status: "shown" },
    { requirement: null, status: "shown" },
    { requirement: null, status: "equivalent" },
  ],
};

const SAME_ROLE_BREAKDOWN: Breakdown = { ...LOCAL_BREAKDOWN, mustHaves: [{ requirement: "SQL", status: "shown" }] };

const RESULT = grade({
  set: SET,
  calls: [
    { caseId: "file:high-score-a.pdf", run: 0, ok: true, score: 80, breakdown: LOCAL_BREAKDOWN, seconds: 1.5, inputTokens: 900, outputTokens: 100 },
    { caseId: "written", run: 0, ok: true, score: 30, breakdown: WRITTEN_BREAKDOWN, seconds: 2.5, inputTokens: 1_100, outputTokens: 120 },
    { caseId: "written", run: 1, ok: true, score: 34, breakdown: WRITTEN_BREAKDOWN, seconds: 2, inputTokens: 1_100, outputTokens: 110 },
    { caseId: "written", run: 2, ok: true, score: 28, breakdown: WRITTEN_BREAKDOWN, seconds: 3, inputTokens: 1_100, outputTokens: 130 },
    { caseId: "same-role", run: 0, ok: true, score: 45, breakdown: SAME_ROLE_BREAKDOWN, seconds: 2, inputTokens: 1_000, outputTokens: 100 },
  ],
  structure: [
    { file: "high-score-a.pdf", status: "ready", failed: [] },
    { file: "fails-no-phone.pdf", status: "ready", failed: [] },
  ],
  notSent: {},
  runs: 3,
  price: { input: 0.000001, output: 0.000005 },
});

describe("renderReport", () => {
  const report = renderReport(META, RESULT);

  it("records the date, model, prompt version and every measure", () => {
    expect(report).toContain("# Evaluation: baseline, 2026-11-15");
    expect(report).toContain("| Model | provider/model-a |");
    expect(report).toContain("`abcd1234`");
    for (const measure of RESULT.measures) expect(report).toContain(`| ${measure.name} |`);
    expect(report).toContain("a pass mark was missed");
  });

  it("lists the failing measures with their cases", () => {
    expect(report).toContain("- **Structure accuracy**: fails-no-phone.pdf");
  });

  it("shows each case with its expected band and its runs, escaping table pipes", () => {
    expect(report).toContain("| 3 | `written` | A \\| pipe | finance-manager | weak (0.0 to 3.9) | 3.0 (runs: 3.0, 3.4, 2.8) | pass |");
    expect(report).toContain("| fails-no-phone.pdf | set aside: phone | ready | none | FAIL |");
    expect(report).toContain("| `file:high-score-a.pdf` 8.0 | `written` 3.0 | higher > lower by 0.5+ | +5.0 | pass |");
    expect(report).toContain("Every score, band, margin and bar is on the 0.0 to 10.0 scale.");
  });

  it("shows how each score was added up, listing must-haves for written cases and only counting them for local files", () => {
    expect(report).toContain("## How each score was added up");
    expect(report).toContain(
      "| Case | Role match | Start | Skills | Evidence | Proof of work | Education | Total | Must-haves |",
    );
    expect(report).toContain(
      "| `written` | unrelated | 1.0 | 0.8 | 0.2 | 0.0 | 0.4 | 3.0 | Budgeting (listed); IFRS (missing) |",
    );
    expect(report).toContain(
      "| `file:high-score-a.pdf` | same | 5.0 | 2.4 | 0.5 | 0.3 | 0.2 | 8.0 | 2 shown, 1 equivalent, 0 listed, 0 missing |",
    );
  });

  it("never lists a local file's must-haves, even when a text reaches the report", () => {
    const leaked = grade({
      set: { cases: [SET.cases[0]], comparisons: [], files: [] },
      calls: [
        {
          caseId: "file:high-score-a.pdf",
          run: 0,
          ok: true,
          score: 80,
          breakdown: { ...LOCAL_BREAKDOWN, mustHaves: [{ requirement: "Secret Corp tooling", status: "shown" }] },
          seconds: 1,
          inputTokens: 1,
          outputTokens: 1,
        },
      ],
      structure: null,
      notSent: {},
      runs: 1,
      price: null,
    });
    const text = renderReport(META, leaked);
    expect(text).not.toContain("Secret Corp");
    expect(text).toContain("1 shown, 0 equivalent, 0 listed, 0 missing");
  });

  it("shows the role floor of a same-role case and fails it below 5.0", () => {
    expect(report).toContain("| 4 | `same-role` | floor only | software-engineer | 5.0 or more (same role) | 4.5 | FAIL |");
    expect(report).toContain("- **Role floor**: same-role");
  });

  it("places each banded case under the three score-bar settings, with a summary per setting", () => {
    expect(report).toContain("## Score bars");
    expect(report).toContain(
      "| Case | Expected band | Score | Default (top talent 8.0, invite 7.0) | Strict (top talent 9.0, invite 8.0) | Lenient (top talent 6.0, invite 5.0) |",
    );
    expect(report).toContain("| `file:high-score-a.pdf` | strong | 8.0 | top talent | invite | top talent |");
    expect(report).toContain("| `written` | weak | 3.0 | below | below | below |");
    expect(report).toContain("| Default | top talent 8.0, invite 7.0 | 1 | 1 | 1 | 0 |");
    expect(report).toContain("| Strict | top talent 9.0, invite 8.0 | 0 | 1 | 1 | 0 |");
    expect(RESULT.bars.rows.map((row) => row.id)).toEqual(["file:high-score-a.pdf", "written"]);
  });

  it("reports speed and cost", () => {
    expect(report).toContain("Median 2.0 s and 95th percentile 3.0 s per call, over 5 calls.");
    expect(report).toContain("5200 input and 560 output tokens over 5 calls, $0.0080 at the gateway's rates.");
  });

  it("marks a stand-in run", () => {
    expect(renderReport({ ...META, standIn: true }, RESULT)).toContain("The stand-in model answered this run");
    expect(report).not.toContain("stand-in");
  });
});

describe("the job types section (test 8)", () => {
  const swe = JOB_TYPE_CASES.filter((item) => item.job === "software-engineer");
  const scores = [90, 70, 85, 45, 15];
  const result = grade({
    set: { cases: swe, comparisons: JOB_TYPE_COMPARISONS.filter((item) => item.id.startsWith("jt-swe-")), files: [] },
    calls: swe.map((item, index) => ({
      caseId: item.id,
      run: 0,
      ok: true,
      score: scores[index],
      breakdown: SAME_ROLE_BREAKDOWN,
      seconds: 2,
      inputTokens: 1,
      outputTokens: 1,
    })),
    structure: null,
    notSent: {},
    runs: 3,
    price: null,
    tests: [8],
    filtering: [
      { id: "jt-swe-strong", expected: [], status: "ready", failed: [], ok: true },
      { id: "negative:no-phone", expected: ["phone"], status: "set_aside", failed: ["phone"], ok: true },
    ],
  });
  const report = renderReport({ ...META, tests: [8], only: true }, result);

  it("states the tests that ran, and shows the others as not run", () => {
    expect(report).toContain("| Tests run | 8 (--only 8) |");
    expect(report).toContain("| Stability | 5 | spread of 1.0 or less over 3 runs | not run (--only) | skipped |");
    expect(report).toMatch(/## Score bars\n\n[^\n]+\n\nNot run \(--only\)\./);
    expect(consoleSummary({ ...META, tests: [8], only: true }, result)).toContain("Tests: 8 (--only 8)");
  });

  it("gives each job a table of its resumes with range, score, role match and parts, then its comparisons", () => {
    expect(report).toContain("### Software Engineer");
    expect(report).toContain("| strong | `jt-swe-strong` | 8.0 to 10.0 | 9.0 | same | 5.0 | 2.4 | 0.5 | 0.3 | 0.2 | pass |");
    expect(report).toContain("| vague | `jt-swe-vague` | 5.0 to 7.9 | 8.5 | same |");
    expect(report).toContain(
      "| Software Engineer job: strong above vague | `jt-swe-strong` 9.0 | `jt-swe-vague` 8.5 | higher > lower by 1.0+ | +0.5 | FAIL |",
    );
    expect(report).not.toContain("### Finance Manager");
  });

  it("lists the filtering outcomes", () => {
    expect(report).toContain("### Filtering (no model)");
    expect(report).toContain("| `negative:no-phone` | set aside on exactly: phone | set aside | phone | pass |");
    expect(report).toContain("| `jt-swe-strong` | ready | ready | none | pass |");
  });
});

describe("consoleSummary", () => {
  it("prints every file, case, comparison and measure", () => {
    const text = consoleSummary(META, RESULT);
    expect(text).toContain("fails-no-phone.pdf");
    expect(text).toContain("file:high-score-a.pdf");
    expect(text).toContain("higher > lower by 0.5+");
    expect(text).toContain("stays weak (0.0 to 3.9)");
    expect(text).toContain("Injection resistance");
    expect(text).toContain("Score bars (test 7)");
    expect(text).toContain("A pass mark was missed.");
  });

  it("pads columns to the widest cell", () => {
    expect(textTable(["a", "bb"], [["ccc", "d"]])).toBe("a    bb\n---  --\nccc  d");
  });
});

describe("report files", () => {
  it("names a report by date and label, never overwriting one", () => {
    expect(slugLabel("Baseline: Haiku / today!")).toBe("baseline-haiku-today");
    expect(slugLabel("***")).toBe("run");
    expect(reportFileName("2026-11-15", "baseline", [])).toBe("2026-11-15-baseline.md");
    expect(reportFileName("2026-11-15", "baseline", ["2026-11-15-baseline.md", "2026-11-15-baseline-2.md"])).toBe(
      "2026-11-15-baseline-3.md",
    );
  });

  it("lists dated reports newest first, and comparison reports apart", () => {
    const names = [
      "README.md",
      "2026-11-15-a.md",
      "2026-11-15-a.json",
      "2026-12-01-b.md",
      "2026-12-02-compare-a-vs-b.md",
      "notes.txt",
    ];
    expect(reportFiles(names)).toEqual(["2026-12-01-b.md", "2026-11-15-a.md"]);
    expect(comparisonFiles(names)).toEqual(["2026-12-02-compare-a-vs-b.md"]);
  });

  it("rebuilds the README comparison list between its own markers", () => {
    const readme = `${README_LIST_START}\n- [r](r.md)\n${README_LIST_END}\n\n${README_COMPARISONS_START}\nold\n${README_COMPARISONS_END}\n`;
    const updated = updateReadmeComparisons(readme, ["2026-12-02-compare-a-vs-b.md"]);
    expect(updated).toContain(`${README_COMPARISONS_START}\n- [2026-12-02-compare-a-vs-b](2026-12-02-compare-a-vs-b.md)\n${README_COMPARISONS_END}`);
    expect(updated).toContain("- [r](r.md)");
    expect(updateReadmeComparisons(readme, [])).toContain("No comparisons yet.");
    expect(() => updateReadmeComparisons(`${README_LIST_START}${README_LIST_END}`, [])).toThrow("must contain");
  });

  it("dates a run in local time", () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("rebuilds the README list between its markers", () => {
    const readme = `# Title\n\n${README_LIST_START}\nold\n${README_LIST_END}\n`;
    expect(updateReadme(readme, ["2026-11-15-baseline.md"])).toBe(
      `# Title\n\n${README_LIST_START}\n- [2026-11-15-baseline](2026-11-15-baseline.md)\n${README_LIST_END}\n`,
    );
    expect(updateReadme(readme, [])).toContain("No reports yet.");
    expect(() => updateReadme("# no markers", [])).toThrow("must contain");
  });
});
