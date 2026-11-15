/**
 * One pass over a text that measures how much of it can be read and how much of it is
 * layout noise. Every code point goes through the same classifier.
 *
 * Classes:
 * - whitespace: spaces, tabs, line breaks, NBSP and the other Unicode spaces. Not counted,
 *   but a run of them between visible characters counts as one readable character.
 * - invisible: control characters (including NUL), format characters (zero-width spaces and
 *   joiners, soft hyphens, bidi marks). Ignored everywhere, so a text of null bytes has no
 *   readable characters.
 * - text: letters, digits and combining marks of any script.
 * - ordinary punctuation: sentence punctuation, quotes, brackets, dashes, slash, backslash,
 *   ampersand, at sign, percent, hash, currency signs, less/greater-than, and a single "+",
 *   "-", "=", "_", "*", "~" or ".". Also the Unicode punctuation categories (bullets "•",
 *   "·", "§", "…", guillemets and so on), the bullet glyphs and the symbols in
 *   ORDINARY_SYMBOLS.
 * - noise: structure-drawing characters. "|", "^" and the backtick; box-drawing and block
 *   characters (U+2500 to U+259F); every other Unicode symbol (dingbats, arrows, shapes,
 *   private-use icons, the replacement character); and every character of a run of three or
 *   more identical "-", "=", "_", "*", "~", "+" or "." (rules, leaders and underlines).
 *   A lone hyphen, "+44", "C++", "C#", "e.g.", and the dots, hyphens and underscores of a URL or an email are ordinary.
 */

const BULLET_GLYPHS = new Set("●○◦▪▫■□►▸▶➢➤");
const ORDINARY_SYMBOLS = new Set("©®™°±×÷≥≤→");

const WHITESPACE_CLASS = 0;
const INVISIBLE_CLASS = 1;
const ORDINARY_CLASS = 2;
const NOISE_CLASS = 3;
const RULE_CLASS = 4;

const MIN_RULE_RUN = 3;

const WHITESPACE = /\s/u;
const INVISIBLE = /[\p{Cc}\p{Cf}]/u;
const TEXT = /[\p{L}\p{N}\p{M}]/u;
const PUNCTUATION_OR_CURRENCY = /[\p{P}\p{Sc}]/u;

function classifyAscii(code: number): number {
  if (code === 32 || (code >= 9 && code <= 13)) return WHITESPACE_CLASS;
  if (code < 32 || code === 127) return INVISIBLE_CLASS;
  if (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  ) {
    return ORDINARY_CLASS;
  }
  const ch = String.fromCharCode(code);
  if ("-=_*~+.".includes(ch)) return RULE_CLASS;
  if ("|^`".includes(ch)) return NOISE_CLASS;
  return ORDINARY_CLASS;
}

const ASCII_CLASSES = Uint8Array.from({ length: 128 }, (_, code) => classifyAscii(code));

function classifyCodePoint(codePoint: number): number {
  if (codePoint === 0x85) return WHITESPACE_CLASS;
  const ch = String.fromCodePoint(codePoint);
  if (WHITESPACE.test(ch)) return WHITESPACE_CLASS;
  if (INVISIBLE.test(ch)) return INVISIBLE_CLASS;
  if (TEXT.test(ch)) return ORDINARY_CLASS;
  if (codePoint >= 0x2500 && codePoint <= 0x259f) return NOISE_CLASS;
  if (PUNCTUATION_OR_CURRENCY.test(ch)) return ORDINARY_CLASS;
  if (BULLET_GLYPHS.has(ch) || ORDINARY_SYMBOLS.has(ch)) return ORDINARY_CLASS;
  return NOISE_CLASS;
}

export type TextScan = {
  /** Visible characters (code points) plus one per whitespace run between them. */
  readableChars: number;
  /** Visible characters, whitespace and invisible characters excluded. */
  visibleChars: number;
  /** Visible characters that are structural noise. */
  noiseChars: number;
};

export function scanText(text: string): TextScan {
  const cache = new Map<number, number>();
  let readableChars = 0;
  let visibleChars = 0;
  let noiseChars = 0;
  let gap = false;
  let ruleChar = -1;
  let ruleRun = 0;

  for (let i = 0; i < text.length; i += 1) {
    const codePoint = text.codePointAt(i) ?? 0;
    if (codePoint > 0xffff) i += 1;

    let kind: number;
    if (codePoint < 128) {
      kind = ASCII_CLASSES[codePoint];
    } else {
      const cached = cache.get(codePoint);
      if (cached === undefined) {
        kind = classifyCodePoint(codePoint);
        cache.set(codePoint, kind);
      } else {
        kind = cached;
      }
    }

    if (kind === INVISIBLE_CLASS) continue;
    if (kind === WHITESPACE_CLASS) {
      gap = true;
      ruleChar = -1;
      continue;
    }

    if (gap && readableChars > 0) readableChars += 1;
    gap = false;
    readableChars += 1;
    visibleChars += 1;

    if (kind === NOISE_CLASS) {
      noiseChars += 1;
      ruleChar = -1;
    } else if (kind === RULE_CLASS) {
      if (codePoint === ruleChar) {
        ruleRun += 1;
      } else {
        ruleChar = codePoint;
        ruleRun = 1;
      }
      if (ruleRun === MIN_RULE_RUN) noiseChars += MIN_RULE_RUN;
      else if (ruleRun > MIN_RULE_RUN) noiseChars += 1;
    } else {
      ruleChar = -1;
    }
  }

  return { readableChars, visibleChars, noiseChars };
}
