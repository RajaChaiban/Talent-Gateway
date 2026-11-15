import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const uploadToSignedUrl = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl }) } }),
}));

const { completeResume, retryAfterMs, signResume, uploadToStorage } = await import("./client-api");

const file = new File([new Uint8Array([1, 2, 3])], "cv.pdf", { type: "application/pdf" });

describe("uploadToStorage", () => {
  beforeEach(() => {
    uploadToSignedUrl.mockReset();
  });

  it("is ok when storage accepts the file", async () => {
    uploadToSignedUrl.mockResolvedValue({ data: {}, error: null });
    await expect(uploadToStorage("p", "t", file, "application/pdf")).resolves.toEqual({
      ok: true,
      data: null,
    });
  });

  it.each([
    ["a 409", { message: "Duplicate", status: 409 }],
    ["statusCode 409", { message: "The resource already exists", status: 400, statusCode: "409" }],
    ["an already-exists message", { message: "The resource already exists", status: 400 }],
  ])("treats %s for its own path as uploaded, so a lost response does not fail the file", async (_label, error) => {
    uploadToSignedUrl.mockResolvedValue({ data: null, error });
    await expect(uploadToStorage("p", "t", file, "application/pdf")).resolves.toMatchObject({ ok: true });
  });

  it("hands storage a body typed with the declared content type, even when the File has none", async () => {
    uploadToSignedUrl.mockResolvedValue({ data: {}, error: null });
    const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const untyped = new File([new Uint8Array([1, 2, 3])], "cv.docx", { type: "" });
    expect(untyped.type).toBe("");

    await uploadToStorage("p", "t", untyped, docx);

    const [path, token, body, options] = uploadToSignedUrl.mock.calls[0];
    expect([path, token]).toEqual(["p", "t"]);
    expect(body).toBeInstanceOf(File);
    expect((body as File).type).toBe(docx);
    expect((body as File).name).toBe("cv.docx");
    expect((body as File).size).toBe(3);
    expect(options).toEqual({ contentType: docx });
  });

  it("calls a 415 invalid_mime_type from storage a final refusal with its own message", async () => {
    uploadToSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "mime type application/octet-stream is not supported", status: 400, statusCode: "415" },
    });
    await expect(uploadToStorage("p", "t", file, "application/pdf")).resolves.toEqual({
      ok: false,
      message: "This file type was refused by storage.",
      status: 415,
      final: true,
    });
  });

  it("calls a 413 from storage a final refusal about the size", async () => {
    uploadToSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "The object exceeded the maximum allowed size", status: 413, statusCode: "413" },
    });
    await expect(uploadToStorage("p", "t", file, "application/pdf")).resolves.toMatchObject({
      ok: false,
      message: "This file is larger than 5 MB.",
      final: true,
    });
  });

  it("does not blame the connection for another storage 4xx, and does not make it final", async () => {
    uploadToSignedUrl.mockResolvedValue({ data: null, error: { message: "Invalid token", status: 403 } });
    const result = await uploadToStorage("p", "t", file, "application/pdf");
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(result).not.toHaveProperty("final");
    expect(result.ok === false && result.message).not.toMatch(/connection/);
  });

  it("reports the status of any other storage failure", async () => {
    uploadToSignedUrl.mockResolvedValue({ data: null, error: { message: "bad gateway", status: 502 } });
    await expect(uploadToStorage("p", "t", file, "application/pdf")).resolves.toMatchObject({
      ok: false,
      status: 502,
    });
  });

  it("counts a thrown error as a lost connection", async () => {
    uploadToSignedUrl.mockRejectedValue(new Error("network"));
    await expect(uploadToStorage("p", "t", file, "application/pdf")).resolves.toMatchObject({
      ok: false,
      status: null,
    });
  });

  it("gives up as soon as the signal aborts, without waiting for the upload", async () => {
    uploadToSignedUrl.mockReturnValue(new Promise(() => undefined));
    const abort = new AbortController();
    const pending = uploadToStorage("p", "t", file, "application/pdf", abort.signal);
    abort.abort();
    await expect(pending).resolves.toMatchObject({ ok: false, status: null });
  });

  it("does not start when the signal is already aborted", async () => {
    const abort = new AbortController();
    abort.abort();
    await uploadToStorage("p", "t", file, "application/pdf", abort.signal);
    expect(uploadToSignedUrl).not.toHaveBeenCalled();
  });
});

describe("requests", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers });

  it("carries the status and Retry-After of a failure", async () => {
    fetchMock.mockResolvedValue(
      respond(429, { error: { code: "rate_limited", message: "slow" } }, { "retry-after": "3" }),
    );
    await expect(signResume("j", file, "application/pdf")).resolves.toEqual({
      ok: false,
      message: "slow",
      status: 429,
      retryAfterMs: 3000,
      code: "rate_limited",
    });
  });

  it("sends the browser's resume id in the sign body", async () => {
    fetchMock.mockResolvedValue(respond(201, { data: { resume_id: "r", path: "p", token: "t" } }));
    await signResume("j", file, "application/pdf", undefined, "0b4d8f3e-6f0a-4c52-8d57-3a1f9b2c7e10");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body).toMatchObject({ resume_id: "0b4d8f3e-6f0a-4c52-8d57-3a1f9b2c7e10", job_id: "j" });
  });

  it("counts a failed fetch as a lost connection", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(completeResume("r")).resolves.toMatchObject({ ok: false, status: null });
  });

  it("gives every request a timeout signal, joined with the caller's", async () => {
    fetchMock.mockResolvedValue(respond(200, { data: { resume_id: "r", status: "extracted", characters: 1 } }));
    const abort = new AbortController();
    await completeResume("r", true, abort.signal);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/resumes/r/complete?retry=1");
    const { signal } = init as { signal: AbortSignal };
    expect(signal.aborted).toBe(false);
    abort.abort();
    expect(signal.aborted).toBe(true);
  });
});

describe("retryAfterMs", () => {
  it("reads seconds and ignores anything else", () => {
    expect(retryAfterMs("2")).toBe(2000);
    expect(retryAfterMs(null)).toBeUndefined();
    expect(retryAfterMs("Wed, 21 Oct 2026 07:28:00 GMT")).toBeUndefined();
  });
});
