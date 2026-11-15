import { describe, expect, it } from "vitest";
import { fileFacts, nameFromFileName } from "./file-facts";
import { needsWork, resumesNeedingWork, settledStatus, summarize, type WorkRow } from "./work";

const row = (id: string, over: Partial<WorkRow> = {}): WorkRow => ({
  id,
  status: "extracted",
  ats_status: null,
  ats_override: false,
  has_text: true,
  ...over,
});

const none = new Set<string>();

describe("needsWork", () => {
  it("covers resumes with no ATS result, ready ones and overridden ones without a candidate", () => {
    expect(needsWork(row("a"), none)).toBe(true);
    expect(needsWork(row("a", { ats_status: "ATS_READY" }), none)).toBe(true);
    expect(needsWork(row("a", { ats_status: "NOT_ATS_READY", ats_override: true }), none)).toBe(true);
  });

  it("skips scored, not-ready and text-less resumes", () => {
    expect(needsWork(row("a", { ats_status: "ATS_READY" }), new Set(["a"]))).toBe(false);
    expect(needsWork(row("a", { ats_status: "NOT_ATS_READY" }), none)).toBe(false);
    expect(needsWork(row("a", { has_text: false, status: "pending" }), none)).toBe(false);
    expect(needsWork(row("a", { has_text: false, status: "failed" }), none)).toBe(false);
  });

  it("includes a resume whose analysis failed", () => {
    expect(needsWork(row("a", { status: "failed", ats_status: "ATS_READY" }), none)).toBe(true);
  });
});

describe("resumesNeedingWork", () => {
  it("keeps the order of the rows", () => {
    const rows = [row("c"), row("a", { ats_status: "NOT_ATS_READY" }), row("b")];
    expect(resumesNeedingWork(rows, none)).toEqual(["c", "b"]);
  });
});

describe("summarize and settledStatus", () => {
  const rows = [
    row("scored", { ats_status: "ATS_READY" }),
    row("rejected", { ats_status: "NOT_ATS_READY" }),
    row("failed", { ats_status: "ATS_READY", status: "failed" }),
    row("unchecked"),
    row("uploading", { has_text: false, status: "pending" }),
  ];
  const scored = new Set(["scored"]);

  it("counts every bucket from the rows", () => {
    expect(summarize(rows, scored)).toEqual({
      total: 5,
      extracted: 4,
      ats_failed: 1,
      scored: 1,
      failed: 1,
      remaining: 1,
    });
  });

  it("leaves a job that still has work alone", () => {
    expect(settledStatus("ANALYZING", summarize(rows, scored))).toBeNull();
  });

  it("is DONE when nothing remains, failures included", () => {
    expect(settledStatus("ANALYZING", summarize(rows.filter((r) => r.id !== "unchecked"), scored))).toBe("DONE");
  });

  it("is ERROR only when every resume with text failed", () => {
    const allFailed = [row("x", { status: "failed", ats_status: "ATS_READY" }), row("y", { status: "failed" })];
    expect(settledStatus("ANALYZING", summarize(allFailed, none))).toBe("ERROR");
  });

  it("only moves a job that is ANALYZING", () => {
    const done = summarize([], none);
    expect(settledStatus("CREATED", done)).toBeNull();
    expect(settledStatus("DONE", done)).toBeNull();
    expect(settledStatus("ANALYZING", done)).toBe("DONE");
  });
});

describe("file facts", () => {
  it("takes the content type from the extension", () => {
    expect(fileFacts("cv.PDF").contentType).toBe("application/pdf");
    expect(fileFacts("cv.docx").contentType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(fileFacts("cv.txt").contentType).toBe("application/octet-stream");
    expect(fileFacts("cv").contentType).toBe("application/octet-stream");
  });

  it("strips the extension for a fallback name", () => {
    expect(nameFromFileName("Jordan Lee.pdf")).toBe("Jordan Lee");
    expect(nameFromFileName("noext")).toBe("noext");
    expect(nameFromFileName(".pdf")).toBe(".pdf");
  });
});
