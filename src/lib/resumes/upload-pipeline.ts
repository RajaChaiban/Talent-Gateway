import { RESUME_LIMITS } from "@/lib/config";
import {
  completeResume,
  RATE_LIMITED_MESSAGE,
  signResume,
  uploadToStorage,
  type ApiFailure,
} from "./client-api";
import type { Outcome, WorkerContext } from "./upload-queue";

/** Shown when the server says a file could not be read but gives no reason. */
export const UNREADABLE_MESSAGE = "The file could not be read.";

/** What one file has already achieved, kept across retries so a retry resumes instead of starting over. */
export type UploadProgress = {
  /** Chosen by the browser, so signing the same file twice names the same row. */
  resumeId: string;
  /** The signed upload and when it was made (its token expires after two hours). */
  signed: { path: string; token: string; signedAt: number } | null;
  uploaded: boolean;
  /** True once the server answered that the file could not be read; the next attempt is an explicit retry. */
  readFailed?: boolean;
};

/** One file in the upload queue: the file, the content type to send it as, and its progress. */
export type UploadJob = { file: File; contentType: string; progress: UploadProgress };

/** Starting progress for a file about to be queued: a fresh random resume id, nothing signed and nothing uploaded. */
export function newUploadProgress(): UploadProgress {
  return { resumeId: crypto.randomUUID(), signed: null, uploaded: false };
}

/** The three calls the upload worker makes. Tests pass fakes in their place. */
export type PipelineApi = {
  sign: typeof signResume;
  upload: typeof uploadToStorage;
  complete: typeof completeResume;
};

const defaultApi: PipelineApi = {
  sign: signResume,
  upload: uploadToStorage,
  complete: completeResume,
};

/**
 * A busy server (429, 503) or a lost connection is always worth retrying. A
 * server error (500, 502, 504) is too: every step is safe to repeat (signing
 * names the same row by its resume id, the upload stores the same bytes at
 * the same path, reading judges the same file). Any other 4xx is final.
 */
export function isRetryable(failure: ApiFailure): boolean {
  const { status } = failure;
  if (status === null || status === 429 || status === 503) return true;
  return status === 500 || status === 502 || status === 504;
}

function outcomeFor(failure: ApiFailure): Outcome {
  if (!isRetryable(failure)) {
    return { kind: "failed", message: failure.message, final: failure.final === true };
  }
  return {
    kind: "retry",
    message: failure.status === 429 ? RATE_LIMITED_MESSAGE : failure.message,
    retryAfterMs: failure.retryAfterMs,
  };
}

/**
 * The worker for the upload queue: sign, upload straight to storage, then
 * complete (read the text). `onServerChange` fires after a call that changes
 * what the server holds, so the page can refresh its list.
 */
export function createUploadWorker(
  jobId: string,
  onServerChange: () => void,
  api: PipelineApi = defaultApi,
  now: () => number = Date.now,
) {
  return async function work(job: UploadJob, { report, signal }: WorkerContext): Promise<Outcome> {
    const { file, contentType, progress } = job;

    const tokenTooOld =
      progress.signed !== null &&
      now() - progress.signed.signedAt > RESUME_LIMITS.signedUploadMaxAgeMs;
    if (tokenTooOld) progress.signed = null;

    if (!progress.signed) {
      report("uploading");
      const signed = await api.sign(jobId, file, contentType, signal, progress.resumeId);
      if (!signed.ok) {
        const outcome = outcomeFor(signed);
        // A refusal of this file by the sign route (wrong type, too big, unknown job, id clash) cannot be fixed by retrying it.
        return outcome.kind === "failed" ? { ...outcome, final: true } : outcome;
      }
      progress.signed = { path: signed.data.path, token: signed.data.token, signedAt: now() };
      onServerChange();
    }

    if (!progress.uploaded) {
      report("uploading");
      const { path, token } = progress.signed;
      const sent = await api.upload(path, token, file, contentType, signal);
      if (!sent.ok) {
        // Storage refused the token (a 4xx that is not a rate limit or timeout): sign again, with the same id, for a fresh one.
        if (!isRetryable(sent) && sent.final !== true && sent.status !== null) progress.signed = null;
        return outcomeFor(sent);
      }
      progress.uploaded = true;
    }

    report("reading");
    const done = await api.complete(progress.resumeId, progress.readFailed === true, signal);
    onServerChange();
    if (!done.ok) {
      if (done.status === 409) progress.uploaded = false;
      return outcomeFor(done);
    }
    if (done.data.status === "failed") {
      progress.readFailed = true;
      return { kind: "failed", message: done.data.message ?? UNREADABLE_MESSAGE };
    }
    return { kind: "done" };
  };
}
