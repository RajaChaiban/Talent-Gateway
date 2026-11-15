import { z } from "zod";
import type { AttemptResult } from "./analyze-queue";

/**
 * Browser calls for the Analyze panel. Every response body is checked with
 * Zod; nothing here imports server code.
 */

const statusSchema = z.enum(["scored", "ats_failed", "not_extracted", "failed"]);

const startSchema = z.object({ data: z.object({ resume_ids: z.array(z.string()) }) });
const analyzeSchema = z.object({ data: z.object({ resume_id: z.string(), status: statusSchema }) });
const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

const count = z.number().int().min(0);
/** The shape of the progress route's `data`, checked before the page uses it. */
export const progressSchema = z.object({
  total: count,
  extracted: count,
  ats_failed: count,
  scored: count,
  failed: count,
  remaining: count,
  status: z.string(),
});
/** A job's resume counts and its status, as the progress route returns them. */
export type JobProgress = z.infer<typeof progressSchema>;

/** Shown when an Analyze run could not start, or the answer could not be understood. */
export const START_FAILED_MESSAGE = "Analysis could not start. Try again in a moment.";

/** Milliseconds from a Retry-After header in seconds, or null. */
export function retryAfterMs(response: Response): number | null {
  const seconds = Number(response.headers.get("Retry-After"));
  return response.headers.has("Retry-After") && Number.isFinite(seconds) && seconds >= 0
    ? seconds * 1000
    : null;
}

async function errorMessage(response: Response): Promise<string> {
  const parsed = errorSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data.error.message : START_FAILED_MESSAGE;
}

/** The start call's answer: the ids of the resumes to analyze, or a message to show. */
export type StartResult = { ok: true; resumeIds: string[] } | { ok: false; message: string };

/** POST /api/jobs/[id]/analyze: the resumes that need work. */
export async function startJobAnalysis(jobId: string, signal: AbortSignal): Promise<StartResult> {
  try {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/analyze`, {
      method: "POST",
      signal,
    });
    if (!response.ok) return { ok: false, message: await errorMessage(response) };
    const parsed = startSchema.safeParse(await response.json());
    return parsed.success
      ? { ok: true, resumeIds: parsed.data.data.resume_ids }
      : { ok: false, message: START_FAILED_MESSAGE };
  } catch (error) {
    if (signal.aborted) throw error;
    return { ok: false, message: START_FAILED_MESSAGE };
  }
}

/** POST /api/resumes/[id]/analyze, as one queue attempt. 429 and 503 are retryable; a network failure throws (the queue retries it). */
export async function analyzeOne(resumeId: string, signal: AbortSignal): Promise<AttemptResult> {
  const response = await fetch(`/api/resumes/${encodeURIComponent(resumeId)}/analyze`, {
    method: "POST",
    signal,
  });
  if (response.status === 429 || response.status === 503) {
    return { kind: "retry", retryAfterMs: retryAfterMs(response) };
  }
  if (!response.ok) return { kind: "error" };
  const parsed = analyzeSchema.safeParse(await response.json());
  return parsed.success ? { kind: "ok", status: parsed.data.data.status } : { kind: "error" };
}

/**
 * On opening a job that is still ANALYZING (a run whose tab was closed), reads
 * progress once: the progress route settles the job when nothing remains.
 * True when the job's status changed, so the page should refresh.
 */
export async function settleUnfinishedRun(
  jobId: string,
  jobStatus: string,
  signal: AbortSignal,
  readProgress: (jobId: string, signal: AbortSignal) => Promise<JobProgress | null>,
): Promise<boolean> {
  if (jobStatus !== "ANALYZING") return false;
  const progress = await readProgress(jobId, signal);
  return progress !== null && progress.status !== "ANALYZING";
}

/** GET /api/jobs/[id]/progress; null when it could not be read. */
export async function fetchProgress(jobId: string, signal: AbortSignal): Promise<JobProgress | null> {
  try {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/progress`, {
      signal,
      cache: "no-store",
    });
    if (!response.ok) return null;
    const parsed = z.object({ data: progressSchema }).safeParse(await response.json());
    return parsed.success ? parsed.data.data : null;
  } catch {
    return null;
  }
}
