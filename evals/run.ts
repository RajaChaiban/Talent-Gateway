import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { checkAts } from "@/lib/ats/check-ats";
import { AI_MODELS } from "@/lib/config";
import { ExtractionError, extractText } from "@/lib/resumes/extract-text";
import { kindOfFileName } from "@/lib/resumes/files";
import { fileFacts } from "@/lib/screening/file-facts";
import { parseArgs, USAGE, type EvalArgs } from "./args";
import { WRITTEN_CASES, WRITTEN_COMPARISONS } from "./cases";
import { grade } from "./grade";
import { JOB_TYPE_CASES, JOB_TYPE_COMPARISONS, jobTypeFiltering } from "./job-types";
import { localSet } from "./local-files";
import {
  gatewayPrice,
  isInvalidOutput,
  promptVersion,
  rateLimitWait,
  routeScoringTo,
  scoreOnce,
  usingStandIn,
} from "./model-call";
import { runPool, withRetry } from "./pool";
import {
  consoleSummary,
  localDate,
  renderReport,
  reportFileName,
  reportFiles,
  updateReadme,
  type RunMeta,
} from "./report";
import { scoresFile, scoresFileName } from "./scores-file";
import { selectSet } from "./select";
import { ALL_TESTS, type CallOutcome, type EvalSet, type JobId, type ModelCase, type StructureOutcome } from "./types";

/** Model calls in flight at once. */
const CONCURRENCY = 3;
/** Attempts per call when the gateway rate-limits it. */
const RATE_LIMIT_ATTEMPTS = 4;
const RATE_LIMIT_BASE_MS = 2_000;
const ERROR_MAX_CHARS = 160;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Reads `.env.local` (git-ignored) for the gateway token when it exists; variables already set win. Nothing is printed. */
function loadLocalEnv(root: string): void {
  const file = path.join(root, ".env.local");
  if (existsSync(file)) process.loadEnvFile(file);
}

function hasGatewayCredentials(): boolean {
  return Boolean(process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY);
}

/** A short error line. For a local file only the error's name, so nothing from the resume can reach the report. */
function errorSummary(error: unknown, local: boolean): string {
  const name = error instanceof Error ? error.name : "Error";
  if (local || !(error instanceof Error)) return name;
  const message = error.message.replace(/\s+/g, " ").trim();
  return `${name}: ${message.length > ERROR_MAX_CHARS ? `${message.slice(0, ERROR_MAX_CHARS)}...` : message}`;
}

/** Test 1 for one file: the real extraction, then the real ATS check. */
async function checkFile(dir: string, file: string): Promise<{ outcome: StructureOutcome; text: string | null }> {
  const bytes = new Uint8Array(readFileSync(path.join(dir, file)));
  const kind = kindOfFileName(file);
  if (!kind) return { outcome: { file, status: "set_aside", failed: ["file"] }, text: null };
  try {
    const { text, imageCount } = await extractText(bytes, kind);
    const ats = checkAts({ text, imageCount, ...fileFacts(file), sizeBytes: bytes.byteLength });
    const failed = ats.checks.filter((check) => !check.passed).map((check) => check.id);
    return ats.status === "ATS_READY"
      ? { outcome: { file, status: "ready", failed }, text }
      : { outcome: { file, status: "set_aside", failed }, text: null };
  } catch (error) {
    if (!(error instanceof ExtractionError)) throw error;
    return { outcome: { file, status: "set_aside", failed: [`extraction:${error.failure}`] }, text: null };
  }
}

function listLocalFiles(dir: string): string[] | null {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
}

type Task = { modelCase: ModelCase; run: number; job: string; text: string };

async function callOnce(task: Task): Promise<CallOutcome> {
  const base = { caseId: task.modelCase.id, run: task.run };
  const local = task.modelCase.resume.kind === "local";
  let started = performance.now();
  const elapsed = () => Math.round((performance.now() - started) / 10) / 100;
  try {
    const result = await withRetry(
      () => {
        started = performance.now();
        return scoreOnce(task.job, task.text);
      },
      { attempts: RATE_LIMIT_ATTEMPTS, retryAfter: rateLimitWait, baseMs: RATE_LIMIT_BASE_MS, sleep },
    );
    // A local file's must-have texts are the model's reading of a real resume: keep only their statuses.
    const breakdown = local
      ? { ...result.breakdown, mustHaves: result.breakdown.mustHaves.map((item) => ({ requirement: null, status: item.status })) }
      : result.breakdown;
    return { ...base, ok: true, ...result, breakdown, seconds: elapsed() };
  } catch (error) {
    return {
      ...base,
      ok: false,
      error: errorSummary(error, local),
      invalidOutput: isInvalidOutput(error),
      seconds: elapsed(),
      inputTokens: null,
      outputTokens: null,
    };
  }
}

/** Writes the report and its scores file next to it, and updates the README list. */
function writeReport(root: string, meta: RunMeta, text: string, scores: string): string {
  const dir = path.join(root, "docs", "evals");
  mkdirSync(dir, { recursive: true });
  const name = reportFileName(meta.date, meta.label, readdirSync(dir));
  writeFileSync(path.join(dir, name), text);
  writeFileSync(path.join(dir, scoresFileName(name)), scores);
  const readmePath = path.join(dir, "README.md");
  writeFileSync(readmePath, updateReadme(readFileSync(readmePath, "utf8"), reportFiles(readdirSync(dir))));
  return `${path.posix.join("docs/evals", name)} (scores: ${scoresFileName(name)})`;
}

async function run(args: EvalArgs, root: string): Promise<number> {
  loadLocalEnv(root);
  const standIn = usingStandIn();
  if (!standIn && !hasGatewayCredentials()) {
    console.error(
      "No AI Gateway credentials. Run `vercel env pull .env.local` (VERCEL_OIDC_TOKEN) or set AI_GATEWAY_API_KEY, then try again.",
    );
    return 2;
  }
  const slug = args.model ?? AI_MODELS.scoring;
  if (args.model && !standIn) routeScoringTo(args.model);

  const evalsDir = path.join(root, "evals");
  const readJob = (id: JobId) => readFileSync(path.join(evalsDir, "jobs", `${id}.txt`), "utf8");
  const jobs: Record<JobId, string> = {
    "software-engineer": readJob("software-engineer"),
    "software-engineer-flexible": readJob("software-engineer-flexible"),
    "finance-manager": readJob("finance-manager"),
    "ai-engineer": readJob("ai-engineer"),
    "registered-nurse": readJob("registered-nurse"),
    "marketing-manager": readJob("marketing-manager"),
    "account-executive": readJob("account-executive"),
  };

  const tests = args.only ?? ALL_TESTS;
  // The local files serve test 1, test 2 and the bars of test 7 only.
  const readsLocal = tests.some((test) => test === 1 || test === 2 || test === 7);
  const filesDir = path.resolve(root, args.filesDir);
  const localNames = readsLocal ? listLocalFiles(filesDir) : null;
  const local = localSet(localNames ?? []);
  const written = [...WRITTEN_CASES, ...JOB_TYPE_CASES];
  const set: EvalSet = selectSet(
    {
      cases: [...written, ...local.cases],
      comparisons: [...WRITTEN_COMPARISONS, ...JOB_TYPE_COMPARISONS, ...local.comparisons],
      files: local.files,
    },
    tests,
  );

  const texts = new Map<string, string>();
  const notSent: Record<string, string> = {};
  let structure: StructureOutcome[] | null = null;
  if (localNames !== null) {
    const checked = await Promise.all(local.files.map((expectation) => checkFile(filesDir, expectation.file)));
    structure = checked.map((item) => item.outcome);
    for (const modelCase of local.cases) {
      const file = modelCase.resume.file;
      const text = checked.find((item) => item.outcome.file === file)?.text ?? null;
      if (text === null) notSent[modelCase.id] = "set aside by the ATS check, not sent";
      else texts.set(modelCase.id, text);
    }
  }
  for (const modelCase of written) {
    texts.set(modelCase.id, readFileSync(path.join(evalsDir, "resumes", modelCase.resume.file), "utf8"));
  }
  const filtering = tests.includes(8) ? jobTypeFiltering(texts) : null;

  const tasks: Task[] = set.cases.flatMap((modelCase) => {
    const text = texts.get(modelCase.id);
    if (text === undefined) return [];
    return Array.from({ length: modelCase.stability ? args.runs : 1 }, (_, run) => ({
      modelCase,
      run,
      job: jobs[modelCase.job],
      text,
    }));
  });

  const model = standIn ? "stand-in model (E2E_FAKE_MODEL=1), no gateway call" : slug;
  const localNote = !readsLocal
    ? "skipped: --only left out tests 1, 2 and 7"
    : localNames === null
      ? `skipped: ${args.filesDir} not found`
      : `${args.filesDir} (${local.files.length} labelled files)`;
  console.log(`Scoring ${tasks.length} calls on ${model}, ${CONCURRENCY} at a time. Local files: ${localNote}.`);

  const calls = await runPool(tasks, CONCURRENCY, callOnce);
  const price = standIn ? null : await gatewayPrice(slug);
  const result = grade({ set, calls, structure, notSent, runs: args.runs, price, tests, filtering });

  const meta: RunMeta = {
    date: localDate(new Date()),
    label: args.label,
    model,
    standIn,
    promptVersion: promptVersion(),
    runs: args.runs,
    localFiles: localNote,
    tests,
    only: args.only !== null,
  };
  console.log(`\n${consoleSummary(meta, result)}`);
  const scores = `${JSON.stringify(scoresFile(meta, result), null, 2)}\n`;
  console.log(`\nReport: ${writeReport(root, meta, renderReport(meta, result), scores)}`);
  return result.passed ? 0 : 1;
}

/**
 * `npm run eval`: scores the evaluation set with the real scoring call and
 * writes a dated report under docs/evals/. Returns the exit code: 0 when every
 * pass mark is met, 1 when one is missed, 2 for a usage or setup error.
 */
export async function main(argv: readonly string[], root: string): Promise<number> {
  let args: EvalArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
    return 2;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  return run(args, root);
}
