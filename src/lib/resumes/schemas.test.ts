import { describe, expect, it } from "vitest";
import { RESUME_LIMITS, UPLOAD_LIMITS } from "@/lib/config";
import { resumeIdSchema } from "@/lib/jobs/schemas";
import { signBodySchema } from "./schemas";

const JOB = "0b4d8f3e-6f0a-4c52-8d57-3a1f9b2c7e10";
const valid = { job_id: JOB, file_name: "cv.pdf", content_type: "application/pdf", size: 1000 };

describe("signBodySchema", () => {
  it("accepts a valid body and trims the name", () => {
    expect(signBodySchema.parse({ ...valid, file_name: "  cv.pdf " }).file_name).toBe("cv.pdf");
  });

  it.each([
    ["job_id", { job_id: "nope" }],
    ["file_name", { file_name: "" }],
    ["file_name", { file_name: "a".repeat(256) }],
    ["content_type", { content_type: "" }],
    ["size", { size: 0 }],
    ["size", { size: 1.5 }],
    ["size", { size: "10" }],
  ])("rejects a bad %s", (field, override) => {
    const result = signBodySchema.safeParse({ ...valid, ...override });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe(field);
  });

  it("does not judge type or size, so the route can answer 415 and 413", () => {
    expect(
      signBodySchema.safeParse({ ...valid, content_type: "text/plain", size: 10 ** 9 }).success,
    ).toBe(true);
  });
});

describe("resumeIdSchema", () => {
  it("accepts a uuid only", () => {
    expect(resumeIdSchema.safeParse(JOB).success).toBe(true);
    expect(resumeIdSchema.safeParse("1").success).toBe(false);
  });
});

describe("limits", () => {
  it("match the spec", () => {
    expect(RESUME_LIMITS.maxFilesPerDrop).toBe(20);
    expect(RESUME_LIMITS.maxPerJob).toBe(50);
    expect(RESUME_LIMITS.uploadConcurrency).toBe(3);
    expect(UPLOAD_LIMITS.maxBytes).toBe(5 * 1024 * 1024);
  });
});

describe("signBodySchema file names", () => {
  const JOB_ID = "0b4d8f3e-6f0a-4c52-8d57-3a1f9b2c7e10";
  const parse = (file_name: string) =>
    signBodySchema.safeParse({
      job_id: JOB_ID,
      file_name,
      content_type: "application/pdf",
      size: 10,
    });
  const nameOf = (file_name: string) => {
    const result = parse(file_name);
    return result.success ? result.data.file_name : undefined;
  };

  it("strips NUL and keeps the rest", () => {
    expect(nameOf("re\u0000sume.pdf")).toBe("resume.pdf");
  });

  it("strips a lone high surrogate and a lone low surrogate", () => {
    expect(nameOf("cv\ud800.pdf")).toBe("cv.pdf");
    expect(nameOf("cv\udc00.pdf")).toBe("cv.pdf");
  });

  it("keeps a valid surrogate pair (an emoji)", () => {
    expect(nameOf("cv 😀.pdf")).toBe("cv 😀.pdf");
  });

  it("strips bell, ESC and DEL", () => {
    expect(nameOf("a\u0007b\u001bc\u007fd.pdf")).toBe("abcd.pdf");
  });

  it("strips a right-to-left override that could disguise the extension", () => {
    expect(nameOf("cv\u202E.pdf")).toBe("cv.pdf");
    expect(parse("cv\u202Efdp.exe").success).toBe(false);
  });

  it("keeps a normal non-Latin name and normalises it to NFC", () => {
    expect(nameOf("履歴書 田中.pdf")).toBe("履歴書 田中.pdf");
    expect(nameOf("Résumé.pdf")).toBe("Résumé.pdf");
  });

  it("answers with a field error when nothing printable remains", () => {
    for (const name of ["\u0000", "\u0000\u0007", "\ud800", "  ", "‮"]) {
      const result = parse(name);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path[0]).toBe("file_name");
    }
  });

  it("refuses a name that is too long, before or after cleaning", () => {
    expect(parse("a".repeat(256)).success).toBe(false);
    expect(parse("a".repeat(5000)).success).toBe(false);
    expect(parse(`${"a".repeat(251)}.pdf\u0000`).success).toBe(true);
  });
});
