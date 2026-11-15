import { describe, expect, it } from "vitest";
import { makeDocx, makePdf, makeZip } from "../../../test/fixtures";
import { detectKind } from "./sniff";

const text = (value: string) => new TextEncoder().encode(value);

function withPrefix(prefix: Uint8Array, bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(prefix.length + bytes.length);
  out.set(prefix);
  out.set(bytes, prefix.length);
  return out;
}

describe("detectKind", () => {
  it("recognises a PDF by its header", () => {
    expect(detectKind(makePdf(["Hello"]))).toBe("pdf");
  });

  it("accepts a PDF with a byte-order mark before the header", () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    expect(detectKind(withPrefix(bom, makePdf(["Hello"])))).toBe("pdf");
  });

  it("accepts a PDF with blank lines or junk before the header", () => {
    expect(detectKind(withPrefix(text("\n\r\n  "), makePdf(["Hello"])))).toBe("pdf");
    expect(detectKind(withPrefix(text("junk".repeat(100)), makePdf(["Hello"])))).toBe("pdf");
  });

  it("does not look for the PDF header past the first 1024 bytes", () => {
    expect(detectKind(withPrefix(new Uint8Array(1100).fill(0x20), makePdf(["Hello"])))).toBeNull();
  });

  it("recognises a DOCX: a zip that holds word/document.xml", () => {
    expect(detectKind(makeDocx(["Hello"]))).toBe("docx");
  });

  it("rejects a zip without word/document.xml", () => {
    const zip = makeZip([{ name: "notes.txt", data: text("hi") }]);
    expect(detectKind(zip)).toBeNull();
  });

  it("rejects plain text, empty input and a truncated header", () => {
    expect(detectKind(text("just text"))).toBeNull();
    expect(detectKind(new Uint8Array())).toBeNull();
    expect(detectKind(text("%PD"))).toBeNull();
  });
});
