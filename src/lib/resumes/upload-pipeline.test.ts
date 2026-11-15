import { describe, expect, it, vi } from "vitest";
import { RESUME_LIMITS } from "@/lib/config";
import type { ApiFailure } from "./client-api";
import {
  createUploadWorker,
  isRetryable,
  newUploadProgress,
  type PipelineApi,
  type UploadJob,
} from "./upload-pipeline";

const file = new File([new Uint8Array([1, 2, 3])], "cv.pdf", { type: "application/pdf" });
const job = (): UploadJob => ({
  file,
  contentType: "application/pdf",
  progress: newUploadProgress(),
});
const context = { report: vi.fn(), signal: new AbortController().signal };

const signed = (resumeId = "r1") => ({
  ok: true as const,
  data: { resume_id: resumeId, path: `j/${resumeId}/cv.pdf`, token: "t" },
});
const sent = { ok: true as const, data: null };
const read = (status: "extracted" | "failed", message?: string) => ({
  ok: true as const,
  data: { resume_id: "r1", status, characters: 3, message },
});
const failure = (status: number | null, extra: Partial<ApiFailure> = {}): ApiFailure => ({
  ok: false,
  message: "nope",
  status,
  ...extra,
});

function api(over: Partial<PipelineApi> = {}): PipelineApi {
  return {
    sign: vi.fn(async () => signed()),
    upload: vi.fn(async () => sent),
    complete: vi.fn(async () => read("extracted")),
    ...over,
  };
}

describe("isRetryable", () => {
  it("retries a busy server, a lost connection and a server error", () => {
    for (const status of [null, 429, 503, 500, 502, 504]) {
      expect(isRetryable(failure(status))).toBe(true);
    }
  });

  it("never retries another 4xx", () => {
    for (const status of [400, 401, 404, 409, 413, 415]) {
      expect(isRetryable(failure(status))).toBe(false);
    }
  });
});

describe("createUploadWorker", () => {
  it("signs with the browser's resume id, uploads and completes", async () => {
    const calls = api();
    const item = job();
    const outcome = await createUploadWorker("job", vi.fn(), calls)(item, context);
    expect(outcome).toEqual({ kind: "done" });
    expect(calls.sign).toHaveBeenCalledWith("job", file, "application/pdf", context.signal, item.progress.resumeId);
    expect(calls.upload).toHaveBeenCalledWith("j/r1/cv.pdf", "t", file, "application/pdf", context.signal);
    expect(calls.complete).toHaveBeenCalledWith(item.progress.resumeId, false, context.signal);
  });

  it("turns a 429 into a retry with the rate-limit message and Retry-After, and resumes where it stopped", async () => {
    const calls = api({
      upload: vi
        .fn()
        .mockResolvedValueOnce(failure(429, { retryAfterMs: 2000 }))
        .mockResolvedValueOnce(sent),
    });
    const work = createUploadWorker("job", vi.fn(), calls);
    const item = job();

    expect(await work(item, context)).toMatchObject({
      kind: "retry",
      message: "Too many requests, try again",
      retryAfterMs: 2000,
    });
    expect(await work(item, context)).toEqual({ kind: "done" });
    expect(calls.sign).toHaveBeenCalledTimes(1);
    expect(calls.upload).toHaveBeenCalledTimes(2);
  });

  it("keeps the server's own message when storage stayed busy, not 'Too many requests'", async () => {
    const busy = failure(503, { message: "File storage is busy. Try again in a moment.", code: "storage_unavailable" });
    const calls = api({ complete: vi.fn(async () => busy) });
    expect(await createUploadWorker("job", vi.fn(), calls)(job(), context)).toMatchObject({
      kind: "retry",
      message: "File storage is busy. Try again in a moment.",
    });
  });

  it("makes a refusal from sign final, so no Retry is offered", async () => {
    const calls = api({ sign: vi.fn(async () => failure(415)) });
    expect(await createUploadWorker("job", vi.fn(), calls)(job(), context)).toEqual({
      kind: "failed",
      message: "nope",
      final: true,
    });
  });

  it("retries a 500 from sign, complete and the upload, since every step is safe to repeat", async () => {
    for (const over of [
      { sign: vi.fn(async () => failure(500)) },
      { upload: vi.fn(async () => failure(502)) },
      { complete: vi.fn(async () => failure(500)) },
    ]) {
      expect(await createUploadWorker("job", vi.fn(), api(over))(job(), context)).toMatchObject({
        kind: "retry",
      });
    }
  });

  it("reports a final refusal from storage as final", async () => {
    const calls = api({
      upload: vi.fn(async () => failure(415, { message: "This file type was refused by storage.", final: true })),
    });
    expect(await createUploadWorker("job", vi.fn(), calls)(job(), context)).toEqual({
      kind: "failed",
      message: "This file type was refused by storage.",
      final: true,
    });
  });

  it("signs again, with the same id, after storage refuses the token", async () => {
    const calls = api({
      upload: vi.fn().mockResolvedValueOnce(failure(403)).mockResolvedValueOnce(sent),
    });
    const work = createUploadWorker("job", vi.fn(), calls);
    const item = job();

    expect(await work(item, context)).toMatchObject({ kind: "failed", final: false });
    expect(await work(item, context)).toEqual({ kind: "done" });

    expect(calls.sign).toHaveBeenCalledTimes(2);
    const ids = vi.mocked(calls.sign).mock.calls.map((call) => call[4]);
    expect(ids[0]).toBe(ids[1]);
  });

  it("signs again before retrying the upload when the token is older than the safe margin", async () => {
    let clock = 1_000_000;
    const calls = api({
      upload: vi.fn().mockResolvedValueOnce(failure(null)).mockResolvedValueOnce(sent),
    });
    const work = createUploadWorker("job", vi.fn(), calls, () => clock);
    const item = job();

    expect(await work(item, context)).toMatchObject({ kind: "retry" });
    clock += RESUME_LIMITS.signedUploadMaxAgeMs - 1;
    expect(item.progress.signed).not.toBeNull();
    expect(await createUploadWorker("job", vi.fn(), calls, () => clock)(item, context)).toEqual({ kind: "done" });
    expect(calls.sign).toHaveBeenCalledTimes(1);

    const stale = job();
    const retryCalls = api({
      upload: vi.fn().mockResolvedValueOnce(failure(null)).mockResolvedValueOnce(sent),
    });
    const retryWork = (now: () => number) => createUploadWorker("job", vi.fn(), retryCalls, now);
    await retryWork(() => clock)(stale, context);
    clock += RESUME_LIMITS.signedUploadMaxAgeMs + 1;
    await retryWork(() => clock)(stale, context);
    expect(retryCalls.sign).toHaveBeenCalledTimes(2);
  });

  it("asks for an explicit retry only after the server said the file could not be read", async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce(read("failed", "The file could not be read."))
      .mockResolvedValueOnce(read("extracted"));
    const work = createUploadWorker("job", vi.fn(), api({ complete }));
    const item = job();

    expect(await work(item, context)).toEqual({
      kind: "failed",
      message: "The file could not be read.",
    });
    expect(await work(item, context)).toEqual({ kind: "done" });
    expect(complete.mock.calls.map(([, retry]) => retry)).toEqual([false, true]);
  });

  it("uploads again when complete says the file is not there", async () => {
    const calls = api({ complete: vi.fn(async () => failure(409)) });
    const item = job();
    await createUploadWorker("job", vi.fn(), calls)(item, context);
    expect(item.progress.uploaded).toBe(false);
  });

  it("passes the queue's abort signal to every request", async () => {
    const calls = api();
    const abort = new AbortController();
    await createUploadWorker("job", vi.fn(), calls)(job(), { report: vi.fn(), signal: abort.signal });
    expect(vi.mocked(calls.sign).mock.calls[0][3]).toBe(abort.signal);
    expect(vi.mocked(calls.upload).mock.calls[0][4]).toBe(abort.signal);
    expect(vi.mocked(calls.complete).mock.calls[0][2]).toBe(abort.signal);
  });
});
