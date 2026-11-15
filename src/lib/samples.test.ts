import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkAts } from "@/lib/ats/check-ats";
import type { AtsCheckId } from "@/lib/config";
import { extractText } from "@/lib/resumes/extract-text";
import { SAMPLE_JOB_DESCRIPTION, SAMPLE_RESUMES, SAMPLE_ZIP } from "./samples";

const DIR = path.resolve(import.meta.dirname, "../../public/samples");
const PDF = "application/pdf";

const read = (file: string) => readFileSync(path.join(DIR, file));

/** The checks each sample must fail; an empty list means it must be ATS-ready. */
const EXPECTED_FAILURES: Record<string, AtsCheckId[]> = {
  "6-no-email-no-phone.pdf": ["contact_info", "phone"],
  "7-with-photo.pdf": ["picture"],
};

describe("sample files", () => {
  it("lists exactly the files on disk", () => {
    const listed = [...SAMPLE_RESUMES.map((sample) => sample.file), SAMPLE_JOB_DESCRIPTION, SAMPLE_ZIP];
    expect(readdirSync(DIR).sort()).toEqual(listed.sort());
  });

  it("packs every sample into the zip", () => {
    const zip = read(SAMPLE_ZIP).toString("latin1");
    for (const name of [...SAMPLE_RESUMES.map((sample) => sample.file), SAMPLE_JOB_DESCRIPTION]) {
      expect(zip).toContain(name);
    }
  });

  it("keeps every email address in the text files on example.com", () => {
    const text = read(SAMPLE_JOB_DESCRIPTION).toString("utf8");
    for (const address of text.match(/[^\s@]+@[^\s@]+/g) ?? []) {
      expect(address.toLowerCase()).toMatch(/@example\.com$/);
    }
  });

  it.each(SAMPLE_RESUMES.map((sample) => sample.file))("%s gets the expected pre-screen result", async (file) => {
    const bytes = new Uint8Array(read(file));
    const { text, imageCount } = await extractText(bytes, "pdf");
    for (const address of text.match(/[^\s@]+@[^\s@]+\.[a-z]+/gi) ?? []) {
      expect(address.toLowerCase()).toMatch(/@example\.com$/);
    }

    const result = checkAts({ text, imageCount, contentType: PDF, sizeBytes: 0 });
    const failed = result.checks.filter((check) => !check.passed).map((check) => check.id);
    const expected = EXPECTED_FAILURES[file] ?? [];
    expect(failed).toEqual(expected);
    expect(result.status).toBe(expected.length === 0 ? "ATS_READY" : "NOT_ATS_READY");
  });
});
