import { describe, expect, it } from "vitest";
import { RESUME_LIMITS, UPLOAD_LIMITS } from "@/lib/config";
import { contentTypeFor, validateDrop } from "./drop";
import { DOCX_MIME, PDF_MIME } from "./files";
import { DROP_LIMIT_REJECTED, JOB_FULL_MESSAGE, SIZE_REJECTED, TYPE_REJECTED } from "./messages";

const file = (name: string, type: string, size = 1000) => ({ name, type, size });

describe("contentTypeFor", () => {
  it("trusts an allowed declared type and refuses another one", () => {
    expect(contentTypeFor(file("a.pdf", PDF_MIME))).toBe(PDF_MIME);
    expect(contentTypeFor(file("a.pdf", "text/plain"))).toBeNull();
  });

  it("falls back to the extension when the browser gives no type", () => {
    expect(contentTypeFor(file("a.PDF", ""))).toBe(PDF_MIME);
    expect(contentTypeFor(file("a.docx", ""))).toBe(DOCX_MIME);
    expect(contentTypeFor(file("a.doc", ""))).toBeNull();
    expect(contentTypeFor(file("a.txt", ""))).toBeNull();
  });
});

describe("a file the browser reports as application/octet-stream", () => {
  const UNKNOWN = "application/octet-stream";

  it("is typed by its extension, like a file with no type", () => {
    expect(contentTypeFor(file("cv.docx", UNKNOWN))).toBe(DOCX_MIME);
    expect(contentTypeFor(file("CV.PDF", UNKNOWN))).toBe(PDF_MIME);
  });

  it("is still refused when the extension is not .pdf or .docx", () => {
    expect(contentTypeFor(file("cv.doc", UNKNOWN))).toBeNull();
    expect(contentTypeFor(file("setup.exe", UNKNOWN))).toBeNull();
    expect(contentTypeFor(file("cv", UNKNOWN))).toBeNull();
  });

  it("is accepted by validateDrop and uploaded as a Word file", () => {
    const { accepted, rejected } = validateDrop([file("cv.docx", UNKNOWN)], 0);
    expect(rejected).toEqual([]);
    expect(accepted).toEqual([{ file: file("cv.docx", UNKNOWN), contentType: DOCX_MIME }]);
  });

  it("another declared type is never overridden by the extension", () => {
    expect(contentTypeFor(file("cv.docx", "text/plain"))).toBeNull();
    expect(contentTypeFor(file("cv.pdf", "application/zip"))).toBeNull();
  });
});

describe("validateDrop", () => {
  it("accepts PDF and DOCX within the size limit", () => {
    const { accepted, rejected } = validateDrop(
      [file("a.pdf", PDF_MIME), file("b.docx", DOCX_MIME, UPLOAD_LIMITS.maxBytes)],
      0,
    );
    expect(accepted.map((item) => item.file.name)).toEqual(["a.pdf", "b.docx"]);
    expect(rejected).toEqual([]);
  });

  it("refuses a wrong type, an oversized file and an empty file, each with its own message", () => {
    const { accepted, rejected } = validateDrop(
      [
        file("notes.txt", "text/plain"),
        file("big.pdf", PDF_MIME, UPLOAD_LIMITS.maxBytes + 1),
        file("empty.pdf", PDF_MIME, 0),
        file("ok.pdf", PDF_MIME),
      ],
      0,
    );
    expect(accepted).toHaveLength(1);
    expect(rejected.map((item) => item.name)).toEqual(["notes.txt", "big.pdf", "empty.pdf"]);
    expect(rejected[0].reason).toBe(TYPE_REJECTED);
    expect(rejected[1].reason).toBe(SIZE_REJECTED);
    expect(new Set(rejected.map((item) => item.reason)).size).toBe(3);
  });

  it("refuses files past the per-drop limit", () => {
    const files = Array.from({ length: RESUME_LIMITS.maxFilesPerDrop + 2 }, (_, i) =>
      file(`f${i}.pdf`, PDF_MIME),
    );
    const { accepted, rejected } = validateDrop(files, 0);
    expect(accepted).toHaveLength(RESUME_LIMITS.maxFilesPerDrop);
    expect(rejected).toHaveLength(2);
    expect(rejected.every((item) => item.reason === DROP_LIMIT_REJECTED)).toBe(true);
  });

  it("counts only valid files against the per-drop limit", () => {
    const invalid = Array.from({ length: 10 }, (_, i) => file(`bad${i}.txt`, "text/plain"));
    const valid = Array.from({ length: 15 }, (_, i) => file(`ok${i}.pdf`, PDF_MIME));
    const { accepted, rejected } = validateDrop([...invalid, ...valid], 0);
    expect(accepted).toHaveLength(15);
    expect(rejected).toHaveLength(10);
    expect(rejected.every((item) => item.reason === TYPE_REJECTED)).toBe(true);
  });

  it("with 25 valid files after 10 invalid ones accepts 20 and refuses 5 as over the limit", () => {
    const invalid = Array.from({ length: 10 }, (_, i) => file(`bad${i}.txt`, "text/plain"));
    const valid = Array.from({ length: 25 }, (_, i) => file(`ok${i}.pdf`, PDF_MIME));
    const { accepted, rejected } = validateDrop([...invalid, ...valid], 0);
    expect(accepted).toHaveLength(20);
    expect(rejected.filter((item) => item.reason === DROP_LIMIT_REJECTED)).toHaveLength(5);
  });

  it("refuses files past the per-job limit", () => {
    const files = [file("a.pdf", PDF_MIME), file("b.pdf", PDF_MIME), file("c.pdf", PDF_MIME)];
    const { accepted, rejected } = validateDrop(files, RESUME_LIMITS.maxPerJob - 1);
    expect(accepted.map((item) => item.file.name)).toEqual(["a.pdf"]);
    expect(rejected.map((item) => item.reason)).toEqual([JOB_FULL_MESSAGE, JOB_FULL_MESSAGE]);
  });
});
