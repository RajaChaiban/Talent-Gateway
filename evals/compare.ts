import { JOB_TYPE_JOBS } from "./job-types";
import { COMPARISON_PREFIX, mdCell as cell, mdTable as table, reportFileName, slugLabel } from "./report";
import { shown, shownDifference } from "./scale";
import type { ScoresFile } from "./scores-file";
import { testsText } from "./select";
import { ALL_TESTS } from "./types";

/**
 * `npm run eval:compare`: two runs' scores files side by side. Pure: the
 * same two files always give the same comparison. Scores stay in stored
 * tenths and are shown on the 0.0 to 10.0 scale.
 */

/** A difference over this (1.0) is counted. */
export const LARGE_DIFFERENCE = 10;

export type CaseRow = {
  id: string;
  test: number;
  job: string;
  a: number | null;
  b: number | null;
  /** b - a, or null when either has no score. */
  difference: number | null;
};

export type JobOrder = {
  job: string;
  name: string;
  /** Case ids in each run's order, highest score first. */
  orderA: string[];
  orderB: string[];
  /** Whether every two of the job's cases are ranked the same way (a tie only matches a tie); null when a score is missing. */
  same: boolean | null;
};

export type RunComparison = {
  rows: CaseRow[];
  /** Cases scored in both runs. */
  scored: number;
  /** In stored tenths; null when no case was scored in both. */
  meanAbsoluteDifference: number | null;
  largest: CaseRow | null;
  overLarge: number;
  orders: JobOrder[];
  /** True when every job of test 8 in both runs has the same order; null when none can be compared. */
  sameOrderEveryJob: boolean | null;
};

/** Highest score first; a tie keeps the set's order (strong, mid, vague, related, unrelated). */
function byScore(rows: readonly CaseRow[], side: "a" | "b"): string[] {
  return rows.toSorted((x, y) => (y[side] ?? 0) - (x[side] ?? 0)).map((row) => row.id);
}

function sameOrder(rows: readonly CaseRow[]): boolean {
  return rows.every((x) =>
    rows.every((y) => Math.sign((x.a ?? 0) - (y.a ?? 0)) === Math.sign((x.b ?? 0) - (y.b ?? 0))),
  );
}

export function compareRuns(a: ScoresFile, b: ScoresFile): RunComparison {
  const rows: CaseRow[] = Object.entries(a.cases).flatMap(([id, left]) => {
    const right = b.cases[id];
    if (!right) return [];
    const difference = left.score !== null && right.score !== null ? right.score - left.score : null;
    return [{ id, test: left.test, job: left.job, a: left.score, b: right.score, difference }];
  });
  const scored = rows.filter((row) => row.difference !== null);
  const absolute = (row: CaseRow) => Math.abs(row.difference ?? 0);
  const largest = scored.reduce<CaseRow | null>((top, row) => (top === null || absolute(row) > absolute(top) ? row : top), null);
  const orders: JobOrder[] = JOB_TYPE_JOBS.flatMap(({ job, name }) => {
    const own = rows.filter((row) => row.test === 8 && row.job === job);
    if (own.length === 0) return [];
    const complete = own.every((row) => row.difference !== null);
    return [{ job, name, orderA: byScore(own, "a"), orderB: byScore(own, "b"), same: complete ? sameOrder(own) : null }];
  });
  return {
    rows,
    scored: scored.length,
    meanAbsoluteDifference:
      scored.length === 0 ? null : scored.reduce((sum, row) => sum + absolute(row), 0) / scored.length,
    largest,
    overLarge: scored.filter((row) => absolute(row) > LARGE_DIFFERENCE).length,
    orders,
    sameOrderEveryJob: orders.length === 0 ? null : orders.every((order) => order.same === true),
  };
}

/** `<date>-compare-<labelA>-vs-<labelB>.md`, with `-2`, `-3`, ... when that name is taken. */
export function comparisonFileName(date: string, a: ScoresFile, b: ScoresFile, existing: readonly string[]): string {
  return reportFileName(date, `${COMPARISON_PREFIX}${slugLabel(a.label)}-vs-${slugLabel(b.label)}`, existing);
}

const score = (value: number | null) => (value === null ? "none" : shown(value));
const cost = (value: number | null) => (value === null ? "unknown" : `$${value.toFixed(4)}`);
const seconds = (value: number | null) => (value === null ? "n/a" : `${value.toFixed(1)} s`);
const yesNo = (value: boolean | null) => (value === null ? "n/a (a score is missing)" : value ? "yes" : "no");

function testsOf(file: ScoresFile): string {
  return testsText(file.tests.toSorted((x, y) => x - y), file.tests.length !== ALL_TESTS.length);
}

/** The comparison report written under docs/evals/. */
export function renderComparison(date: string, a: ScoresFile, b: ScoresFile, result: RunComparison): string {
  const largest = result.largest;
  const orderText = (ids: readonly string[], side: "a" | "b") => {
    const scores = ids.map((id) => result.rows.find((row) => row.id === id)?.[side] ?? null);
    return ids
      .map((id, index) => `${index === 0 ? "" : scores[index] === scores[index - 1] ? " = " : " > "}\`${id}\` ${score(scores[index])}`)
      .join("");
  };
  const orders =
    result.orders.length === 0
      ? "Test 8 is in neither run, or in only one."
      : table(
          ["Job", `Order in ${a.label}`, `Order in ${b.label}`, "Same order"],
          result.orders.map((order) => [order.name, orderText(order.orderA, "a"), orderText(order.orderB, "b"), yesNo(order.same)]),
        );
  const cases =
    result.rows.length === 0
      ? "No case is in both runs."
      : table(
          ["Case", "Test", "Job", a.label, b.label, "Difference"],
          result.rows.map((row) => [
            `\`${row.id}\``,
            String(row.test),
            row.job,
            score(row.a),
            score(row.b),
            row.difference === null ? "n/a" : shownDifference(row.difference),
          ]),
        );
  return `# Model comparison: ${a.label} vs ${b.label}, ${date}

| | ${cell(a.label)} | ${cell(b.label)} |
|---|---|---|
| Model | ${cell(a.model)} | ${cell(b.model)} |
| Prompt version | \`${a.promptVersion}\` | \`${b.promptVersion}\` |
| Run on | ${a.date} | ${b.date} |
| Tests run | ${cell(testsOf(a))} | ${cell(testsOf(b))} |
| Cost | ${cost(a.costUsd)} over ${a.calls} calls | ${cost(b.costUsd)} over ${b.calls} calls |
| Median speed | ${seconds(a.medianSeconds)} per call | ${seconds(b.medianSeconds)} per call |

Every score is on the 0.0 to 10.0 scale; a difference is ${b.label} minus ${a.label}.${
    a.standIn || b.standIn ? "\n\nThe stand-in model answered at least one of these runs, so this says nothing about a real model." : ""
  }

## Summary

| | |
|---|---|
| Cases in both runs | ${result.rows.length} (${result.scored} scored in both) |
| Mean absolute difference | ${result.meanAbsoluteDifference === null ? "n/a" : (result.meanAbsoluteDifference / 10).toFixed(2)} |
| Largest difference | ${largest === null || largest.difference === null ? "n/a" : `${shownDifference(largest.difference)} (\`${largest.id}\`)`} |
| Cases differing by more than ${shown(LARGE_DIFFERENCE)} | ${result.overLarge} |
| Same within-job order for every job (test 8) | ${yesNo(result.sameOrderEveryJob)} |

## Within-job order (test 8)

${orders}

## Every case in both runs

${cases}
`;
}

/** The lines `npm run eval:compare` prints. */
export function comparisonSummary(a: ScoresFile, b: ScoresFile, result: RunComparison): string {
  const largest = result.largest;
  return [
    `${a.label} (${a.model}) vs ${b.label} (${b.model})`,
    `Cases in both: ${result.rows.length}, scored in both: ${result.scored}`,
    `Mean absolute difference: ${result.meanAbsoluteDifference === null ? "n/a" : (result.meanAbsoluteDifference / 10).toFixed(2)}`,
    `Largest difference: ${largest === null || largest.difference === null ? "n/a" : `${shownDifference(largest.difference)} (${largest.id})`}`,
    `Differ by more than ${shown(LARGE_DIFFERENCE)}: ${result.overLarge}`,
    `Same within-job order for every job: ${yesNo(result.sameOrderEveryJob)}`,
    `Cost: ${cost(a.costUsd)} vs ${cost(b.costUsd)}; median speed: ${seconds(a.medianSeconds)} vs ${seconds(b.medianSeconds)}`,
  ].join("\n");
}
