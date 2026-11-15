import { checkAts } from "@/lib/ats/check-ats";
import type { AtsCheckId } from "@/lib/config";
import type { Comparison, FilteringOutcome, JobId, ModelCase, ResumeKind, ScoreRange } from "./types";

/**
 * Test 8, job types: five kinds of job, five resumes each. For each job a
 * strong, a mid and a vague resume whose most recent position is the job's
 * role, a related role that does part of the same hands-on work, and an
 * unrelated role (another job's strong resume). Resumes live under
 * evals/resumes/job-types/<job>/; the software engineer and finance manager
 * strong resumes of test 3 are reused, as are other jobs' strong resumes for
 * the unrelated case.
 */

export const JOB_TYPE_JOBS: ReadonlyArray<{ job: JobId; short: string; name: string }> = [
  { job: "software-engineer", short: "swe", name: "Software Engineer" },
  { job: "finance-manager", short: "finance", name: "Finance Manager" },
  { job: "registered-nurse", short: "nurse", name: "Registered Nurse" },
  { job: "marketing-manager", short: "marketing", name: "Digital Marketing Manager" },
  { job: "account-executive", short: "sales", name: "Account Executive" },
];

export const RESUME_KINDS: readonly ResumeKind[] = ["strong", "mid", "vague", "related", "unrelated"];

/** The expected score range per kind, in stored tenths. */
export const KIND_RANGES: Readonly<Record<ResumeKind, ScoreRange>> = {
  strong: { min: 80, max: 100 },
  mid: { min: 50, max: 84 },
  vague: { min: 50, max: 79 },
  related: { min: 25, max: 69 },
  unrelated: { min: 0, max: 30 },
};

const KIND_TITLES: Readonly<Record<ResumeKind, string>> = {
  strong: "same role, every must-have shown with specific, quantified work",
  mid: "same role, about half the must-haves shown, the rest absent",
  vague: "same role and career as strong, in vague claims, must-haves only in the skills list",
  related: "a related role doing part of the same hands-on work",
  unrelated: "a solid resume for a role with none of the job's hands-on work",
};

const own = (job: JobId, kind: ResumeKind) => `job-types/${job}/${kind}.txt`;

/** Resume files reused from elsewhere in the set, by job and kind. Every other one is `job-types/<job>/<kind>.txt`. */
const REUSED: Partial<Record<JobId, Partial<Record<ResumeKind, string>>>> = {
  "software-engineer": { strong: "software-engineer-strong.txt", unrelated: own("registered-nurse", "strong") },
  "finance-manager": { strong: "finance-manager-strong.txt", unrelated: "software-engineer-strong.txt" },
  "registered-nurse": { unrelated: own("account-executive", "strong") },
  "marketing-manager": { unrelated: "finance-manager-strong.txt" },
  "account-executive": { unrelated: own("registered-nurse", "strong") },
};

/** The resume file of one job's resume of one kind, relative to evals/resumes/. */
export function jobTypeFile(job: JobId, kind: ResumeKind): string {
  return REUSED[job]?.[kind] ?? own(job, kind);
}

export function jobTypeCaseId(short: string, kind: ResumeKind): string {
  return `jt-${short}-${kind}`;
}

export const JOB_TYPE_CASES: readonly ModelCase[] = JOB_TYPE_JOBS.flatMap(({ job, short, name }) =>
  RESUME_KINDS.map(
    (kind): ModelCase => ({
      id: jobTypeCaseId(short, kind),
      test: 8,
      title: `${name} job: ${KIND_TITLES[kind]}`,
      job,
      resume: { kind: "written", file: jobTypeFile(job, kind) },
      range: KIND_RANGES[kind],
      resumeKind: kind,
      ...(kind === "strong" || kind === "mid" || kind === "vague" ? { sameRole: true } : {}),
    }),
  ),
);

/** Strong above vague by 1.0 or more, in stored tenths. */
export const STRONG_OVER_VAGUE_MARGIN = 10;

/** The order within each job: strong > mid, strong > vague by 1.0 or more, mid > related, related > unrelated. */
export const JOB_TYPE_COMPARISONS: readonly Comparison[] = JOB_TYPE_JOBS.flatMap(({ short, name }) => {
  const id = (kind: ResumeKind) => jobTypeCaseId(short, kind);
  const pair = (higher: ResumeKind, lower: ResumeKind): Comparison => ({
    id: `jt-${short}-${higher}-over-${lower}`,
    test: 8,
    title: `${name} job: ${higher} above ${lower}`,
    higher: id(higher),
    lower: id(lower),
  });
  return [
    pair("strong", "mid"),
    { ...pair("strong", "vague"), margin: { min: STRONG_OVER_VAGUE_MARGIN, measure: "job_types" } },
    pair("mid", "related"),
    pair("related", "unrelated"),
  ];
});

/** The resume the four synthetic negatives of the filtering measure are built from. */
export const NEGATIVE_SOURCE = jobTypeCaseId("nurse", "strong");

const EMAIL = /[\w.%+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE = /\(?\d{3}\)?[ .-]?\d{3}[ .-]\d{4}/g;

/** The four negatives: each must be set aside on exactly these checks. */
const NEGATIVES: ReadonlyArray<{
  id: string;
  expected: readonly AtsCheckId[];
  text: (text: string) => string;
  imageCount: number;
}> = [
  { id: "negative:no-email", expected: ["contact_info"], text: (text) => text.replace(EMAIL, ""), imageCount: 0 },
  { id: "negative:no-phone", expected: ["phone"], text: (text) => text.replace(PHONE, ""), imageCount: 0 },
  {
    id: "negative:no-email-no-phone",
    expected: ["contact_info", "phone"],
    text: (text) => text.replace(EMAIL, "").replace(PHONE, ""),
    imageCount: 0,
  },
  { id: "negative:picture", expected: ["picture"], text: (text) => text, imageCount: 1 },
];

function checkText(id: string, text: string, imageCount: number, expected: readonly AtsCheckId[]): FilteringOutcome {
  const result = checkAts({
    text,
    contentType: "application/pdf",
    sizeBytes: new TextEncoder().encode(text).byteLength,
    imageCount,
  });
  const failed = result.checks.filter((check) => !check.passed).map((check) => check.id);
  const status = result.status === "ATS_READY" ? "ready" : "set_aside";
  const sameChecks = failed.length === expected.length && expected.every((check) => failed.includes(check));
  return {
    id,
    expected,
    status,
    failed,
    ok: expected.length === 0 ? status === "ready" : status === "set_aside" && sameChecks,
  };
}

/**
 * The filtering measure of test 8, with no model: every test 8 resume text
 * through the real `checkAts` as a small PDF with no picture must be
 * ATS_READY, and the four negatives built from NEGATIVE_SOURCE (email removed,
 * phone removed, both, one picture) must each be set aside on exactly the
 * expected check. `texts` maps case ids to resume texts; a missing text fails.
 */
export function jobTypeFiltering(texts: ReadonlyMap<string, string>): FilteringOutcome[] {
  const resumes = JOB_TYPE_CASES.map((item) => {
    const text = texts.get(item.id);
    return text === undefined
      ? { id: item.id, expected: [], status: "set_aside" as const, failed: ["missing text"], ok: false }
      : checkText(item.id, text, 0, []);
  });
  const source = texts.get(NEGATIVE_SOURCE);
  const negatives = NEGATIVES.map((negative) =>
    source === undefined
      ? { id: negative.id, expected: negative.expected, status: "set_aside" as const, failed: ["missing text"], ok: false }
      : checkText(negative.id, negative.text(source), negative.imageCount, negative.expected),
  );
  return [...resumes, ...negatives];
}
