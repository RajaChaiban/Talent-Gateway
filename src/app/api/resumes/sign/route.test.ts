import { AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RESUME_LIMITS, UPLOAD_LIMITS } from "@/lib/config";
import {
  failed,
  ok,
  queryBuilder,
  SIGNED_IN,
  storageMock,
} from "../../../../../test/supabase-mock";

const getUser = vi.fn();
const from = vi.fn();
const { storage, bucket } = storageMock();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from, storage }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const route = await import("./route");
const { POST } = route;

const JOB = "0b4d8f3e-6f0a-4c52-8d57-3a1f9b2c7e10";
const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const body = { job_id: JOB, file_name: "Avery Example.pdf", content_type: PDF, size: 2048 };

/** What a browser on this site sends with a state-changing request. */
const SAME_ORIGIN = { "sec-fetch-site": "same-origin" };

function post(payload: unknown, raw = false, headers: Record<string, string> = SAME_ORIGIN) {
  return POST(
    new Request("http://localhost/api/resumes/sign", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: raw ? String(payload) : JSON.stringify(payload),
    }),
  );
}

const signedOut = { data: { user: null }, error: new AuthSessionMissingError() };
const authDown = { data: { user: null }, error: new AuthRetryableFetchError("down", 0) };

let resumes: ReturnType<typeof queryBuilder>;

function mockTables(job: unknown = { id: JOB }, count = 0) {
  resumes = queryBuilder({ data: [], error: null, count });
  from.mockImplementation((table: string) =>
    table === "jobs" ? queryBuilder(ok(job)) : resumes,
  );
}

beforeEach(() => {
  getUser.mockReset();
  from.mockReset();
  storage.from.mockClear();
  bucket.createSignedUploadUrl.mockReset();
  bucket.createSignedUploadUrl.mockImplementation(async (path: string) =>
    ok({ signedUrl: "https://example.test/upload", token: "tok-1", path }),
  );
  getUser.mockResolvedValue(SIGNED_IN);
  mockTables();
});

describe("POST /api/resumes/sign", () => {
  it("sets a maxDuration", () => {
    expect(route.maxDuration).toBe(30);
  });

  it.each<[Record<string, string>]>([
    [{ "sec-fetch-site": "cross-site" }],
    [{ "sec-fetch-site": "same-site" }],
    [{ "sec-fetch-site": "none" }],
    [{ origin: "https://evil.example" }],
    [{}],
  ])("returns 403 forbidden for a cross-site request %j and creates nothing", async (headers) => {
    const response = await post(body, false, headers);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "forbidden" } });
    expect(from).not.toHaveBeenCalled();
    expect(storage.from).not.toHaveBeenCalled();
  });

  it("accepts this site's own Origin when the browser sends no Sec-Fetch-Site", async () => {
    expect((await post(body, false, { origin: "http://localhost" })).status).toBe(201);
  });

  it("checks sign-in before the origin", async () => {
    getUser.mockResolvedValue(signedOut);
    expect((await post(body, false, { "sec-fetch-site": "cross-site" })).status).toBe(401);
  });

  it("inserts a pending row and returns a signed upload (201)", async () => {
    const response = await post(body);

    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data.token).toBe("tok-1");
    expect(data.resume_id).toMatch(/^[0-9a-f-]{36}$/);
    const path = `${JOB}/${data.resume_id}/Avery_Example.pdf`;
    expect(data.path).toBe(path);
    expect(bucket.createSignedUploadUrl).toHaveBeenCalledWith(path);
    expect(resumes.insert).toHaveBeenCalledWith({
      id: data.resume_id,
      job_id: JOB,
      file_name: "Avery Example.pdf",
      storage_path: path,
      status: "pending",
    });
  });

  it("keeps the original name in the row and a sanitised one in the path", async () => {
    const response = await post({
      ...body,
      file_name: "../../x/Résumé cv.docx",
      content_type: DOCX,
    });
    const { data } = await response.json();
    expect(data.path).toBe(`${JOB}/${data.resume_id}/Resume_cv.docx`);
    expect(resumes.insert).toHaveBeenCalledWith(
      expect.objectContaining({ file_name: "../../x/Résumé cv.docx" }),
    );
  });

  it("returns 415 for a type that is not PDF or DOCX, with no write", async () => {
    const response = await post({ ...body, content_type: "text/plain" });
    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "unsupported_media_type" },
    });
    expect(from).not.toHaveBeenCalled();
    expect(bucket.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("returns 413 for a file over the limit and accepts exactly the limit", async () => {
    const big = await post({ ...body, size: UPLOAD_LIMITS.maxBytes + 1 });
    expect(big.status).toBe(413);
    expect(from).not.toHaveBeenCalled();

    const exact = await post({ ...body, size: UPLOAD_LIMITS.maxBytes });
    expect(exact.status).toBe(201);
  });

  it.each([
    ["not json", true],
    [{}, false],
    [{ ...body, job_id: "nope" }, false],
    [{ ...body, file_name: "" }, false],
    [{ ...body, size: 0 }, false],
  ])("returns 400 for bad input %#", async (payload, raw) => {
    const response = await post(payload, raw);
    expect(response.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown job", async () => {
    mockTables(null);
    const response = await post(body);
    expect(response.status).toBe(404);
    expect(resumes.insert).not.toHaveBeenCalled();
    expect(bucket.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("returns 409 when the job already holds the maximum", async () => {
    mockTables({ id: JOB }, RESUME_LIMITS.maxPerJob);
    const response = await post(body);
    expect(response.status).toBe(409);
    expect(resumes.insert).not.toHaveBeenCalled();
  });

  it("returns 500 when the database fails", async () => {
    from.mockReturnValue(queryBuilder(failed));
    expect((await post(body)).status).toBe(500);
  });

  it("returns 500 and writes no row when storage cannot sign", async () => {
    bucket.createSignedUploadUrl.mockResolvedValue({ data: null, error: { message: "no", status: 400 } });
    expect((await post(body)).status).toBe(500);
    expect(resumes.insert).not.toHaveBeenCalled();
  });

  it("returns 401 with no database or storage call when signed out", async () => {
    getUser.mockResolvedValue(signedOut);
    expect((await post(body)).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
    expect(storage.from).not.toHaveBeenCalled();
  });

  it("returns 503 with no database or storage call when auth is down", async () => {
    getUser.mockResolvedValue(authDown);
    expect((await post(body)).status).toBe(503);
    expect(from).not.toHaveBeenCalled();
    expect(storage.from).not.toHaveBeenCalled();
  });
});

type Row = { id: string; job_id: string; created_at: string };

/** An in-memory `resumes` table whose calls take a few ticks, so concurrent requests interleave. */
function fakeResumesTable(rows: Row[]) {
  const tick = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  return () => {
    let op: "select" | "insert" | "delete" = "select";
    let jobFilter: string | undefined;
    let idFilter: string | undefined;
    let insertRow: Row | undefined;
    const builder = {
      select: () => builder,
      eq: (column: string, value: string) => {
        if (column === "job_id") jobFilter = value;
        if (column === "id") idFilter = value;
        return builder;
      },
      insert: (row: Row) => {
        op = "insert";
        insertRow = row;
        return builder;
      },
      delete: () => {
        op = "delete";
        return builder;
      },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        tick().then(() => {
          if (op === "insert" && insertRow) {
            rows.push({ ...insertRow, created_at: new Date().toISOString() });
            return { data: null, error: null };
          }
          if (op === "delete") {
            const at = rows.findIndex((row) => row.id === idFilter);
            if (at >= 0) rows.splice(at, 1);
            return { data: null, error: null };
          }
          const matching = jobFilter ? rows.filter((row) => row.job_id === jobFilter) : rows;
          return { data: matching.slice(0, 1), error: null, count: matching.length };
        }).then(resolve, reject),
    };
    return builder;
  };
}

describe("POST /api/resumes/sign per-job cap under concurrency", () => {
  function seed(count: number): Row[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `existing-${i}`,
      job_id: JOB,
      created_at: new Date(Date.now() - 600_000).toISOString(),
    }));
  }

  function useTable(rows: Row[]) {
    const table = fakeResumesTable(rows);
    from.mockImplementation((name: string) => (name === "jobs" ? queryBuilder(ok({ id: JOB })) : table()));
  }

  it("never leaves more than the cap when 20 requests arrive together", async () => {
    const rows = seed(RESUME_LIMITS.maxPerJob - 5);
    useTable(rows);

    const responses = await Promise.all(Array.from({ length: 20 }, () => post(body)));
    const statuses = responses.map((response) => response.status);

    expect(rows.length).toBeLessThanOrEqual(RESUME_LIMITS.maxPerJob);
    expect(statuses.every((status) => status === 201 || status === 409)).toBe(true);
    expect(statuses.filter((status) => status === 201)).toHaveLength(
      rows.length - (RESUME_LIMITS.maxPerJob - 5),
    );
  });

  it("accepts all 20 when there is room for them", async () => {
    const rows = seed(10);
    useTable(rows);
    const responses = await Promise.all(Array.from({ length: 20 }, () => post(body)));
    expect(responses.map((response) => response.status)).toEqual(Array(20).fill(201));
    expect(rows).toHaveLength(30);
  });

  it("refuses everything when the job is already full", async () => {
    const rows = seed(RESUME_LIMITS.maxPerJob);
    useTable(rows);
    const responses = await Promise.all(Array.from({ length: 20 }, () => post(body)));
    expect(responses.map((response) => response.status)).toEqual(Array(20).fill(409));
    expect(rows).toHaveLength(RESUME_LIMITS.maxPerJob);
  });
});

describe("POST /api/resumes/sign storage and file names", () => {
  it("answers 503 and writes no row when storage is unavailable while signing", async () => {
    bucket.createSignedUploadUrl.mockResolvedValue({ data: null, error: { message: "bad gateway", status: 502 } });
    const response = await post(body);
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("2");
    expect(resumes.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["a NUL", "re\u0000sume.pdf", "resume.pdf"],
    ["a lone surrogate", "cv\ud800.pdf", "cv.pdf"],
    ["ESC and bell", "c\u001bv\u0007.pdf", "cv.pdf"],
  ])("stores a cleaned name for %s instead of failing with 500", async (_label, name, stored) => {
    const response = await post({ ...body, file_name: name });
    expect(response.status).toBe(201);
    expect(resumes.insert).toHaveBeenCalledWith(expect.objectContaining({ file_name: stored }));
  });

  it("answers 400 naming file_name when nothing printable is left", async () => {
    const response = await post({ ...body, file_name: "\u0000\u0007" });
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("file_name");
    expect(from).not.toHaveBeenCalled();
  });
});

describe("POST /api/resumes/sign with a resume id from the browser", () => {
  const RID = "5c1d1f0e-0a9e-4b8e-9d0b-2f6f2f6a8b11";
  const path = `${JOB}/${RID}/Avery_Example.pdf`;
  const withId = { ...body, resume_id: RID };
  const existingRow = (over: Record<string, unknown> = {}) => ({
    id: RID,
    job_id: JOB,
    storage_path: path,
    file_name: "Avery Example.pdf",
    status: "pending",
    extracted_text: null,
    ...over,
  });

  /** The n-th use of the resumes table gets the n-th builder; the jobs table always finds the job. */
  function tables(...builders: ReturnType<typeof queryBuilder>[]) {
    let call = 0;
    from.mockImplementation((table: string) =>
      table === "jobs" ? queryBuilder(ok({ id: JOB })) : builders[Math.min(call++, builders.length - 1)],
    );
  }
  const empty = () => queryBuilder({ data: [], error: null, count: 0 });

  it("uses the id as the row id and the path", async () => {
    const lookup = queryBuilder(ok(null));
    const insertion = empty();
    tables(lookup, empty(), insertion, empty());

    const response = await post(withId);

    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data.resume_id).toBe(RID);
    expect(data.path).toBe(path);
    expect(insertion.insert).toHaveBeenCalledWith(expect.objectContaining({ id: RID, storage_path: path }));
  });

  it("answers a repeat of the same file with a fresh signed URL for the same row, and inserts nothing", async () => {
    const lookup = queryBuilder(ok(existingRow()));
    tables(lookup);

    const response = await post(withId);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { resume_id: RID, path, token: "tok-1" },
    });
    expect(lookup.insert).not.toHaveBeenCalled();
    expect(bucket.createSignedUploadUrl).toHaveBeenCalledWith(path);
  });

  it("still answers a repeat when the job is full", async () => {
    tables(queryBuilder(ok(existingRow())));
    expect((await post(withId)).status).toBe(200);
  });

  it("answers 409 when the id is already used for a different file name", async () => {
    tables(queryBuilder(ok(existingRow({ file_name: "Someone Else.pdf" }))));
    const response = await post(withId);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "conflict" } });
    expect(bucket.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("answers 409 when the id is already used in a different job", async () => {
    tables(queryBuilder(ok(existingRow({ job_id: "11111111-1111-4111-8111-111111111111" }))));
    expect((await post(withId)).status).toBe(409);
  });

  it("treats a duplicate-key answer from the insert (a concurrent sign of the same id) as the same upload", async () => {
    const lookup = queryBuilder(ok(null));
    const duplicate = queryBuilder({ data: null, error: { code: "23505", message: "duplicate key" } });
    const winner = queryBuilder(ok(existingRow()));
    tables(lookup, empty(), duplicate, winner);

    const response = await post(withId);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { resume_id: RID, path } });
  });

  it("answers 409 when the duplicate key belongs to a different file", async () => {
    const lookup = queryBuilder(ok(null));
    const duplicate = queryBuilder({ data: null, error: { code: "23505", message: "duplicate key" } });
    const winner = queryBuilder(ok(existingRow({ file_name: "Other.pdf" })));
    tables(lookup, empty(), duplicate, winner);
    expect((await post(withId)).status).toBe(409);
  });

  it("rejects a resume id that is not a uuid with 400", async () => {
    expect((await post({ ...body, resume_id: "nope" })).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("POST /api/resumes/sign file name rules", () => {
  it.each([
    ["..", "application/pdf"],
    [".", "application/pdf"],
    ["folder/..", "application/pdf"],
    ["a/", "application/pdf"],
    ["...", "application/pdf"],
  ])("refuses %j with 400 naming file_name", async (name, content_type) => {
    const response = await post({ ...body, file_name: name, content_type });
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("file_name");
    expect(from).not.toHaveBeenCalled();
  });

  it("refuses a name whose extension is not the declared type's, after cleaning", async () => {
    const response = await post({ ...body, file_name: "cv‮fdp.exe" });
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("file_name");
    expect((await post({ ...body, file_name: "cv.docx" })).status).toBe(400);
    expect((await post({ ...body, file_name: "cv.pdf", content_type: DOCX })).status).toBe(400);
  });

  it("accepts the matching extension in any case, and still answers 415 for a wrong type first", async () => {
    expect((await post({ ...body, file_name: "CV.PDF" })).status).toBe(201);
    expect((await post({ ...body, file_name: "cv.docx", content_type: DOCX })).status).toBe(201);
    expect((await post({ ...body, file_name: "cv.exe", content_type: "application/x-msdownload" })).status).toBe(415);
  });
});
