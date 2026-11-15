import { describe, expect, it } from "vitest";
import { isAllowedMimeType, safeFileName, storagePath } from "./files";

describe("safeFileName", () => {
  it("keeps a plain name", () => {
    expect(safeFileName("Jane Doe CV.pdf")).toBe("Jane_Doe_CV.pdf");
  });

  it("drops folders, both kinds of slash", () => {
    expect(safeFileName("../../etc/passwd.pdf")).toBe("passwd.pdf");
    expect(safeFileName("C:\\Users\\me\\cv.docx")).toBe("cv.docx");
  });

  it("removes control characters and non-ASCII characters", () => {
    expect(safeFileName("re\u0000su\u001fme\n.pdf")).toBe("re_su_me.pdf");
    expect(safeFileName("Résumé ✨.pdf")).toBe("Resume.pdf");
  });

  it("caps the length and keeps the extension", () => {
    const name = safeFileName(`${"a".repeat(300)}.docx`);
    expect(name).toHaveLength(100);
    expect(name.endsWith(".docx")).toBe(true);
  });

  it("falls back to a default stem", () => {
    expect(safeFileName("...")).toBe("resume");
    expect(safeFileName("✨✨.pdf")).toBe("resume.pdf");
    expect(safeFileName("")).toBe("resume");
  });

  it("never contains a slash or a dot-dot", () => {
    for (const input of ["a/b", "..", "a\..\b.pdf", "%2e%2e/x.pdf"]) {
      expect(safeFileName(input)).not.toMatch(/[\/]|\.\./);
    }
  });
});

describe("storagePath", () => {
  it("is job / resume / sanitised name", () => {
    expect(storagePath("job-1", "res-1", "My CV.pdf")).toBe("job-1/res-1/My_CV.pdf");
  });
});

describe("isAllowedMimeType", () => {
  it("accepts PDF and DOCX only", () => {
    expect(isAllowedMimeType("application/pdf")).toBe(true);
    expect(
      isAllowedMimeType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
    expect(isAllowedMimeType("text/plain")).toBe(false);
    expect(isAllowedMimeType("application/msword")).toBe(false);
  });
});
