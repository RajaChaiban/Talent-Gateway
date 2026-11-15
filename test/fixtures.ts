import { crc32, deflateRawSync } from "node:zlib";

const encoder = new TextEncoder();

/** A one-page PDF whose content stream shows `lines`, one per row. Invented text only. */
export function makePdf(lines: readonly string[]): Uint8Array {
  const escape = (line: string) => line.replace(/[\\()]/g, (char) => `\\${char}`);
  const stream = `BT /F1 12 Tf 14 TL 72 720 Td ${lines
    .map((line) => `(${escape(line)}) Tj T*`)
    .join(" ")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return encoder.encode(pdf);
}

export type ZipEntry = {
  name: string;
  data: Uint8Array;
  /** Store the entry deflated. */
  deflate?: boolean;
  /** The inflated size the directory claims, to build an archive that lies about it. */
  declaredSize?: number;
};

/** A zip archive with stored (uncompressed) entries, enough for a DOCX fixture. */
export function makeZip(entries: readonly ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const { name, data: plain, deflate, declaredSize } of entries) {
    const nameBytes = encoder.encode(name);
    const crc = crc32(plain);
    const data = deflate ? new Uint8Array(deflateRawSync(plain)) : plain;
    const method = deflate ? 8 : 0;
    const size = declaredSize ?? plain.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, method, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, size, true);
    local.setUint16(26, nameBytes.length, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(10, method, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, size, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const parts = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function xml(body: string): Uint8Array {
  return encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body}`);
}

const WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** `word/document.xml` with `body` inside its `w:body`. */
export function documentXml(body: string): Uint8Array {
  return xml(`<w:document xmlns:w="${WORD_NAMESPACE}"><w:body>${body}</w:body></w:document>`);
}

/** One paragraph of Word markup holding `text`. */
export function paragraphXml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<w:p><w:r><w:t>${escaped}</w:t></w:r></w:p>`;
}

/** The package parts every DOCX needs. `mainPart` is where the package says the document is. */
export function packageEntries(mainPart = "word/document.xml"): ZipEntry[] {
  return [
    {
      name: "[Content_Types].xml",
      data: xml(
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
    },
    {
      name: "_rels/.rels",
      data: xml(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${mainPart}"/></Relationships>`,
      ),
    },
  ];
}

/** A minimal Word document with one paragraph per line. Invented text only. */
export function makeDocx(paragraphs: readonly string[]): Uint8Array {
  return makeZip([
    ...packageEntries(),
    { name: "word/document.xml", data: documentXml(paragraphs.map(paragraphXml).join("")) },
  ]);
}
