import { describe, expect, it } from "vitest";
import { STORED_FAILED_MESSAGE } from "./messages";
import { hasStoredFile, resumeFileHref, savedResumeStatus } from "./saved-status";

describe("savedResumeStatus", () => {
  it("shows an extracted resume as Ready", () => {
    expect(savedResumeStatus({ status: "extracted" })).toEqual({
      tone: "success",
      text: "Ready",
    });
  });

  it("tells a failed upload or read to remove the file and upload it again", () => {
    expect(savedResumeStatus({ status: "failed" })).toEqual({
      tone: "error",
      text: "This file could not be read. Remove it and upload it again.",
    });
    expect(STORED_FAILED_MESSAGE).toMatch(/upload it again/);
  });

  it("shows a pending resume as an upload that did not finish", () => {
    expect(savedResumeStatus({ status: "pending" })).toEqual({
      tone: "warning",
      text: "Upload did not finish",
    });
  });
});

describe("hasStoredFile", () => {
  it("offers a download for a read or a failed read, whose file was read back from storage", () => {
    expect(hasStoredFile({ status: "extracted" })).toBe(true);
    expect(hasStoredFile({ status: "failed" })).toBe(true);
  });

  it("offers no download for an upload that never finished", () => {
    expect(hasStoredFile({ status: "pending" })).toBe(false);
  });
});

describe("resumeFileHref", () => {
  it("points at the download route", () => {
    expect(resumeFileHref("5c1d1f0e-0a9e-4b8e-9d0b-2f6f2f6a8b11")).toBe(
      "/api/resumes/5c1d1f0e-0a9e-4b8e-9d0b-2f6f2f6a8b11/file",
    );
  });
});
