import { describe, expect, it } from "vitest";
import { expectationFromFileName, localSet, structureMatches } from "./local-files";

describe("expectationFromFileName", () => {
  it("reads the ready labels", () => {
    expect(expectationFromFileName("high-score-engineer.pdf")).toEqual({
      file: "high-score-engineer.pdf",
      expect: "ready",
      band: "strong",
      rank: 3,
    });
    expect(expectationFromFileName("Medium-Score-x.DOCX")).toMatchObject({ expect: "ready", band: "partial", rank: 2 });
    expect(expectationFromFileName("low-score-x.pdf")).toMatchObject({ expect: "ready", band: "weak", rank: 1 });
  });

  it("reads the checks a fails- name names", () => {
    expect(expectationFromFileName("fails-no-email-no-phone.pdf")).toEqual({
      file: "fails-no-email-no-phone.pdf",
      expect: "set_aside",
      checks: ["contact_info", "phone"],
    });
    expect(expectationFromFileName("fails-scanned-image-only.pdf")).toMatchObject({ checks: ["readable_text"] });
    expect(expectationFromFileName("fails-with-photo.docx")).toMatchObject({ checks: ["picture"] });
    expect(expectationFromFileName("fails-Curriculum Vitae.pdf")).toMatchObject({ expect: "set_aside", checks: [] });
  });

  it("ignores unlabelled files and other types", () => {
    expect(expectationFromFileName("High_Score_Resume.pdf")).toBeNull();
    expect(expectationFromFileName("high-score-notes.txt")).toBeNull();
  });
});

describe("localSet", () => {
  it("makes a test 2 case per ready file, scored against the Applied AI Engineer job, and orders every two ranks", () => {
    const set = localSet([
      "low-score-c.pdf",
      "high-score-a.pdf",
      "notes.txt",
      "fails-no-email.pdf",
      "medium-score-b.pdf",
    ]);
    expect(set.files.map((file) => file.file)).toEqual([
      "fails-no-email.pdf",
      "high-score-a.pdf",
      "low-score-c.pdf",
      "medium-score-b.pdf",
    ]);
    expect(set.cases.map((item) => [item.id, item.band, item.job, item.test])).toEqual([
      ["file:high-score-a.pdf", "strong", "ai-engineer", 2],
      ["file:low-score-c.pdf", "weak", "ai-engineer", 2],
      ["file:medium-score-b.pdf", "partial", "ai-engineer", 2],
    ]);
    expect(set.comparisons.map((item) => [item.higher, item.lower])).toEqual([
      ["file:high-score-a.pdf", "file:low-score-c.pdf"],
      ["file:high-score-a.pdf", "file:medium-score-b.pdf"],
      ["file:medium-score-b.pdf", "file:low-score-c.pdf"],
    ]);
  });

  it("is empty with no files", () => {
    expect(localSet([])).toEqual({ files: [], cases: [], comparisons: [] });
  });
});

describe("structureMatches", () => {
  const ready = { file: "high-score-a.pdf", expect: "ready", band: "strong", rank: 3 } as const;
  const noContact = { file: "fails-no-email-no-phone.pdf", expect: "set_aside", checks: ["contact_info", "phone"] } as const;
  const scan = { file: "fails-scan.pdf", expect: "set_aside", checks: ["readable_text"] } as const;
  const any = { file: "fails-x.pdf", expect: "set_aside", checks: [] } as const;

  it("needs the right status", () => {
    expect(structureMatches(ready, { status: "ready", failed: ["standard_sections"] })).toBe(true);
    expect(structureMatches(ready, { status: "set_aside", failed: ["phone"] })).toBe(false);
    expect(structureMatches(any, { status: "ready", failed: [] })).toBe(false);
    expect(structureMatches(any, { status: "set_aside", failed: ["picture"] })).toBe(true);
  });

  it("needs every named check to have failed", () => {
    expect(structureMatches(noContact, { status: "set_aside", failed: ["contact_info", "phone", "picture"] })).toBe(true);
    expect(structureMatches(noContact, { status: "set_aside", failed: ["contact_info"] })).toBe(false);
  });

  it("counts a file whose text could not be read as having no readable text", () => {
    expect(structureMatches(scan, { status: "set_aside", failed: ["extraction:unreadable"] })).toBe(true);
  });
});
