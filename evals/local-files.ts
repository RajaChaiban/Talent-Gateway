import type { AtsCheckId } from "@/lib/config";
import type { Band, Comparison, FileExpectation, JobId, ModelCase } from "./types";

/**
 * Tests 1 and 2 read labelled PDF and DOCX files from a local folder that is
 * never committed. A file's expectation comes from its name only:
 *
 * - `high-score-*`   ATS-ready, then strong   (rank 3)
 * - `medium-score-*` ATS-ready, then partial  (rank 2)
 * - `low-score-*`    ATS-ready, then weak     (rank 1)
 * - `fails-*`        set aside, never sent to the model. Words in the rest of
 *   the name name the checks that must fail (see FAILURE_WORDS); a name with
 *   none of them passes on any reason.
 *
 * Any other file is not part of the set.
 */

const READY_PREFIXES: ReadonlyArray<{ prefix: string; band: Band; rank: number }> = [
  { prefix: "high-score-", band: "strong", rank: 3 },
  { prefix: "medium-score-", band: "partial", rank: 2 },
  { prefix: "low-score-", band: "weak", rank: 1 },
];

const FAILS_PREFIX = "fails-";

/** The job every ready labelled file is scored against (test 2): the Applied AI Engineer. */
export const LOCAL_FILES_JOB: JobId = "ai-engineer";

/** A word in a `fails-*` name, and the check it says must fail. */
const FAILURE_WORDS: ReadonlyArray<{ word: RegExp; check: AtsCheckId }> = [
  { word: /\bno-email\b/, check: "contact_info" },
  { word: /\bno-phone\b/, check: "phone" },
  { word: /\b(?:picture|photo|headshot)\b/, check: "picture" },
  { word: /\b(?:scan|scanned|image-only|no-text)\b/, check: "readable_text" },
];

const RESUME_FILE = /\.(?:pdf|docx)$/i;

/** The expectation a labelled file's name states, or null when the file is not labelled. */
export function expectationFromFileName(file: string): FileExpectation | null {
  if (!RESUME_FILE.test(file)) return null;
  const name = file.toLowerCase().replace(/\s+/g, "-");
  for (const { prefix, band, rank } of READY_PREFIXES) {
    if (name.startsWith(prefix)) return { file, expect: "ready", band, rank };
  }
  if (!name.startsWith(FAILS_PREFIX)) return null;
  const rest = name.slice(FAILS_PREFIX.length).replace(RESUME_FILE, "");
  const checks = FAILURE_WORDS.filter(({ word }) => word.test(rest)).map(({ check }) => check);
  return { file, expect: "set_aside", checks };
}

/** The model case id of a local file. */
export function localCaseId(file: string): string {
  return `file:${file}`;
}

/**
 * The local part of the set: every labelled file's structure expectation, a
 * test 2 case for each file expected to be ready (scored against the Applied
 * AI Engineer job, LOCAL_FILES_JOB), and an order comparison for every two ready files of
 * different rank. File names are sorted so a run is repeatable.
 */
export function localSet(fileNames: readonly string[]): {
  files: FileExpectation[];
  cases: ModelCase[];
  comparisons: Comparison[];
} {
  const files = fileNames
    .toSorted()
    .map(expectationFromFileName)
    .filter((expectation) => expectation !== null);
  const ready = files.filter((expectation) => expectation.expect === "ready");
  const cases: ModelCase[] = ready.map((expectation) => ({
    id: localCaseId(expectation.file),
    test: 2,
    title: `Labelled file, expected ${expectation.band}`,
    job: LOCAL_FILES_JOB,
    resume: { kind: "local", file: expectation.file },
    band: expectation.band,
  }));
  const comparisons: Comparison[] = ready.flatMap((higher) =>
    ready
      .filter((lower) => higher.rank > lower.rank)
      .map((lower) => ({
        id: `order:${higher.file}>${lower.file}`,
        test: 2 as const,
        title: `${higher.file} above ${lower.file}`,
        higher: localCaseId(higher.file),
        lower: localCaseId(lower.file),
      })),
  );
  return { files, cases, comparisons };
}

/** Whether the ATS outcome matches the expectation: the right status and, when stated, every named check failed. */
export function structureMatches(
  expectation: FileExpectation,
  outcome: { status: "ready" | "set_aside"; failed: readonly string[] },
): boolean {
  if (expectation.expect === "ready") return outcome.status === "ready";
  if (outcome.status !== "set_aside") return false;
  const unreadable = outcome.failed.some((id) => id.startsWith("extraction:"));
  return expectation.checks.every(
    (check) => outcome.failed.includes(check) || (check === "readable_text" && unreadable),
  );
}
