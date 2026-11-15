import { BAR_SETTINGS, placementText, settingText, type BarsGrade } from "./bars";
import {
  comparisonOk,
  PASS_MARKS,
  type CaseGrade,
  type ComparisonGrade,
  type Grade,
  type Measure,
  type StructureGrade,
} from "./grade";
import { JOB_TYPE_JOBS } from "./job-types";
import { bandRange, rangeText, shown, shownDifference } from "./scale";
import { testsText } from "./select";
import type { Band, Breakdown, FilteringOutcome, TestNumber } from "./types";

/**
 * What a run prints and writes, with every score, margin and bar on the 0.0
 * to 10.0 scale. Local files appear by file name, ATS status, failed check
 * ids, score and the numbers the score was added up from only: never their
 * text, names, contact details or the must-haves the model read in them.
 */

export type RunMeta = {
  /** yyyy-mm-dd */
  date: string;
  label: string;
  /** The gateway model slug, or a note that the stand-in answered. */
  model: string;
  standIn: boolean;
  /** Short hash of the scoring instructions. */
  promptVersion: string;
  runs: number;
  /** The local folder read for tests 1 and 2, or why it was skipped. */
  localFiles: string;
  /** The tests that ran. */
  tests: readonly TestNumber[];
  /** Whether `--only` chose them. */
  only: boolean;
};

/** Markers in README.md around the list of run reports; a run rewrites only the text between them. */
export const README_LIST_START = "<!-- reports:start -->";
/** Closing marker of the run report list in README.md. */
export const README_LIST_END = "<!-- reports:end -->";
/** Markers in README.md around the list of comparison reports. */
export const README_COMPARISONS_START = "<!-- comparisons:start -->";
/** Closing marker of the comparison report list in README.md. */
export const README_COMPARISONS_END = "<!-- comparisons:end -->";

/** The label part of a comparison report's file name: `<date>-compare-<a>-vs-<b>.md`. */
export const COMPARISON_PREFIX = "compare-";

function bandText(band: Band): string {
  return `${band} (${bandRange(band)})`;
}

function verdict(ok: boolean | null): string {
  if (ok === null) return "-";
  return ok ? "pass" : "FAIL";
}

/** The case's band or range and, for a same-role case, the role floor; null when it states none. */
function caseExpected(item: CaseGrade): string | null {
  const parts = [
    ...(item.case.band ? [bandText(item.case.band)] : []),
    ...(item.case.range ? [rangeText(item.case.range)] : []),
    ...(item.case.sameRole ? [`${shown(PASS_MARKS.roleFloor)} or more (same role)`] : []),
  ];
  return parts.length > 0 ? parts.join("; ") : null;
}

/** Pass when every expectation the case states holds; "-" when it states none. */
function caseVerdict(item: CaseGrade): string {
  if (item.bandOk === null && item.rangeOk === null && item.floorOk === null) return "-";
  return verdict(item.bandOk !== false && item.rangeOk !== false && item.floorOk !== false);
}

function scoreText(item: CaseGrade): string {
  if (item.score === null) return `none (${item.error ?? "not scored"})`;
  return item.case.stability && item.scores.length > 1
    ? `${shown(item.score)} (runs: ${item.scores.map(shown).join(", ")})`
    : shown(item.score);
}

function expectedOrder(item: ComparisonGrade): string {
  const margin = item.comparison.margin;
  if (!margin) return "higher > lower";
  return margin.max === undefined
    ? `higher > lower by ${shown(margin.min)}+`
    : `higher > lower by ${shown(margin.min)} to ${shown(margin.max)}`;
}

function differenceText(item: ComparisonGrade): string {
  return item.difference === null ? "n/a" : shownDifference(item.difference);
}

function structureExpected(item: StructureGrade): string {
  const expectation = item.expectation;
  if (expectation.expect === "ready") return "ready";
  return expectation.checks.length > 0 ? `set aside: ${expectation.checks.join(", ")}` : "set aside (any reason)";
}

function structureActual(item: StructureGrade): { status: string; failed: string } {
  if (!item.outcome) return { status: "not read", failed: "-" };
  return {
    status: item.outcome.status === "ready" ? "ready" : "set aside",
    failed: item.outcome.failed.length > 0 ? item.outcome.failed.join(", ") : "none",
  };
}

const MUST_HAVE_STATUSES = ["shown", "equivalent", "listed", "missing"] as const;

/** Written cases list each must-have with its status; a local file gets counts only, never the texts. */
function mustHavesText(item: CaseGrade, breakdown: Breakdown): string {
  const texts = breakdown.mustHaves.flatMap((mustHave) =>
    mustHave.requirement === null ? [] : [`${mustHave.requirement} (${mustHave.status})`],
  );
  if (item.case.resume.kind === "written" && texts.length === breakdown.mustHaves.length) return texts.join("; ");
  return MUST_HAVE_STATUSES.map(
    (status) => `${breakdown.mustHaves.filter((mustHave) => mustHave.status === status).length} ${status}`,
  ).join(", ");
}

const part = (value: number) => value.toFixed(1);

/** One row per scored case: how its total was added up. */
function breakdownRows(cases: readonly CaseGrade[]): string[][] {
  return cases.flatMap((item) => {
    const { breakdown, score } = item;
    if (breakdown === null || score === null) return [];
    return [
      [
        `\`${item.case.id}\``,
        breakdown.roleMatch,
        part(breakdown.start),
        part(breakdown.skills),
        part(breakdown.evidence),
        part(breakdown.proofOfWork),
        part(breakdown.education),
        shown(score),
        mustHavesText(item, breakdown),
      ],
    ];
  });
}

const BAR_SUMMARY_HEADER =["Setting", "Bars", "Top talent", "Clear the invite bar", "Below", "Not scored"] as const;

/** Test 7: one row per bar setting with its counts. */
function barSummaryRows(bars: BarsGrade): string[][] {
  return bars.summaries.map((summary) => [
    summary.setting.name,
    settingText(summary.setting),
    String(summary.topTalent),
    String(summary.invite),
    String(summary.below),
    String(summary.unscored),
  ]);
}

/** Test 7: one row per banded case with its score and where it falls under each setting. */
function barCaseTable(bars: BarsGrade): { header: string[]; rows: string[][] } {
  return {
    header: ["Case", "Expected band", "Score", ...BAR_SETTINGS.map((setting) => `${setting.name} (${settingText(setting)})`)],
    rows: bars.rows.map((row) => [
      `\`${row.id}\``,
      row.band,
      row.score === null ? "none" : shown(row.score),
      ...BAR_SETTINGS.map((setting) => {
        const placement = row.placements[setting.id];
        return placement === null ? "not scored" : placementText(placement);
      }),
    ]),
  };
}

function filteringExpected(item: FilteringOutcome): string {
  return item.expected.length === 0 ? "ready" : `set aside on exactly: ${item.expected.join(", ")}`;
}

/** Test 8: one table per job with its five resumes and the comparisons within it, then the ATS filtering table. */
function jobTypesSection(result: Grade): string {
  if (!result.tests.includes(8)) return "Not run (--only).";
  const jobs = JOB_TYPE_JOBS.flatMap(({ job, name }) => {
    const cases = result.cases.filter((item) => item.case.test === 8 && item.case.job === job);
    if (cases.length === 0) return [];
    const ids = new Set(cases.map((item) => item.case.id));
    const resumes = mdTable(
      ["Resume", "Case", "Expected range", "Score", "Role match", "Start", "Skills", "Evidence", "Proof of work", "Education", "Result"],
      cases.map((item) => {
        const breakdown = item.breakdown;
        const parts = breakdown
          ? [breakdown.roleMatch, ...[breakdown.start, breakdown.skills, breakdown.evidence, breakdown.proofOfWork, breakdown.education].map(part)]
          : ["-", "-", "-", "-", "-", "-"];
        return [
          item.case.resumeKind ?? "-",
          `\`${item.case.id}\``,
          item.case.range ? rangeText(item.case.range) : "-",
          scoreText(item),
          ...parts,
          caseVerdict(item),
        ];
      }),
    );
    const order = mdTable(
      ["Comparison", "Higher", "Lower", "Expected", "Difference", "Result"],
      result.comparisons
        .filter((item) => item.comparison.test === 8 && ids.has(item.comparison.higher))
        .map((item) => [
          item.comparison.title,
          `\`${item.comparison.higher}\` ${item.higher === null ? "n/a" : shown(item.higher)}`,
          `\`${item.comparison.lower}\` ${item.lower === null ? "n/a" : shown(item.lower)}`,
          expectedOrder(item),
          differenceText(item),
          verdict(comparisonOk(item)),
        ]),
    );
    return [`### ${name}\n\n${resumes}\n\n${order}`];
  });
  const filtering =
    result.filtering.length === 0
      ? "Not checked."
      : mdTable(
          ["Resume text", "Expected", "ATS status", "Failed checks", "Result"],
          result.filtering.map((item) => [
            `\`${item.id}\``,
            filteringExpected(item),
            item.status === "ready" ? "ready" : "set aside",
            item.failed.length > 0 ? item.failed.join(", ") : "none",
            verdict(item.ok),
          ]),
        );
  return [
    ...jobs,
    `### Filtering (no model)\n\nEvery resume text above through the real ATS check as a small PDF with no picture, and four negatives built in code from the strong nurse resume: email removed, phone removed, both removed, and one picture.\n\n${filtering}`,
  ].join("\n\n");
}

/** Plain-text columns, padded to the widest cell. */
export function textTable(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = header.map((cell, column) =>
    Math.max(cell.length, ...rows.map((row) => (row[column] ?? "").length)),
  );
  const line = (row: readonly string[]) =>
    row.map((cell, column) => cell.padEnd(widths[column])).join("  ").trimEnd();
  return [line(header), line(widths.map((width) => "-".repeat(width))), ...rows.map(line)].join("\n");
}

/** The table `npm run eval` prints. */
export function consoleSummary(meta: RunMeta, result: Grade): string {
  const caseRows = result.cases.map((item) => [
    String(item.case.test),
    item.case.id,
    caseExpected(item) ?? "see comparisons",
    scoreText(item),
    caseVerdict(item),
  ]);
  const comparisonRows = result.comparisons.map((item) => [
    String(item.comparison.test),
    item.comparison.id,
    expectedOrder(item),
    differenceText(item),
    verdict(comparisonOk(item)),
  ]);
  const structureRows = result.structure.map((item) => {
    const actual = structureActual(item);
    return ["1", item.expectation.file, structureExpected(item), `${actual.status}; failed: ${actual.failed}`, verdict(item.ok)];
  });
  const measureRows = result.measures.map((measure) => [
    measure.test,
    measure.name,
    measure.passMark,
    measure.value,
    measure.status,
  ]);
  return [
    `Model: ${meta.model}   Prompt version: ${meta.promptVersion}   Tests: ${testsText(meta.tests, meta.only)}   Runs: ${meta.runs}   Local files: ${meta.localFiles}`,
    "",
    textTable(["Test", "Case or file", "Expected", "Actual", "Result"], [
      ...structureRows,
      ...caseRows,
      ...comparisonRows,
    ]),
    "",
    textTable(["Test", "Measure", "Pass mark", "Value", "Status"], measureRows),
    "",
    ...(result.tests.includes(7)
      ? ["Score bars (test 7)", textTable(BAR_SUMMARY_HEADER, barSummaryRows(result.bars)), ""]
      : []),
    result.passed ? "All pass marks met." : "A pass mark was missed.",
  ].join("\n");
}

/** Makes text safe for one Markdown table cell: escapes pipes and flattens line breaks. */
export function mdCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** A Markdown table from a header row and body rows; every cell goes through `mdCell`. */
export function mdTable(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [
    `| ${header.map(mdCell).join(" | ")} |`,
    `|${header.map(() => "---").join("|")}|`,
    ...rows.map((row) => `| ${row.map(mdCell).join(" | ")} |`),
  ].join("\n");
}

function failingSection(measures: readonly Measure[]): string {
  const failed = measures.filter((measure) => measure.status === "fail");
  if (failed.length === 0) return "None.";
  return failed.map((measure) => `- **${measure.name}**: ${measure.failing.join(", ")}`).join("\n");
}

/** The dated report written under docs/evals/. */
export function renderReport(meta: RunMeta, result: Grade): string {
  const structure =
    result.structure.length === 0
      ? `Not run: ${meta.localFiles}.`
      : mdTable(
          ["File", "Expected", "ATS status", "Failed checks", "Result"],
          result.structure.map((item) => {
            const actual = structureActual(item);
            return [item.expectation.file, structureExpected(item), actual.status, actual.failed, verdict(item.ok)];
          }),
        );
  const cases = mdTable(
    ["Test", "Case", "What it checks", "Job", "Expected", "Score", "Result"],
    result.cases.map((item) => [
      String(item.case.test),
      `\`${item.case.id}\``,
      item.case.title,
      item.case.job,
      caseExpected(item) ?? "-",
      scoreText(item),
      caseVerdict(item),
    ]),
  );
  const comparisons = mdTable(
    ["Test", "Comparison", "Higher", "Lower", "Expected", "Difference", "Result"],
    result.comparisons.map((item) => [
      String(item.comparison.test),
      item.comparison.title,
      `\`${item.comparison.higher}\` ${item.higher === null ? "n/a" : shown(item.higher)}`,
      `\`${item.comparison.lower}\` ${item.lower === null ? "n/a" : shown(item.lower)}`,
      expectedOrder(item),
      differenceText(item),
      verdict(comparisonOk(item)),
    ]),
  );
  const breakdown = breakdownRows(result.cases);
  const breakdownTable =
    breakdown.length === 0
      ? "No case was scored."
      : mdTable(
          ["Case", "Role match", "Start", "Skills", "Evidence", "Proof of work", "Education", "Total", "Must-haves"],
          breakdown,
        );
  const measures = mdTable(
    ["Measure", "Test", "Pass mark", "Value", "Status"],
    result.measures.map((measure) => [measure.name, measure.test, measure.passMark, measure.value, measure.status]),
  );
  const barCases = barCaseTable(result.bars);
  const bars = !result.tests.includes(7)
    ? "Not run (--only)."
    : result.bars.rows.length === 0
      ? "No case states a band."
      : `${mdTable(BAR_SUMMARY_HEADER, barSummaryRows(result.bars))}

${mdTable(barCases.header, barCases.rows)}`;
  const tokens =
    result.tokens.calls === 0
      ? "No usage was reported."
      : `${result.tokens.input} input and ${result.tokens.output} output tokens over ${result.tokens.calls} calls${
          result.tokens.costUsd === null ? "; the price was not available" : `, $${result.tokens.costUsd.toFixed(4)} at the gateway's rates`
        }.`;

  return `# Evaluation: ${meta.label}, ${meta.date}

| | |
|---|---|
| Date | ${meta.date} |
| Model | ${mdCell(meta.model)} |
| Prompt version | \`${meta.promptVersion}\` (short hash of the scoring instructions) |
| Tests run | ${mdCell(testsText(meta.tests, meta.only))} |
| Runs per stability case | ${meta.runs} |
| Local files (tests 1 and 2) | ${mdCell(meta.localFiles)} |
| Result | ${result.passed ? "every pass mark met" : "a pass mark was missed"} |

What each test means is in [README.md](README.md). Every score, band, margin and bar is on the 0.0 to 10.0 scale.${
    meta.standIn ? "\n\nThe stand-in model answered this run, so its scores say nothing about the real model." : ""
  }

## Measures

${measures}

## Failing

${failingSection(result.measures)}

## Test 1: resume structure

${structure}

## Cases

${cases}

## How each score was added up

The model gives the role match, the start score and the parts; the app adds them up: total = start + (skills + evidence + proof of work + education) x start / 5, rounded to one decimal. The parts are shown before that scaling. A local file's must-haves are counted, never listed.

${breakdownTable}

## Comparisons

${comparisons}

## Score bars

Each banded case's score under three settings of a job's two bars, applied after scoring as the app does (no model call). Only the default setting is graded. The job-types cases whose range is all inside one band (strong and unrelated) are held to that band here.

${bars}

## Job types

Test 8: five kinds of job, five resumes each. Strong, mid and vague are the job's role (role floor 5.0); related does part of the same hands-on work; unrelated does none of it. The parts are shown before the start / 5 scaling.

${jobTypesSection(result)}

## Speed and cost

Median ${result.speed.medianSeconds?.toFixed(1) ?? "n/a"} s and 95th percentile ${result.speed.p95Seconds?.toFixed(1) ?? "n/a"} s per call, over ${result.speed.calls} calls. ${tokens}
`;
}

/** yyyy-mm-dd in local time. */
export function localDate(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A label as a file-name part: lower case letters, digits and hyphens. */
export function slugLabel(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug.slice(0, 60) : "run";
}

/** `<date>-<label>.md`, with `-2`, `-3`, ... when that name is taken. */
export function reportFileName(date: string, label: string, existing: readonly string[]): string {
  const base = `${date}-${slugLabel(label)}`;
  if (!existing.includes(`${base}.md`)) return `${base}.md`;
  let index = 2;
  while (existing.includes(`${base}-${index}.md`)) index += 1;
  return `${base}-${index}.md`;
}

const DATED_REPORT = /^\d{4}-\d{2}-\d{2}-.+\.md$/;
const COMPARISON_REPORT = new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${COMPARISON_PREFIX}.+\\.md$`);

/** Run reports in docs/evals/, newest first: `yyyy-mm-dd-*.md`, comparison reports left out. */
export function reportFiles(names: readonly string[]): string[] {
  return names
    .filter((name) => DATED_REPORT.test(name) && !COMPARISON_REPORT.test(name))
    .toSorted()
    .toReversed();
}

/** Comparison reports in docs/evals/, newest first: `yyyy-mm-dd-compare-*.md`. */
export function comparisonFiles(names: readonly string[]): string[] {
  return names.filter((name) => COMPARISON_REPORT.test(name)).toSorted().toReversed();
}

function replaceList(readme: string, startMarker: string, endMarker: string, files: readonly string[], empty: string): string {
  const start = readme.indexOf(startMarker);
  const end = readme.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`docs/evals/README.md must contain ${startMarker} and ${endMarker}`);
  }
  const list = files.length === 0 ? empty : files.map((name) => `- [${name.replace(/\.md$/, "")}](${name})`).join("\n");
  return `${readme.slice(0, start + startMarker.length)}\n${list}\n${readme.slice(end)}`;
}

/** The README with its report list rebuilt from `reports`; throws when the markers are missing. */
export function updateReadme(readme: string, reports: readonly string[]): string {
  return replaceList(readme, README_LIST_START, README_LIST_END, reports, "No reports yet.");
}

/** The README with its comparison list rebuilt from `comparisons`; throws when the markers are missing. */
export function updateReadmeComparisons(readme: string, comparisons: readonly string[]): string {
  return replaceList(readme, README_COMPARISONS_START, README_COMPARISONS_END, comparisons, "No comparisons yet.");
}
