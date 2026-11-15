import { describe, expect, it } from "vitest";
import { STORED_FAILED_MESSAGE } from "./messages";
import { savedResumeStatus } from "./saved-status";

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
