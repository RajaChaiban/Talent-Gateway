import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { compareRuns, comparisonFileName, comparisonSummary, renderComparison } from "./compare";
import { comparisonFiles, localDate, updateReadmeComparisons } from "./report";
import { parseScoresFile, type ScoresFile } from "./scores-file";

/** The help text printed when `eval:compare` is called with the wrong arguments. */
export const COMPARE_USAGE = `Usage: npm run eval:compare -- <a.json> <b.json>

  Compares two runs' scores files (written next to each report under docs/evals/)
  and writes docs/evals/<yyyy-mm-dd>-compare-<labelA>-vs-<labelB>.md.`;

/**
 * `npm run eval:compare`: no model call. Returns the exit code: 0 when the
 * comparison was written, 2 for a usage error or a file that is not a scores file.
 */
export async function main(argv: readonly string[], root: string): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(COMPARE_USAGE);
    return 0;
  }
  if (argv.length !== 2 || argv.some((file) => !file.endsWith(".json"))) {
    console.error(`Give two scores files.\n\n${COMPARE_USAGE}`);
    return 2;
  }
  let files: ScoresFile[];
  try {
    files = argv.map((file) => parseScoresFile(readFileSync(path.resolve(root, file), "utf8"), file));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  const [a, b] = files;
  const result = compareRuns(a, b);
  const date = localDate(new Date());
  const dir = path.join(root, "docs", "evals");
  mkdirSync(dir, { recursive: true });
  const existing = readdirSync(dir);
  const name = comparisonFileName(date, a, b, existing);
  const readmePath = path.join(dir, "README.md");
  // Built before anything is written, so a README without its markers leaves no stray comparison file.
  const readme = updateReadmeComparisons(readFileSync(readmePath, "utf8"), comparisonFiles([...existing, name]));
  writeFileSync(path.join(dir, name), renderComparison(date, a, b, result));
  writeFileSync(readmePath, readme);
  console.log(`${comparisonSummary(a, b, result)}\n\nComparison: ${path.posix.join("docs/evals", name)}`);
  return 0;
}
