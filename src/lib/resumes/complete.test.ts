import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePdf } from "../../../test/fixtures";
import { ok, queryBuilder, storageMock } from "../../../test/supabase-mock";
import { ExtractionError, REASONS } from "./extract-text";

const extractText = vi.fn();

vi.mock("./extract-text", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./extract-text")>()),
  extractText: (...args: unknown[]) => extractText(...args),
}));

const { completeUpload } = await import("./complete");

const resume = {
  id: "r1",
  job_id: "j1",
  storage_path: "j1/r1/cv.pdf",
  file_name: "cv.pdf",
  status: "pending" as const,
  extracted_text: null,
};

const { storage, bucket } = storageMock();
let table: ReturnType<typeof queryBuilder>;

beforeEach(() => {
  extractText.mockReset();
  table = queryBuilder(ok(null));
  bucket.download.mockResolvedValue({ data: new Blob([makePdf(["Hello"]) as BlobPart]), error: null });
});

const client = () => ({ from: () => table, storage }) as never;

describe("completeUpload", () => {
  it("saves the picture count together with the text", async () => {
    extractText.mockResolvedValue({ text: "Avery Example", imageCount: 3 });

    const result = await completeUpload(client(), resume);

    expect(result).toEqual({ state: "done", status: "extracted", characters: 13 });
    expect(table.update).toHaveBeenCalledWith({
      status: "extracted",
      extracted_text: "Avery Example",
      image_count: 3,
    });
  });

  it("saves a count it could not take as null", async () => {
    extractText.mockResolvedValue({ text: "Avery Example", imageCount: null });
    await completeUpload(client(), resume);
    expect(table.update).toHaveBeenCalledWith({
      status: "extracted",
      extracted_text: "Avery Example",
      image_count: null,
    });
  });
});

describe("completeUpload with a pathological file", () => {
  it("ends the row as failed with 'took too long' when the read times out, not left pending", async () => {
    extractText.mockRejectedValue(
      new ExtractionError("timeout", REASONS.timeout),
    );

    const result = await completeUpload(client(), resume);

    expect(result).toEqual({
      state: "done",
      status: "failed",
      characters: 0,
      message: "Reading the file took too long.",
    });
    expect(table.update).toHaveBeenCalledWith({ status: "failed", extracted_text: null });
  });

  it("ends the row as failed when the file is too long or complex", async () => {
    extractText.mockRejectedValue(new ExtractionError("too_complex", REASONS.too_complex));
    const result = await completeUpload(client(), resume);
    expect(result).toMatchObject({ status: "failed", message: REASONS.too_complex });
  });
});
