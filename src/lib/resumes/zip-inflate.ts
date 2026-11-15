import { crc32, inflateRawSync } from "node:zlib";

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_ENTRY = 0x02014b50;
const END_RECORD = 0x06054b50;
const LOCAL_FIXED = 30;
const CENTRAL_FIXED = 46;
const END_FIXED = 22;
const MAX_COMMENT = 0xffff;
const ZIP64_COUNT = 0xffff;
const STORED = 0;
const DEFLATED = 8;
/** General-purpose flag bit 11: entry names are UTF-8. */
const NAMES_ARE_UTF8 = 0x0800;

/** The archive cannot be read: no directory, a broken entry, or a feature this reader does not handle. */
export class ZipUnreadableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "ZipUnreadableError";
  }
}

/** The archive holds more entries or more bytes than the limits allow. */
export class ZipTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipTooLargeError";
  }
}

/** An entry's real inflated size is not the size its directory declares. */
export class ZipMalformedError extends Error {
  constructor() {
    super("An entry's size differs from its declared size");
    this.name = "ZipMalformedError";
  }
}

/** The caps `readZipParts` enforces while it inflates an untrusted archive. */
export type ZipLimits = {
  /** Most entries the directory may list. */
  entries: number;
  /** Most bytes all markup entries (the ones a parser could read) may inflate to together. */
  markupBytes: number;
  /** Most bytes all entries may inflate to together. */
  totalBytes: number;
};

/** One inflated entry: its raw name bytes and its data. */
export type ZipPart = { name: Uint8Array; data: Uint8Array };

/** What a checked archive holds: its markup parts, and the raw name of every entry in directory order. */
export type ZipContents = { parts: ZipPart[]; names: Uint8Array[] };

type Entry = {
  name: Uint8Array;
  method: number;
  compressedSize: number;
  declaredSize: number;
  localOffset: number;
};

function readEntries(bytes: Uint8Array, maxEntries: number): Entry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  const lowest = Math.max(0, bytes.length - END_FIXED - MAX_COMMENT);
  for (let at = bytes.length - END_FIXED; at >= lowest; at -= 1) {
    if (view.getUint32(at, true) === END_RECORD) {
      end = at;
      break;
    }
  }
  if (end < 0) throw new ZipUnreadableError("No zip directory");

  const count = view.getUint16(end + 10, true);
  // 0xFFFF means zip64, which no resume needs: more entries than any limit here.
  if (count === ZIP64_COUNT || count > maxEntries) throw new ZipTooLargeError("Too many entries");

  let at = view.getUint32(end + 16, true);
  const entries: Entry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (at + CENTRAL_FIXED > bytes.length || view.getUint32(at, true) !== CENTRAL_ENTRY) {
      throw new ZipUnreadableError("Bad zip directory");
    }
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    entries.push({
      name: bytes.subarray(at + CENTRAL_FIXED, at + CENTRAL_FIXED + nameLength),
      method: view.getUint16(at + 10, true),
      compressedSize: view.getUint32(at + 20, true),
      declaredSize: view.getUint32(at + 24, true),
      localOffset: view.getUint32(at + 42, true),
    });
    at += CENTRAL_FIXED + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** The entry's bytes, inflated to exactly its declared size or not at all. */
function inflateEntry(bytes: Uint8Array, view: DataView, entry: Entry): Uint8Array {
  const header = entry.localOffset;
  if (header + LOCAL_FIXED > bytes.length || view.getUint32(header, true) !== LOCAL_HEADER) {
    throw new ZipUnreadableError("Bad local header");
  }
  const start =
    header + LOCAL_FIXED + view.getUint16(header + 26, true) + view.getUint16(header + 28, true);
  const slice = bytes.subarray(start, start + entry.compressedSize);
  if (slice.length !== entry.compressedSize) throw new ZipUnreadableError("Truncated entry");

  if (entry.method === STORED) {
    if (slice.length !== entry.declaredSize) throw new ZipMalformedError();
    return slice;
  }
  if (entry.method !== DEFLATED) {
    throw new ZipUnreadableError(`Unsupported compression method ${entry.method}`);
  }

  let inflated: Uint8Array;
  try {
    // The declared size is the output cap, so an entry that under-declares is
    // stopped there instead of being inflated whole.
    inflated = inflateRawSync(slice, { maxOutputLength: Math.max(entry.declaredSize, 1) });
  } catch (error) {
    if (error instanceof RangeError) throw new ZipMalformedError();
    throw new ZipUnreadableError("An entry does not inflate", error);
  }
  if (inflated.length !== entry.declaredSize) throw new ZipMalformedError();
  return inflated;
}

const LESS_THAN = 0x3c;
/** Bytes that may come before the first `<` of an XML part: byte-order marks, NUL (UTF-16) and white space. */
const BEFORE_MARKUP = new Set([0xef, 0xbb, 0xbf, 0xff, 0xfe, 0x00, 0x09, 0x0a, 0x0d, 0x20]);
const MARKUP_PROBE = 8;

/** Whether the data starts like XML. Anything else (an image, a font) is not handed to a parser. */
function isMarkup(data: Uint8Array): boolean {
  for (let at = 0; at < Math.min(data.length, MARKUP_PROBE); at += 1) {
    if (data[at] === LESS_THAN) return true;
    if (!BEFORE_MARKUP.has(data[at])) return false;
  }
  return false;
}

/**
 * Inflates every entry of the zip under the limits and returns the markup
 * entries (the XML parts), which are all a text reader needs.
 *
 * - The directory's own numbers are checked first: too many entries, or a
 *   declared total over `totalBytes`, is `ZipTooLargeError` with nothing inflated.
 * - Each entry is inflated with its declared size as the output cap and must
 *   come out at exactly that size. An archive that under- or over-declares is
 *   `ZipMalformedError` whatever its real size, so it can never be inflated
 *   past what the directory check allowed.
 * - Markup entries together may hold at most `markupBytes`. Entries that do not
 *   start like XML (images, fonts) are checked and dropped, so a parser given
 *   the result cannot read them, whatever the document's relationships name.
 * - The names of all entries, markup or not, are returned only once every
 *   entry has passed these checks, so a caller that counts entries (pictures)
 *   never sees an archive the limits refused.
 */
export function readZipParts(bytes: Uint8Array, limits: ZipLimits): ZipContents {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = readEntries(bytes, limits.entries);

  const declared = entries.reduce((sum, entry) => sum + entry.declaredSize, 0);
  if (declared > limits.totalBytes) throw new ZipTooLargeError("Declared size over the total limit");

  const parts: ZipPart[] = [];
  let markupBytes = 0;
  for (const entry of entries) {
    const data = inflateEntry(bytes, view, entry);
    if (!isMarkup(data)) continue;
    markupBytes += data.length;
    if (markupBytes > limits.markupBytes) throw new ZipTooLargeError("Markup over the limit");
    parts.push({ name: entry.name, data });
  }
  return { parts, names: entries.map((entry) => entry.name) };
}

/** A zip archive holding `parts` uncompressed, for a parser that only takes an archive. */
export function storedZip(parts: readonly ZipPart[]): Uint8Array {
  const directorySize = parts.reduce((sum, part) => sum + CENTRAL_FIXED + part.name.length, 0);
  const dataSize = parts.reduce((sum, part) => sum + LOCAL_FIXED + part.name.length + part.data.length, 0);
  const out = new Uint8Array(dataSize + directorySize + END_FIXED);
  const view = new DataView(out.buffer);

  let at = 0;
  let directoryAt = dataSize;
  for (const { name, data } of parts) {
    const checksum = crc32(data);
    view.setUint32(at, LOCAL_HEADER, true);
    view.setUint16(at + 4, 20, true);
    view.setUint16(at + 6, NAMES_ARE_UTF8, true);
    view.setUint32(at + 14, checksum, true);
    view.setUint32(at + 18, data.length, true);
    view.setUint32(at + 22, data.length, true);
    view.setUint16(at + 26, name.length, true);
    out.set(name, at + LOCAL_FIXED);
    out.set(data, at + LOCAL_FIXED + name.length);

    view.setUint32(directoryAt, CENTRAL_ENTRY, true);
    view.setUint16(directoryAt + 4, 20, true);
    view.setUint16(directoryAt + 6, 20, true);
    view.setUint16(directoryAt + 8, NAMES_ARE_UTF8, true);
    view.setUint32(directoryAt + 16, checksum, true);
    view.setUint32(directoryAt + 20, data.length, true);
    view.setUint32(directoryAt + 24, data.length, true);
    view.setUint16(directoryAt + 28, name.length, true);
    view.setUint32(directoryAt + 42, at, true);
    out.set(name, directoryAt + CENTRAL_FIXED);

    at += LOCAL_FIXED + name.length + data.length;
    directoryAt += CENTRAL_FIXED + name.length;
  }

  view.setUint32(directoryAt, END_RECORD, true);
  view.setUint16(directoryAt + 8, parts.length, true);
  view.setUint16(directoryAt + 10, parts.length, true);
  view.setUint32(directoryAt + 12, directorySize, true);
  view.setUint32(directoryAt + 16, dataSize, true);
  return out;
}
