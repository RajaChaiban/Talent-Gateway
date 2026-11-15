/**
 * The one rule for finding phone numbers in a resume, shared by the ATS phone check and
 * by the prompt code that strips or matches contact details.
 *
 * A phone number is a run of digits, spaces, tabs and phone punctuation ( ) . - with an
 * optional leading "+", that starts and ends with a digit and holds at least
 * PHONE_MIN_DIGITS digits. The run never crosses a line break, so two date ranges on
 * stacked lines ("2019 - 2022" above "2017 - 2019") are not joined into one number, and a
 * single date range holds 8 digits, which is too few.
 */

/** Horizontal white space only (no line, page or paragraph break): a match never spans a line. */
const PHONE_LIKE = /\+?\(?\d(?:[\d().-]|[^\S\n\r\v\f\u0085\u2028\u2029])*\d/g;

/** Fewer digits than this is not a phone number ("2015 - 2019" holds 8). */
export const PHONE_MIN_DIGITS = 9;

function digits(text: string): string {
  return text.replace(/\D/g, "");
}

/** Every phone number in the text, as its digits only, in the order they appear. */
export function findPhoneNumbers(text: string): string[] {
  return (text.match(PHONE_LIKE) ?? []).map(digits).filter((d) => d.length >= PHONE_MIN_DIGITS);
}

/** The text with every phone number replaced by `replacement`. */
export function replacePhoneNumbers(text: string, replacement: string): string {
  return text.replace(PHONE_LIKE, (match) =>
    digits(match).length >= PHONE_MIN_DIGITS ? replacement : match,
  );
}
