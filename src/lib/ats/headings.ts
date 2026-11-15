import type { AtsConfig } from "@/lib/config";

/**
 * Finds which required sections appear as headings.
 *
 * Lines are split on CR, LF, U+0085, U+2028 and U+2029. The text is scanned once for line
 * breaks, and a line is only sliced out when it can be a heading, so a megabyte of ordinary
 * lines allocates almost nothing.
 *
 * A line is a heading when:
 * 1. Before its first letter there is only decoration: spaces, markdown "#", emphasis "*"
 *    and "_", ">", bullets, dashes, a number like "1." or "2)", zero-width characters.
 * 2. After its last letter there is only decoration: spaces, "*", "_", "#", colons, periods,
 *    dashes, bullets ("Skills:", "Experience.", "**Skills**", "Skills —").
 * 3. Between them there are only letters, combining marks, spaces and "&", "/", "," and "-"
 *    (zero-width characters and soft hyphens are ignored, so "Exper\u200Bience" matches).
 *    Digits and other punctuation disqualify the line ("Skills: Python, SQL", "Skills 2024").
 * 4. That text is at most maxHeadingChars long.
 * 5. Letter-spaced capitals are joined: "S K I L L S" becomes "SKILLS" (two or more spaces
 *    separate words).
 * 6. Lower-cased, with "&" read as "and", the text is a known variant of a section, or it is
 *    two or more known variants joined by "&", "/", "and", "et", "y" or "und" ("Professional
 *    Experience & Education", "Education / Skills"), every part being a variant. A sentence
 *    or two unrelated words therefore never matches.
 *
 * The text must already be NFC-normalised so decomposed accents match precomposed variants.
 */

const ZERO_WIDTH = /[\u00AD\u200B-\u200D\u2060\uFEFF]/gu;
const ALLOWED_PREFIX = /^(?:[\s#*_>\p{Pd}•·▪■►●◦\u00AD\u200B-\u200D\u2060\uFEFF]|\d{1,2}[.)])*$/u;
const ALLOWED_SUFFIX = /^[\s#*_:：.\p{Pd}•·\u00AD\u200B-\u200D\u2060\uFEFF]*$/u;
const LETTER_OR_MARK = /[\p{L}\p{M}]/u;
const NON_ASCII_BODY = /[\p{L}\p{M}\s\u00AD\u200B-\u200D\u2060\uFEFF]/u;
const PART_SEPARATOR = / (?:\/|and|et|y|und) /u;

const MAX_RAW_LINE_FACTOR = 3;

function isLineBreak(code: number): boolean {
  return code === 10 || code === 13 || code === 0x85 || code === 0x2028 || code === 0x2029;
}

function isAsciiLetter(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isLetter(text: string, index: number): boolean {
  const code = text.charCodeAt(index);
  return code < 128 ? isAsciiLetter(code) : LETTER_OR_MARK.test(text[index]);
}

/** Characters allowed between the first and last letter of a heading. */
function isBodyChar(text: string, index: number): boolean {
  const code = text.charCodeAt(index);
  if (code < 128) {
    return (
      isAsciiLetter(code) || code === 32 || code === 9 || code === 38 || code === 44 ||
      code === 45 || code === 47
    );
  }
  return NON_ASCII_BODY.test(text[index]);
}

function joinLetterSpaced(body: string): string {
  const words = body.split(/ {2,}/u);
  const joined: string[] = [];
  let letters = 0;
  for (const word of words) {
    const tokens = word.split(" ");
    if (!tokens.every((token) => token.length === 1)) return body;
    letters += tokens.length;
    joined.push(tokens.join(""));
  }
  return letters >= 3 ? joined.join(" ") : body;
}

function normaliseBody(body: string): string {
  return joinLetterSpaced(body.replace(ZERO_WIDTH, "").trim())
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\//g, " / ")
    .replace(/[^\p{L}\p{M}/]+/gu, " ")
    .trim();
}

type Variants = { byText: Map<string, string>; firstLetters: Set<string> };

const variantCache = new WeakMap<AtsConfig, Variants>();

function variantsFor(config: AtsConfig): Variants {
  const cached = variantCache.get(config);
  if (cached) return cached;
  const byText = new Map<string, string>();
  for (const section of config.requiredSections) {
    byText.set(section, section);
    for (const variant of config.sectionHeadings[section] ?? []) byText.set(variant, section);
  }
  const firstLetters = new Set<string>();
  for (const variant of byText.keys()) firstLetters.add(variant.charAt(0));
  const variants = { byText, firstLetters };
  variantCache.set(config, variants);
  return variants;
}

function sectionsInKey(key: string, byText: Map<string, string>): string[] {
  const whole = byText.get(key);
  if (whole !== undefined) return [whole];
  const parts = key.split(PART_SEPARATOR);
  if (parts.length < 2) return [];
  const sections: string[] = [];
  for (const part of parts) {
    const section = byText.get(part.trim());
    if (section === undefined) return [];
    sections.push(section);
  }
  return sections;
}

/**
 * The text between the first and last letter of a line, or null when the line cannot be a
 * heading (decoration, body characters or length do not fit the rules above).
 */
function headingBody(text: string, lineStart: number, lineEnd: number, maxChars: number): string | null {
  let first = -1;
  for (let i = lineStart; i < lineEnd; i += 1) {
    if (isLetter(text, i)) {
      first = i;
      break;
    }
  }
  if (first === -1) return null;

  let last = first;
  let firstBad = -1;
  for (let i = first; i < lineEnd; i += 1) {
    if (isLetter(text, i)) last = i;
    else if (firstBad === -1 && !isBodyChar(text, i)) firstBad = i;
  }
  if (firstBad !== -1 && firstBad < last) return null;
  if (last - first + 1 > maxChars) return null;
  if (first > lineStart && !ALLOWED_PREFIX.test(text.slice(lineStart, first))) return null;
  if (last + 1 < lineEnd && !ALLOWED_SUFFIX.test(text.slice(last + 1, lineEnd))) return null;
  return text.slice(first, last + 1);
}

export function findSections(text: string, config: AtsConfig): string[] {
  const { byText, firstLetters } = variantsFor(config);
  const rawLimit = config.maxHeadingChars * MAX_RAW_LINE_FACTOR;
  const found = new Set<string>();
  const seen = new Map<string, string[]>();

  let lineStart = 0;
  for (let i = 0; i <= text.length; i += 1) {
    if (i < text.length && !isLineBreak(text.charCodeAt(i))) continue;
    if (i - lineStart > 0 && i - lineStart <= rawLimit) {
      const body = headingBody(text, lineStart, i, config.maxHeadingChars);
      if (body !== null && firstLetters.has(body.charAt(0).toLowerCase())) {
        let sections = seen.get(body);
        if (sections === undefined) {
          sections = sectionsInKey(normaliseBody(body), byText);
          seen.set(body, sections);
        }
        for (const section of sections) found.add(section);
      }
    }
    lineStart = i + 1;
  }
  return [...found];
}
