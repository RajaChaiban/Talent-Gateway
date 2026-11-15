import { BANDS, type Band, type EvalSet, type ModelCase, type TestNumber } from "./types";

/**
 * `--only`: which cases a run scores when only some tests run. A case is
 * scored when its own test runs; a stability case also when test 5 runs
 * (stability is a test 5 measure over cases of tests 3 and 5); and a case
 * that test 7 places under the bars also when test 7 runs.
 */

/**
 * The band test 7 holds a case to: its stated band, or for a case with a range
 * (test 8), strong when the whole range is in the strong band and weak when it
 * is all in the weak band; null otherwise.
 */
export function barBand(modelCase: ModelCase): Band | null {
  if (modelCase.band) return modelCase.band;
  const range = modelCase.range;
  if (!range) return null;
  const within = (band: Band) => range.min >= BANDS[band].min && range.max <= BANDS[band].max;
  if (within("strong")) return "strong";
  return within("weak") ? "weak" : null;
}

/** Whether a case is sent to the model for the chosen tests: its own test, test 5 when it is a stability case, or test 7 when it states a band. */
export function caseRuns(modelCase: ModelCase, tests: readonly TestNumber[]): boolean {
  return (
    tests.includes(modelCase.test) ||
    (tests.includes(5) && modelCase.stability === true) ||
    (tests.includes(7) && barBand(modelCase) !== null)
  );
}

/** The part of the set the listed tests use: its cases, the comparisons of those tests, and the local files when test 1 runs. */
export function selectSet(set: EvalSet, tests: readonly TestNumber[]): EvalSet {
  const cases = set.cases.filter((modelCase) => caseRuns(modelCase, tests));
  const ids = new Set(cases.map((modelCase) => modelCase.id));
  return {
    cases,
    comparisons: set.comparisons.filter(
      (comparison) => tests.includes(comparison.test) && ids.has(comparison.higher) && ids.has(comparison.lower),
    ),
    files: tests.includes(1) ? set.files : [],
  };
}

/** "all eight (1 to 8)", or "8 (--only 8)". */
export function testsText(tests: readonly TestNumber[], only: boolean): string {
  return only ? `${tests.join(", ")} (--only ${tests.join(",")})` : "all eight (1 to 8)";
}
