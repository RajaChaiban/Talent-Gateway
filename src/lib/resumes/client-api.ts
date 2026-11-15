import { z } from "zod";
import { RESUME_LIMITS } from "@/lib/config";
import { RESUME_BUCKET } from "./bucket";
import { SIZE_REJECTED, TYPE_REFUSED_BY_STORAGE } from "./messages";

/** Shown when no response arrived at all (the status is null). */
export const NETWORK_MESSAGE = "Could not reach the server. Check your connection and retry.";
/** Shown when a file did not reach storage and no clearer cause is known: a lost connection, a timeout or a server error. */
export const UPLOAD_FAILED_MESSAGE = "The upload did not finish. Check your connection and retry.";
const STORAGE_DECLINED_MESSAGE = "Storage did not accept the upload. Try the file again.";
const GENERIC_MESSAGE = "Something went wrong. Try again in a moment.";

/** Shown for an item that is waiting to retry after a 429. */
export const RATE_LIMITED_MESSAGE = "Too many requests, try again";

/** `status` is null when no response arrived at all (a network error). */
export type ApiFailure = {
  ok: false;
  message: string;
  status: number | null;
  retryAfterMs?: number;
  /** The `code` of the route's error body, when there was one. */
  code?: string;
  /** A refusal that trying again cannot fix. */
  final?: boolean;
};
/** What every browser call to the resume routes and storage returns: the parsed `data`, or an `ApiFailure`. Errors are returned, not thrown. */
export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

/** The `Retry-After` header in seconds, as milliseconds. A date form is ignored. */
export function retryAfterMs(header: string | null): number | undefined {
  if (header === null || !/^\d+$/.test(header.trim())) return undefined;
  return Number(header.trim()) * 1000;
}

const errorBody = z.object({
  error: z.object({ message: z.string(), code: z.string().optional() }),
});

/** The caller's signal (the queue stopping) combined with a per-request timeout. */
function withTimeout(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function call<T>(
  url: string,
  init: RequestInit,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: withTimeout(RESUME_LIMITS.requestTimeoutMs.api, signal),
    });
  } catch {
    return { ok: false, message: NETWORK_MESSAGE, status: null };
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorBody.safeParse(body);
    return {
      ok: false,
      message: parsed.success ? parsed.data.error.message : GENERIC_MESSAGE,
      status: response.status,
      retryAfterMs: retryAfterMs(response.headers.get("retry-after")),
      code: parsed.success ? parsed.data.error.code : undefined,
    };
  }
  const parsed = z.object({ data: schema }).safeParse(body);
  return parsed.success
    ? { ok: true, data: parsed.data.data }
    : { ok: false, message: GENERIC_MESSAGE, status: response.status };
}

const signed = z.object({ resume_id: z.string(), path: z.string(), token: z.string() });
const completed = z.object({
  resume_id: z.string(),
  status: z.enum(["extracted", "failed"]),
  characters: z.number(),
  message: z.string().optional(),
});
const removed = z.object({ removed: z.literal(true) });

const JSON_HEADERS = { "content-type": "application/json" };

/**
 * `resumeId` is chosen by the browser so that signing the same file again
 * (a lost response, a retry) names the same row instead of making a second one.
 */
export function signResume(
  jobId: string,
  file: { name: string; size: number },
  contentType: string,
  signal?: AbortSignal,
  resumeId?: string,
) {
  return call(
    "/api/resumes/sign",
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        ...(resumeId ? { resume_id: resumeId } : {}),
        job_id: jobId,
        file_name: file.name,
        content_type: contentType,
        size: file.size,
      }),
    },
    signed,
    signal,
  );
}

/** `retry` asks the server to judge a file it already marked failed once more. */
export function completeResume(resumeId: string, retry = false, signal?: AbortSignal) {
  return call(
    `/api/resumes/${resumeId}/complete${retry ? "?retry=1" : ""}`,
    { method: "POST" },
    completed,
    signal,
  );
}

/** Removes a resume and its stored file through `DELETE /api/resumes/[id]`. */
export function deleteResume(resumeId: string) {
  return call(`/api/resumes/${resumeId}`, { method: "DELETE" }, removed);
}

/** Storage answers a second upload to the same path with "already exists" (409, or 400 with statusCode 409). */
function alreadyExists(error: { message: string; status?: number; statusCode?: string }): boolean {
  return error.status === 409 || error.statusCode === "409" || /already exists/i.test(error.message);
}

/** The code storage reports in the body (`statusCode`), falling back to the HTTP status. */
function storageCode(error: { status?: number; statusCode?: string }): string | undefined {
  return error.statusCode ?? (error.status === undefined ? undefined : String(error.status));
}

/**
 * Sends the file straight to private storage with the signed upload token.
 *
 * The body is given an explicit type: the storage client ignores its
 * `contentType` option for a File or Blob and sends the part with the file's
 * own type, which is empty for some Word files and would be refused by the
 * bucket as application/octet-stream.
 *
 * An "already exists" answer counts as uploaded: the path holds this file's
 * own resume id, so it means an earlier attempt landed and only its response
 * was lost, and `complete` checks the stored bytes anyway. A 415 or 413 from
 * storage is a final refusal with its own message. The storage client cannot
 * cancel a request, so on timeout or abort the upload is given up on here and
 * left to finish or fail on its own.
 */
export async function uploadToStorage(
  path: string,
  token: string,
  file: File,
  contentType: string,
  signal?: AbortSignal,
): Promise<ApiResult<null>> {
  const lost: ApiResult<null> = { ok: false, message: UPLOAD_FAILED_MESSAGE, status: null };
  const limit = withTimeout(RESUME_LIMITS.requestTimeoutMs.upload, signal);
  if (limit.aborted) return lost;

  const gaveUp = new Promise<ApiResult<null>>((resolve) => {
    limit.addEventListener("abort", () => resolve(lost), { once: true });
  });
  const sending = (async (): Promise<ApiResult<null>> => {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const body = new File([file], file.name, { type: contentType });
      const { error } = await createClient()
        .storage.from(RESUME_BUCKET)
        .uploadToSignedUrl(path, token, body, { contentType });
      if (!error || alreadyExists(error)) return { ok: true, data: null };

      const code = storageCode(error);
      if (code === "415") {
        return { ok: false, message: TYPE_REFUSED_BY_STORAGE, status: 415, final: true };
      }
      if (code === "413") {
        return { ok: false, message: SIZE_REJECTED, status: 413, final: true };
      }
      return {
        ok: false,
        message: typeof error.status === "number" && error.status >= 400 && error.status < 500
          ? STORAGE_DECLINED_MESSAGE
          : UPLOAD_FAILED_MESSAGE,
        status: typeof error.status === "number" ? error.status : null,
      };
    } catch {
      return lost;
    }
  })();
  return Promise.race([sending, gaveUp]);
}
