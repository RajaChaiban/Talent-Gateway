import { describe, expect, it, vi } from "vitest";
import { failed, ok, queryBuilder, storageMock } from "../../../test/supabase-mock";
import {
  countResumes,
  createPendingResume,
  listResumes,
  removeResume,
  ResumesDataError,
  StorageUnavailableError,
} from "./queries";

const JOB = "0b4d8f3e-6f0a-4c52-8d57-3a1f9b2c7e10";
const ID = "5c1d1f0e-0a9e-4b8e-9d0b-2f6f2f6a8b11";

describe("countResumes", () => {
  it("asks for a head-only exact count of the job's resumes", async () => {
    const builder = queryBuilder({ data: null, error: null, count: 3 });
    const from = vi.fn(() => builder);

    await expect(countResumes({ from } as never, JOB)).resolves.toBe(3);
    expect(from).toHaveBeenCalledWith("resumes");
    expect(builder.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(builder.eq).toHaveBeenCalledWith("job_id", JOB);
  });

  it("reads a missing count as zero", async () => {
    const from = vi.fn(() => queryBuilder({ data: null, error: null, count: null }));
    await expect(countResumes({ from } as never, JOB)).resolves.toBe(0);
  });

  it("throws ResumesDataError when the database fails", async () => {
    const from = vi.fn(() => queryBuilder(failed));
    await expect(countResumes({ from } as never, JOB)).rejects.toBeInstanceOf(ResumesDataError);
  });
});

describe("listResumes", () => {
  const rows = [{ id: ID, file_name: "cv.pdf", status: "extracted", created_at: "2026-11-14T10:00:00Z" }];

  it("reads the job's resumes oldest first, without their text", async () => {
    const builder = queryBuilder(ok(rows));
    const from = vi.fn(() => builder);

    await expect(listResumes({ from } as never, JOB)).resolves.toEqual(rows);
    expect(from).toHaveBeenCalledWith("resumes");
    expect(builder.select).toHaveBeenCalledWith("id, file_name, status, created_at");
    expect(builder.eq).toHaveBeenCalledWith("job_id", JOB);
    expect(builder.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: true });
    expect(builder.order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
  });

  it("throws ResumesDataError when the database fails", async () => {
    const from = vi.fn(() => queryBuilder(failed));
    await expect(listResumes({ from } as never, JOB)).rejects.toBeInstanceOf(ResumesDataError);
  });
});

describe("createPendingResume", () => {
  const input = { id: ID, jobId: JOB, fileName: "cv.pdf", storagePath: `${JOB}/${ID}/cv.pdf` };

  it("inserts a pending row", async () => {
    const builder = queryBuilder(ok(null));
    await expect(createPendingResume({ from: () => builder } as never, input)).resolves.toBe("created");
    expect(builder.insert).toHaveBeenCalledWith({
      id: ID,
      job_id: JOB,
      file_name: "cv.pdf",
      storage_path: input.storagePath,
      status: "pending",
    });
  });

  it("answers exists for a unique violation and throws for any other error", async () => {
    const duplicate = queryBuilder({ data: null, error: { code: "23505", message: "duplicate" } });
    await expect(createPendingResume({ from: () => duplicate } as never, input)).resolves.toBe("exists");
    await expect(
      createPendingResume({ from: () => queryBuilder(failed) } as never, input),
    ).rejects.toBeInstanceOf(ResumesDataError);
  });
});

describe("removeResume", () => {
  const stored = { id: ID, job_id: JOB, storage_path: `${JOB}/${ID}/cv.pdf` };

  it("removes the stored file, then the row", async () => {
    const table = queryBuilder(ok(stored));
    const { storage, bucket } = storageMock();
    const order: string[] = [];
    bucket.remove.mockImplementation(async () => {
      order.push("file");
      return ok([]);
    });
    (table.delete as ReturnType<typeof vi.fn>).mockImplementation(() => {
      order.push("row");
      return table;
    });

    await expect(removeResume({ from: () => table, storage } as never, ID)).resolves.toEqual({
      jobId: JOB,
    });
    expect(bucket.remove).toHaveBeenCalledWith([stored.storage_path]);
    expect(order).toEqual(["file", "row"]);
  });

  it("is null for an unknown resume and touches no file", async () => {
    const { storage, bucket } = storageMock();
    await expect(
      removeResume({ from: () => queryBuilder(ok(null)), storage } as never, ID),
    ).resolves.toBeNull();
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it("keeps the row when storage is unavailable", async () => {
    const table = queryBuilder(ok(stored));
    const { storage } = storageMock({ remove: { data: null, error: { message: "down", status: 503 } } });
    await expect(removeResume({ from: () => table, storage } as never, ID)).rejects.toBeInstanceOf(
      StorageUnavailableError,
    );
    expect(table.delete).not.toHaveBeenCalled();
  });
});
