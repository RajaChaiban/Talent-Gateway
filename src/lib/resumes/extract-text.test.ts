import { describe, expect, it, vi } from "vitest";
import { RESUME_LIMITS, UPLOAD_LIMITS } from "@/lib/config";
import {
  documentXml,
  makeDocx,
  makePdf,
  makeZip,
  packageEntries,
  paragraphXml,
} from "../../../test/fixtures";
import {
  docxImageCount,
  docxParts,
  ExtractionError,
  extractText,
  imagePaintOps,
  normalizeText,
  readPdfPages,
  REASONS,
  type PdfLike,
  type TextReader,
} from "./extract-text";

// The parsers are loaded before any test starts, so a slow first load of the
// library on a busy machine is never counted against a test's own time.
await Promise.all([import("mammoth"), import("unpdf")]);

describe("extractText", () => {
  it("reads the text of a PDF", async () => {
    const { text, imageCount } = await extractText(
      makePdf(["Avery Example", "Backend engineer with six years of experience"]),
      "pdf",
    );
    expect(text).toContain("Avery Example");
    expect(text).toContain("Backend engineer with six years of experience");
    expect(imageCount).toBe(0);
  });

  it("reads the paragraphs of a DOCX", async () => {
    const { text, imageCount } = await extractText(makeDocx(["Sam Sample", "Skills: TypeScript & SQL"]), "docx");
    expect(text).toBe("Sam Sample\n\nSkills: TypeScript & SQL");
    expect(imageCount).toBe(0);
  });

  it("returns an empty string for a PDF with no text", async () => {
    await expect(extractText(makePdf([]), "pdf")).resolves.toEqual({ text: "", imageCount: 0 });
  });

  it("counts the pictures a PDF draws, and still reads its text", async () => {
    const one = await extractText(makePdf(["Avery Example"], { images: 1 }), "pdf");
    expect(one).toEqual({ text: "Avery Example", imageCount: 1 });
    const three = await extractText(makePdf(["Avery Example"], { images: 3 }), "pdf");
    expect(three.imageCount).toBe(3);
  });

  it("fails a corrupt PDF with a readable reason", async () => {
    const corrupt = new TextEncoder().encode("%PDF-1.4\nthis is not really a pdf");
    await expect(extractText(corrupt, "pdf")).rejects.toMatchObject({
      name: "ExtractionError",
      failure: "unreadable",
      reason: REASONS.unreadable,
    });
  });

  it("fails a corrupt DOCX", async () => {
    const corrupt = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
    await expect(extractText(corrupt, "docx")).rejects.toBeInstanceOf(ExtractionError);
  });

  it("refuses a file over the size limit without reading it", async () => {
    const big = new Uint8Array(UPLOAD_LIMITS.maxBytes + 1);
    await expect(extractText(big, "pdf")).rejects.toMatchObject({ failure: "too_large" });
  });
});

describe("normalizeText", () => {
  it("drops NUL, collapses spaces and blank lines, trims", () => {
    expect(normalizeText("  a\u0000b \t c \r\n\r\n\r\n\r\n d  ")).toBe("ab c\n\nd");
  });
});

describe("the time guard", () => {
  const slow: TextReader = () =>
    new Promise((resolve) => setTimeout(() => resolve({ text: "late", imageCount: 0 }), 200));

  it("abandons a slow read after the timeout and says it took too long", async () => {
    await expect(extractText(new Uint8Array([1]), "pdf", { timeoutMs: 20, reader: slow })).rejects.toMatchObject({
      failure: "timeout",
      reason: REASONS.timeout,
    });
  });

  it("returns the text and picture count of a read that finishes in time", async () => {
    const quick: TextReader = async () => ({ text: "  fine  ", imageCount: 2 });
    await expect(extractText(new Uint8Array([1]), "pdf", { reader: quick })).resolves.toEqual({
      text: "fine",
      imageCount: 2,
    });
  });
});

describe("readPdfPages", () => {
  /** Stand-in operator codes: 85 paints an image, 44 shows text. */
  const PAINT = 85;
  const SHOW_TEXT = 44;
  const IMAGE_OPS = new Set([PAINT]);
  const pages = (count: number, delayMs = 0, fnArray: number[] = [SHOW_TEXT]): PdfLike => ({
    numPages: count,
    getPage: async () => {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return {
        getTextContent: async () => ({ items: [{ str: "text", hasEOL: true }] }),
        getOperatorList: async () => ({ fnArray }),
      };
    },
  });

  it("joins pages and keeps line ends", async () => {
    await expect(readPdfPages(pages(2), Date.now() + 1000, IMAGE_OPS)).resolves.toEqual({
      text: "text\n\n\ntext\n",
      imageCount: 0,
    });
  });

  it("counts every image-painting operation on every page", async () => {
    const result = await readPdfPages(pages(3, 0, [SHOW_TEXT, PAINT, SHOW_TEXT, PAINT]), Date.now() + 1000, IMAGE_OPS);
    expect(result.imageCount).toBe(6);
  });

  it("refuses a PDF with too many pages before reading any", async () => {
    const getPage = vi.fn();
    await expect(
      readPdfPages({ numPages: RESUME_LIMITS.maxPdfPages + 1, getPage }, Date.now() + 1000, IMAGE_OPS),
    ).rejects.toMatchObject({ failure: "too_complex" });
    expect(getPage).not.toHaveBeenCalled();
  });

  it("stops at the deadline between pages instead of reading on", async () => {
    await expect(
      readPdfPages(pages(RESUME_LIMITS.maxPdfPages, 15), Date.now() + 40, IMAGE_OPS),
    ).rejects.toMatchObject({
      failure: "timeout",
      reason: "Reading the file took too long.",
    });
  });

  it("fails the whole read as unreadable when a page's pictures cannot be counted", async () => {
    const broken: PdfLike = {
      numPages: 1,
      getPage: async () => ({
        getTextContent: async () => ({ items: [{ str: "text", hasEOL: true }] }),
        getOperatorList: async () => {
          throw new Error("bad content stream");
        },
      }),
    };
    const reader: TextReader = (_bytes, deadline) => readPdfPages(broken, deadline, IMAGE_OPS);
    await expect(extractText(new Uint8Array([1]), "pdf", { reader })).rejects.toMatchObject({
      failure: "unreadable",
      reason: REASONS.unreadable,
    });
  });
});

describe("imagePaintOps", () => {
  it("takes every picture-painting operation from the pdf.js table and leaves out the solid-fill mask", async () => {
    const { getResolvedPDFJS } = await import("unpdf");
    const { OPS } = await getResolvedPDFJS();
    const ops = imagePaintOps(OPS);
    expect([...ops].toSorted((a, b) => a - b)).toEqual(
      [
        OPS.paintImageXObject,
        OPS.paintImageXObjectRepeat,
        OPS.paintInlineImageXObject,
        OPS.paintInlineImageXObjectGroup,
        OPS.paintImageMaskXObject,
        OPS.paintImageMaskXObjectGroup,
        OPS.paintImageMaskXObjectRepeat,
      ].toSorted((a, b) => a - b),
    );
    expect(ops.size).toBe(7);
    expect(ops.has(OPS.paintSolidColorImageMask)).toBe(false);
    expect(ops.has(OPS.showText)).toBe(false);
  });
});

describe("DOCX limits", () => {
  const LIMITS = { entries: 10, markupBytes: 100_000, totalBytes: 1_000_000 };
  const text = (value: string) => new TextEncoder().encode(value);
  const names = (bytes: Uint8Array, limits = LIMITS) =>
    docxParts(bytes, limits).parts.map((part) => new TextDecoder().decode(part.name));
  /** Markup of about `bytes` bytes that deflates to almost nothing. */
  const markup = (bytes: number) => text("<w:p/>".repeat(Math.ceil(bytes / 6)));
  const failure = (bytes: Uint8Array, limits = LIMITS) => {
    try {
      docxParts(bytes, limits);
    } catch (error) {
      return error instanceof ExtractionError ? error.failure : error;
    }
    return "accepted";
  };

  it("returns the XML parts of an ordinary DOCX", () => {
    expect(names(makeDocx(["Hello"]))).toEqual(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]);
  });

  it("refuses a zip bomb by its declared inflated size, before inflating", async () => {
    const copy = new Uint8Array(makeDocx(["Hello"]));
    const view = new DataView(copy.buffer);
    for (let at = 0; at + 4 < copy.length; at += 1) {
      if (view.getUint32(at, true) === 0x02014b50) {
        view.setUint32(at + 24, 0xffffff00, true);
        break;
      }
    }
    await expect(extractText(copy, "docx")).rejects.toMatchObject({
      failure: "too_complex",
      reason: REASONS.too_complex,
    });
  });

  it("refuses a zip with too many entries", async () => {
    const many = makeZip(
      Array.from({ length: RESUME_LIMITS.maxDocxEntries + 1 }, (_, i) => ({
        name: i === 0 ? "word/document.xml" : `part-${i}.xml`,
        data: new Uint8Array([1]),
      })),
    );
    await expect(extractText(many, "docx")).rejects.toMatchObject({ failure: "too_complex" });
  });

  it("calls a zip with no readable directory unreadable", () => {
    expect(failure(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toBe("unreadable");
  });

  it("refuses an honest document.xml over the XML cap as too long or too complex", () => {
    const big = makeZip([{ name: "word/document.xml", data: markup(150_000), deflate: true }]);
    expect(big.length).toBeLessThan(5_000);
    expect(failure(big)).toBe("too_complex");
  });

  it("caps the XML parts together, not each one alone", () => {
    const parts = makeZip(
      Array.from({ length: 5 }, (_, i) => ({
        name: i === 0 ? "word/document.xml" : `word/part-${i}.xml`,
        data: markup(30_000),
        deflate: true,
      })),
    );
    expect(failure(parts)).toBe("too_complex");
  });

  it("refuses an archive whose entries together declare more than the total", () => {
    const pictures = makeZip([
      { name: "word/document.xml", data: markup(600) },
      { name: "word/media/a.png", data: new Uint8Array(600_000).fill(7) },
      { name: "word/media/b.png", data: new Uint8Array(600_000).fill(7) },
    ]);
    expect(failure(pictures)).toBe("too_complex");
  });

  it("checks a picture against the total only and never hands it to the parser", () => {
    const withPicture = makeZip([
      { name: "word/document.xml", data: markup(600) },
      { name: "word/media/photo.jpg", data: new Uint8Array(300_000).fill(0xd8), deflate: true },
    ]);
    expect(names(withPicture)).toEqual(["word/document.xml"]);
  });

  it("the real limits: XML capped at 512 KB, everything at 8 MB", () => {
    expect(RESUME_LIMITS.maxDocxMarkupBytes).toBe(512 * 1024);
    expect(RESUME_LIMITS.maxDocxUncompressedBytes).toBe(8 * 1024 * 1024);
  });

  it("refuses a document.xml just over the real cap as too long or too complex", async () => {
    const over = makeZip([
      ...packageEntries(),
      { name: "word/document.xml", data: markup(RESUME_LIMITS.maxDocxMarkupBytes), deflate: true },
    ]);
    await expect(extractText(over, "docx")).rejects.toMatchObject({
      failure: "too_complex",
      reason: "The file is too long or too complex to read.",
    });
  });
});

describe("DOCX whose entries are not the size they declare", () => {
  const LIMITS = { entries: 10, markupBytes: 100_000, totalBytes: 1_000_000 };
  const zeros = (bytes: number) => new Uint8Array(bytes);
  const lying = (inflated: number, declaredSize: number) =>
    makeZip([
      ...packageEntries(),
      { name: "word/document.xml", data: zeros(inflated), deflate: true, declaredSize },
    ]);
  const malformed = expect.objectContaining({ failure: "malformed", reason: REASONS.malformed });

  it("says the same thing whether the entry under-declares inside the limits or far past them", () => {
    expect(() => docxParts(lying(50_000, 1024), LIMITS)).toThrowError(malformed);
    expect(() => docxParts(lying(4_000_000, 1024), LIMITS)).toThrowError(malformed);
    expect(REASONS.malformed).toBe("The file is damaged: its contents do not match the sizes it declares.");
  });

  it("is off by one byte either way", () => {
    expect(() => docxParts(lying(2000, 1999), LIMITS)).toThrowError(malformed);
    expect(() => docxParts(lying(2000, 2001), LIMITS)).toThrowError(malformed);
    expect(() => docxParts(lying(2000, 2000), LIMITS)).not.toThrow();
  });

  it("stops inflating at the declared size instead of inflating the whole entry", () => {
    const bomb = lying(4_000_000, 1024);
    expect(bomb.length).toBeLessThan(20_000);
    const before = process.memoryUsage().arrayBuffers;
    expect(() => docxParts(bomb, LIMITS)).toThrowError(malformed);
    expect(process.memoryUsage().arrayBuffers - before).toBeLessThan(1_000_000);
  });

  it("treats a stored entry the same way", () => {
    const stored = makeZip([{ name: "word/document.xml", data: zeros(200_000), declaredSize: 1 }]);
    expect(() => docxParts(stored, LIMITS)).toThrowError(malformed);
  });

  it("reports it through extractText with the real limits", async () => {
    await expect(extractText(lying(50_000, 1024), "docx")).rejects.toMatchObject({
      failure: "malformed",
      reason: REASONS.malformed,
    });
  });

  it("calls an entry that does not inflate unreadable", () => {
    const name = "word/document.xml";
    const broken = new Uint8Array(
      makeZip([{ name, data: new TextEncoder().encode("hello hello hello"), deflate: true }]),
    );
    broken.fill(0xff, 30 + name.length, 30 + name.length + 4);
    expect(() => docxParts(broken, LIMITS)).toThrowError(expect.objectContaining({ failure: "unreadable" }));
  });
});

describe("what reaches the Word parser", () => {
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const picture = (bytes: number) => {
    const data = new Uint8Array(bytes).fill(0x5a);
    data.set(PNG);
    return data;
  };

  it("reads a document that has a picture, without the picture", async () => {
    const drawing =
      '<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="rId7" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
    const docx = makeZip([
      ...packageEntries(),
      { name: "word/document.xml", data: documentXml(paragraphXml("Sam Sample") + drawing + paragraphXml("Engineer")) },
      {
        name: "word/_rels/document.xml.rels",
        data: new TextEncoder().encode(
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>',
        ),
      },
      { name: "word/media/image1.png", data: picture(700_000) },
    ]);
    const { text, imageCount } = await extractText(docx, "docx");
    expect(text).toContain("Sam Sample");
    expect(text).toContain("Engineer");
    expect(imageCount).toBe(1);
  });

  it("cannot be pointed at a large entry dressed as a picture", async () => {
    const hidden = picture(2_000_000);
    hidden.set(documentXml(paragraphXml("hidden").repeat(20_000)).subarray(0, 1_900_000), PNG.length);
    const docx = makeZip([
      ...packageEntries("word/media/image1.png"),
      { name: "word/document.xml", data: documentXml("") },
      { name: "word/media/image1.png", data: hidden, deflate: true },
    ]);
    const { text, imageCount } = await extractText(docx, "docx");
    expect(text).toBe("");
    expect(imageCount).toBe(1);
  });

  it("rebuilds an archive that reads back to the same parts", async () => {
    const { readZipParts, storedZip } = await import("./zip-inflate");
    const limits = { entries: 10, markupBytes: 100_000, totalBytes: 100_000 };
    const { parts } = readZipParts(makeDocx(["Sam Sample", "Ünïcode"]), limits);
    const again = readZipParts(storedZip(parts), limits);
    expect(again.parts).toEqual(parts);
  });
});

describe("DOCX picture count", () => {
  const LIMITS = { entries: 10, markupBytes: 100_000, totalBytes: 1_000_000 };
  const bytes = (count: number) => new Uint8Array(count).fill(0x5a);
  const docxWith = (media: readonly string[]) =>
    makeZip([
      ...packageEntries(),
      { name: "word/document.xml", data: documentXml(paragraphXml("Sam Sample")) },
      ...media.map((name) => ({ name, data: bytes(500), deflate: true })),
    ]);

  it("counts the files under word/media/", async () => {
    const docx = docxWith(["word/media/image1.png", "word/media/image2.jpeg"]);
    expect(docxImageCount(docxParts(docx, LIMITS))).toBe(2);
    await expect(extractText(docx, "docx")).resolves.toEqual({ text: "Sam Sample", imageCount: 2 });
  });

  it("is zero for a DOCX with no media folder", () => {
    expect(docxImageCount(docxParts(makeDocx(["Sam Sample"]), LIMITS))).toBe(0);
  });

  it("ignores folder entries, files elsewhere and look-alike folders, and any letter case", () => {
    const docx = docxWith([
      "word/media/",
      "Word/Media/photo.PNG",
      "word/mediafiles/logo.png",
      "media/image1.png",
      "word/embeddings/sheet.bin",
    ]);
    expect(docxImageCount(docxParts(docx, LIMITS))).toBe(1);
  });

  it("does not count anything when the archive breaks a limit", () => {
    const many = docxWith(Array.from({ length: 10 }, (_, index) => `word/media/image${index}.png`));
    expect(() => docxParts(many, LIMITS)).toThrowError(expect.objectContaining({ failure: "too_complex" }));
  });
});
