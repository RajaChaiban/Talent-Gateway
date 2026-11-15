import type { ResumeKind } from "./files";

const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04
const DOCX_PART = [...new TextEncoder().encode("word/document.xml")];

/** Readers accept the PDF header anywhere in the first 1024 bytes (a BOM or blank lines may precede it). */
export const PDF_HEADER_WINDOW = 1024;

function matchesAt(bytes: Uint8Array, signature: readonly number[], at: number): boolean {
  if (at + signature.length > bytes.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[at + i] !== signature[i]) return false;
  }
  return true;
}

function indexOfSequence(bytes: Uint8Array, signature: readonly number[], limit = bytes.length): number {
  const last = Math.min(limit, bytes.length) - signature.length;
  const first = signature[0];
  for (let at = 0; at <= last; at += 1) {
    if (bytes[at] === first && matchesAt(bytes, signature, at)) return at;
  }
  return -1;
}

/**
 * The real type of a file from its bytes: a `%PDF-` header in the first
 * 1024 bytes, or a zip that holds `word/document.xml`. The name and the
 * declared type are never trusted.
 */
export function detectKind(bytes: Uint8Array): ResumeKind | null {
  if (indexOfSequence(bytes, PDF_HEADER, PDF_HEADER_WINDOW) >= 0) return "pdf";
  if (matchesAt(bytes, ZIP_SIGNATURE, 0) && indexOfSequence(bytes, DOCX_PART) >= 0) return "docx";
  return null;
}
