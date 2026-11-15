/**
 * Counts email addresses. The scan anchors on each "@" and looks at a bounded window on
 * either side, so the cost is linear in the text length whatever the input looks like.
 *
 * An address is found when:
 * - at least one character from [letters, digits, marks, . _ % + -] precedes the "@"
 *   (looking back at most 64 characters); and
 * - the characters after the "@" (at most 253 from [letters, digits, marks, . -]) start with
 *   one or more valid labels, each followed by a dot, and then at least two letters. A label
 *   is 1 to 63 letters, digits or hyphens that neither start nor end with a hyphen.
 *
 * Whatever follows those first two letters of the final label is ignored. PDF extraction
 * often glues the next field onto an address ("jane@example.com07700 900123",
 * "jane@example.comLinkedIn"), and the address is still there. Because only a prefix is
 * checked, "xn--" punycode and long top-level domains pass without any list of TLDs.
 *
 * Not addresses: "@handle" (nothing before the @), "user@localhost" and "user@example"
 * (no dot), "user@example.c" and "user@example.123" (no two-letter ending),
 * "user@-example.com" and "user@example..com" (invalid labels), and "name at example dot com".
 */

const MAX_LOCAL_LENGTH = 64;
const MAX_DOMAIN_LENGTH = 253;
const MAX_LABEL_LENGTH = 63;

const NON_ASCII_LOCAL = /[\p{L}\p{N}\p{M}]/u;

function isAsciiAlnum(code: number): boolean {
  return (
    (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
  );
}

function isLocalChar(text: string, index: number): boolean {
  const code = text.charCodeAt(index);
  if (code < 128) {
    return isAsciiAlnum(code) || code === 46 || code === 95 || code === 37 || code === 43 || code === 45;
  }
  return NON_ASCII_LOCAL.test(text[index]);
}

function isLabelChar(text: string, index: number): boolean {
  const code = text.charCodeAt(index);
  if (code < 128) return isAsciiAlnum(code) || code === 45;
  return NON_ASCII_LOCAL.test(text[index]);
}

function isLetter(text: string, index: number): boolean {
  const code = text.charCodeAt(index);
  if (code < 128) return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
  return /\p{L}/u.test(text[index]);
}

/** True when the text from `from` starts with valid labels, a dot and two letters. */
function hasValidDomainPrefix(text: string, from: number): boolean {
  const limit = Math.min(text.length, from + MAX_DOMAIN_LENGTH);
  let labelStart = from;
  for (let i = from; i <= limit; i += 1) {
    if (i < limit && isLabelChar(text, i)) continue;
    const labelLength = i - labelStart;
    if (labelLength === 0 || labelLength > MAX_LABEL_LENGTH) return false;
    if (text[labelStart] === "-" || text[i - 1] === "-") return false;
    if (i >= limit || text[i] !== ".") return false;
    if (i + 2 < text.length && isLetter(text, i + 1) && isLetter(text, i + 2)) return true;
    labelStart = i + 1;
  }
  return false;
}

/** Returns how many email addresses `text` contains, by the rules in the file header above. */
export function countEmails(text: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const at = text.indexOf("@", from);
    if (at === -1) return count;
    from = at + 1;

    let start = at;
    while (start > 0 && at - start < MAX_LOCAL_LENGTH && isLocalChar(text, start - 1)) {
      start -= 1;
    }
    if (start === at) continue;

    if (hasValidDomainPrefix(text, at + 1)) count += 1;
  }
}
