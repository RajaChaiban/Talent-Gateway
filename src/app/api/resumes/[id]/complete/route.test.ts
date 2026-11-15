import { AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeDocx, makePdf, makeZip, packageEntries } from "../../../../../../test/fixtures";
import {
  failed,
  ok,
  queryBuilder,
  SIGNED_IN,
  storageMock,
} from "../../../../../../test/supabase-mock";

const getUser = vi.fn();
const from = vi.fn();
const { storage, bucket } = storageMock();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from, storage }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const route = await import("./route");
const { POST } = route;

// The parsers are loaded before any test starts, so a slow first load of the
// library on a busy machine is never counted against a test's own time.
await Promise.all([import("mammoth"), import("unpdf")]);

const ID = "5c1d1f0e-0a9e-4b8e-9d0b-2f6f2f6a8b11";
const JOB = "0b4d8f3e-6f0a-4c52-8d57-3a1f9b2c7e10";
const row = (over: Record<string, unknown> = {}) => ({
  id: ID,
  job_id: JOB,
  storage_path: `${JOB}/${ID}/cv.pdf`,
  file_name: "cv.pdf",
  status: "pending",
  extracted_text: null,
  ...over,
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
/** What a browser on this site sends with a state-changing request. */
const SAME_ORIGIN = { "sec-fetch-site": "same-origin" };
const call = (id = ID, query = "", headers: Record<string, string> = SAME_ORIGIN) =>
  POST(
    new Request(`http://localhost/api/resumes/${id}/complete${query}`, { method: "POST", headers }),
    ctx(id),
  );

const file = (bytes: Uint8Array) => ({ data: new Blob([bytes as BlobPart]), error: null });
const text = (value: string) => new TextEncoder().encode(value);

let table: ReturnType<typeof queryBuilder>;

function mockRow(value: unknown) {
  table = queryBuilder(ok(value));
  from.mockReturnValue(table);
}

const signedOut = { data: { user: null }, error: new AuthSessionMissingError() };
const authDown = { data: { user: null }, error: new AuthRetryableFetchError("down", 0) };

beforeEach(() => {
  getUser.mockReset();
  from.mockReset();
  storage.from.mockClear();
  bucket.download.mockReset();
  getUser.mockResolvedValue(SIGNED_IN);
  mockRow(row());
});

describe("POST /api/resumes/[id]/complete", () => {
  it("extracts a PDF and saves its text", async () => {
    bucket.download.mockResolvedValue(file(makePdf(["Avery Example", "Engineer"])));

    const response = await call();

    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toMatchObject({ resume_id: ID, status: "extracted" });
    expect(data.characters).toBeGreaterThan(10);
    expect(table.update).toHaveBeenCalledWith({
      status: "extracted",
      extracted_text: expect.stringContaining("Avery Example"),
    });
  });

  it("extracts a DOCX", async () => {
    mockRow(row({ file_name: "cv.docx", storage_path: `${JOB}/${ID}/cv.docx` }));
    bucket.download.mockResolvedValue(file(makeDocx(["Sam Sample"])));
    const { data } = await (await call()).json();
    expect(data).toEqual({ resume_id: ID, status: "extracted", characters: 10 });
  });

  it("sets a maxDuration longer than the read's own time guard", () => {
    expect(route.maxDuration).toBe(30);
  });

  it.each<[Record<string, string>]>([
    [{ "sec-fetch-site": "cross-site" }],
    [{ "sec-fetch-site": "same-site" }],
    [{ "sec-fetch-site": "none" }],
    [{ origin: "https://evil.example" }],
    [{}],
  ])("returns 403 forbidden for a cross-site request %j and reads nothing", async (headers) => {
    const response = await call(ID, "", headers);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "forbidden" } });
    expect(from).not.toHaveBeenCalled();
    expect(storage.from).not.toHaveBeenCalled();
  });

  it("accepts this site's own Origin when the browser sends no Sec-Fetch-Site", async () => {
    mockRow(row({ status: "extracted", extracted_text: "kept" }));
    expect((await call(ID, "", { origin: "http://localhost" })).status).toBe(200);
  });

  it("checks sign-in before the origin", async () => {
    getUser.mockResolvedValue(signedOut);
    expect((await call(ID, "", { "sec-fetch-site": "cross-site" })).status).toBe(401);
  });

  it("fails a Word file saved with a .pdf name, with the text cleared", async () => {
    bucket.download.mockResolvedValue(file(makeDocx(["Sam Sample"])));
    const response = await call();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        resume_id: ID,
        status: "failed",
        characters: 0,
        message: "This is a Word file saved with a .pdf name.",
      },
    });
    expect(table.update).toHaveBeenCalledTimes(1);
    expect(table.update).toHaveBeenCalledWith({ status: "failed", extracted_text: null });
  });

  it("fails a PDF saved with a .docx name, with the text cleared", async () => {
    mockRow(row({ file_name: "CV.DOCX", storage_path: `${JOB}/${ID}/CV.DOCX` }));
    bucket.download.mockResolvedValue(file(makePdf(["Avery Example"])));
    const { data } = await (await call()).json();
    expect(data).toEqual({
      resume_id: ID,
      status: "failed",
      characters: 0,
      message: "This is a PDF file saved with a .docx name.",
    });
    expect(table.update).toHaveBeenCalledWith({ status: "failed", extracted_text: null });
  });

  it("a retry of a mistyped file fails the same way", async () => {
    mockRow(row({ status: "failed" }));
    bucket.download.mockResolvedValue(file(makeDocx(["Sam Sample"])));
    const { data } = await (await call(ID, "?retry=1")).json();
    expect(data).toMatchObject({ status: "failed", message: "This is a Word file saved with a .pdf name." });
  });

  it("fails a DOCX whose entry is not the size it declares as damaged, not as too complex", async () => {
    mockRow(row({ file_name: "cv.docx", storage_path: `${JOB}/${ID}/cv.docx` }));
    bucket.download.mockResolvedValue(
      file(
        makeZip([
          ...packageEntries(),
          { name: "word/document.xml", data: new Uint8Array(50_000), deflate: true, declaredSize: 1024 },
        ]),
      ),
    );
    const { data } = await (await call()).json();
    expect(data).toMatchObject({
      status: "failed",
      message: "The file is damaged: its contents do not match the sizes it declares.",
    });
    expect(table.update).toHaveBeenCalledWith({ status: "failed", extracted_text: null });
  });

  it("fails an honest DOCX with too much XML as too long or too complex", async () => {
    mockRow(row({ file_name: "cv.docx", storage_path: `${JOB}/${ID}/cv.docx` }));
    const big = new TextEncoder().encode("<w:p/>".repeat(100_000));
    bucket.download.mockResolvedValue(
      file(makeZip([...packageEntries(), { name: "word/document.xml", data: big, deflate: true }])),
    );
    const { data } = await (await call()).json();
    expect(data).toMatchObject({ status: "failed", message: "The file is too long or too complex to read." });
  });

  it("is idempotent: an extracted resume is returned without reading the file", async () => {
    mockRow(row({ status: "extracted", extracted_text: "twelve chars" }));
    const { data } = await (await call()).json();
    expect(data).toEqual({ resume_id: ID, status: "extracted", characters: 12 });
    expect(bucket.download).not.toHaveBeenCalled();
    expect(table.update).not.toHaveBeenCalled();
  });

  it("returns a failed resume as stored, without downloading the file again", async () => {
    mockRow(row({ status: "failed" }));
    const response = await call();
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toEqual({
      resume_id: ID,
      status: "failed",
      characters: 0,
      message: "This file could not be read. Remove it and upload it again.",
    });
    expect(bucket.download).not.toHaveBeenCalled();
    expect(table.update).not.toHaveBeenCalled();
  });

  it("judges a failed resume again only when the caller asks for a retry", async () => {
    mockRow(row({ status: "failed" }));
    bucket.download.mockResolvedValue(file(makePdf(["Avery Example", "Engineer"])));

    const response = await call(ID, "?retry=1");

    expect((await response.json()).data).toMatchObject({ status: "extracted" });
    expect(bucket.download).toHaveBeenCalledTimes(1);
    expect(table.update).toHaveBeenCalledWith({
      status: "extracted",
      extracted_text: expect.stringContaining("Avery Example"),
    });
  });

  it("a retry on an extracted resume still does not download", async () => {
    mockRow(row({ status: "extracted", extracted_text: "kept text" }));
    const { data } = await (await call(ID, "?retry=1")).json();
    expect(data).toEqual({ resume_id: ID, status: "extracted", characters: 9 });
    expect(bucket.download).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown query value without a call", async () => {
    expect((await call(ID, "?retry=yes")).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("marks a file that is not really a PDF or DOCX as failed, with a message", async () => {
    bucket.download.mockResolvedValue(file(text("plain text")));
    const response = await call();
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toMatchObject({ status: "failed", characters: 0 });
    expect(data.message).toMatch(/not a real PDF/);
    expect(table.update).toHaveBeenCalledWith({ status: "failed", extracted_text: null });
  });

  it("marks an empty file as failed", async () => {
    bucket.download.mockResolvedValue(file(new Uint8Array()));
    const { data } = await (await call()).json();
    expect(data).toMatchObject({ status: "failed", message: "The file is empty." });
  });

  it("marks a corrupt PDF as failed with its reason", async () => {
    bucket.download.mockResolvedValue(file(text("%PDF-1.4 garbage that is not a pdf")));
    const { data } = await (await call()).json();
    expect(data.status).toBe("failed");
    expect(data.message).toMatch(/could not be read/);
  });

  it("stores a text-less PDF as extracted with zero characters", async () => {
    bucket.download.mockResolvedValue(file(makePdf([])));
    const { data } = await (await call()).json();
    expect(data).toEqual({ resume_id: ID, status: "extracted", characters: 0 });
  });

  it("returns 409 when the file is not in storage yet", async () => {
    bucket.download.mockResolvedValue({
      data: null,
      error: { message: "Object not found", status: 400, statusCode: "404" },
    });
    const response = await call();
    expect(response.status).toBe(409);
    expect(table.update).not.toHaveBeenCalled();
  });

  it("returns 500 when storage fails for another reason", async () => {
    bucket.download.mockResolvedValue({ data: null, error: { message: "boom", status: 403 } });
    expect((await call()).status).toBe(500);
  });

  it("returns 404 for an unknown resume", async () => {
    mockRow(null);
    expect((await call()).status).toBe(404);
    expect(bucket.download).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed id without a call", async () => {
    expect((await call("nope")).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 500 when the database fails", async () => {
    from.mockReturnValue(queryBuilder(failed));
    expect((await call()).status).toBe(500);
  });

  it("returns 401 with no database or storage call when signed out", async () => {
    getUser.mockResolvedValue(signedOut);
    expect((await call()).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
    expect(storage.from).not.toHaveBeenCalled();
  });

  it("returns 503 with no database or storage call when auth is down", async () => {
    getUser.mockResolvedValue(authDown);
    expect((await call()).status).toBe(503);
    expect(from).not.toHaveBeenCalled();
    expect(storage.from).not.toHaveBeenCalled();
  });
});

describe("POST /api/resumes/[id]/complete storage errors", () => {
  const fail = (error: Record<string, unknown>) =>
    bucket.download.mockResolvedValue({ data: null, error });

  it("answers 503 storage_unavailable with Retry-After for a 5xx from storage", async () => {
    fail({ message: "Gateway Timeout", status: 504 });
    const response = await call();
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("2");
    await expect(response.json()).resolves.toMatchObject({ error: { code: "storage_unavailable" } });
    expect(table.update).not.toHaveBeenCalled();
  });

  it("answers 503 when storage could not be reached at all (no status)", async () => {
    fail({ message: "fetch failed" });
    expect((await call()).status).toBe(503);
  });

  it("answers 503 for a rate limit or timeout from storage", async () => {
    fail({ message: "slow down", status: 429 });
    expect((await call()).status).toBe(503);
    fail({ message: "request timeout", status: 408 });
    expect((await call()).status).toBe(503);
  });

  it("does not mistake a missing bucket for a missing object: 500, not 409", async () => {
    fail({ message: "Bucket not found", status: 404, statusCode: "404" });
    const response = await call();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "server_error" } });
  });

  it("answers 500 for a permission error from storage", async () => {
    fail({ message: "Unauthorized", status: 403, statusCode: "403" });
    expect((await call()).status).toBe(500);
  });

  it("still answers 409 for a missing object, whichever way storage reports it", async () => {
    fail({ message: "Object not found", status: 404 });
    expect((await call()).status).toBe(409);
    fail({ message: "Object not found", status: 400, statusCode: "404" });
    expect((await call()).status).toBe(409);
  });

  it("fails a stored object that is larger than the limit, whatever size was declared", async () => {
    bucket.download.mockResolvedValue(file(new Uint8Array(5 * 1024 * 1024 + 1)));
    const { data } = await (await call()).json();
    expect(data).toMatchObject({ status: "failed", message: "The file is larger than 5 MB." });
  });
});

describe("POST /api/resumes/[id]/complete when the resume is removed meanwhile", () => {
  it("answers 404, not 200 extracted, when the update touched no row", async () => {
    table = queryBuilder(ok(row()), { updateResult: ok([]) });
    from.mockReturnValue(table);
    bucket.download.mockResolvedValue(file(makePdf(["Avery Example"])));

    const response = await call();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "not_found" } });
  });

  it("answers 404 too when it was a failed outcome that found no row", async () => {
    table = queryBuilder(ok(row()), { updateResult: ok([]) });
    from.mockReturnValue(table);
    bucket.download.mockResolvedValue(file(text("plain text")));
    expect((await call()).status).toBe(404);
  });

  it("asks for the id back from the update, so a missing row is visible", async () => {
    bucket.download.mockResolvedValue(file(makePdf(["Avery Example"])));
    await call();
    expect(table.select).toHaveBeenCalledWith("id");
  });
});
