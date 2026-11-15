import { COMPARISON_PREFIX, slugLabel } from "./report";
import { ALL_TESTS, type TestNumber } from "./types";

/** Folder of labelled local PDF and DOCX files used when --files is not given. */
export const DEFAULT_FILES_DIR = "Resume_test/dummy";
/** Runs per stability case when --runs is not given. */
export const DEFAULT_RUNS = 3;
/** Run name used when --label is not given; it also names the report file. */
export const DEFAULT_LABEL = "run";

const VALUE_FLAGS: readonly string[] = ["--model", "--label", "--runs", "--files", "--only"];

/** The parsed command line of `npm run eval`, with defaults filled in. */
export type EvalArgs = {
  /** A gateway model slug for this run; null uses AI_MODELS.scoring. */
  model: string | null;
  label: string;
  runs: number;
  /** The folder of labelled local files, relative to the repository root or absolute. */
  filesDir: string;
  /** The tests to run, in order; null runs all eight. */
  only: TestNumber[] | null;
  help: boolean;
};

/** The help text printed for --help and after an argument error. */
export const USAGE = `Usage: npm run eval -- [--label <text>] [--model <provider/model>] [--runs <n>] [--files <dir>] [--only <n[,n...]>]

  --label <text>    names the run and its report file (default "${DEFAULT_LABEL}"), e.g. baseline
  --model <slug>    a gateway model for this run instead of AI_MODELS.scoring
  --runs <n>        runs per stability case, 1 to 10 (default ${DEFAULT_RUNS})
  --files <dir>     folder of labelled local PDF and DOCX files (default ${DEFAULT_FILES_DIR})
  --only <n,...>    run only these tests, 1 to 8 (e.g. --only 8); the others are reported as skipped`;

function parseOnly(value: string): TestNumber[] {
  const parts = value.split(",").map((part) => part.trim());
  const tests = ALL_TESTS.filter((test) => parts.includes(String(test)));
  if (parts.some((part) => !ALL_TESTS.some((test) => String(test) === part))) {
    throw new Error(`--only takes test numbers from 1 to 8 separated by commas, got "${value}"`);
  }
  return tests;
}

/** Parses the runner's arguments; throws an Error naming the bad argument. */
export function parseArgs(argv: readonly string[]): EvalArgs {
  const args: EvalArgs = {
    model: null,
    label: DEFAULT_LABEL,
    runs: DEFAULT_RUNS,
    filesDir: DEFAULT_FILES_DIR,
    only: null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") {
      args.help = true;
      continue;
    }
    if (!VALUE_FLAGS.includes(flag)) throw new Error(`Unknown argument ${flag}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value`);
    index += 1;
    if (flag === "--model") {
      // A gateway slug is `provider/model`; the model part may carry a colon, for example a version tag.
      if (!/^[\w.-]+\/[\w.:-]+$/.test(value)) throw new Error(`--model must be a provider/model slug, got "${value}"`);
      args.model = value;
    } else if (flag === "--label") {
      if (value.trim().length === 0) throw new Error("--label must not be empty");
      if (slugLabel(value).startsWith(COMPARISON_PREFIX)) {
        throw new Error(`--label must not start with "${COMPARISON_PREFIX}": that name is kept for comparison reports`);
      }
      args.label = value.trim();
    } else if (flag === "--runs") {
      const runs = Number(value);
      if (!Number.isInteger(runs) || runs < 1 || runs > 10) throw new Error(`--runs must be a whole number from 1 to 10, got "${value}"`);
      args.runs = runs;
    } else if (flag === "--only") {
      args.only = parseOnly(value);
    } else {
      args.filesDir = value;
    }
  }
  return args;
}
