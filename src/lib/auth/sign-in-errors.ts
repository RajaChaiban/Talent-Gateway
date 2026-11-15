/** Shown for any rejected email and password pair. The text is the same for a wrong email and a wrong password. */
export const INVALID_CREDENTIALS_MESSAGE = "Email or password is incorrect";
/** Shown when Supabase answers that there were too many sign-in attempts. */
export const RATE_LIMITED_MESSAGE =
  "Too many sign-in attempts. Wait a minute and try again.";
/** Shown when Supabase Auth could not be reached or failed on its side. */
export const UNAVAILABLE_MESSAGE =
  "Sign-in is unavailable right now. Try again in a moment.";

type AuthErrorLike = { status?: number; code?: string };

/**
 * Maps a Supabase sign-in error to a message that never says whether the
 * email or the password was wrong.
 */
export function signInErrorMessage(error: AuthErrorLike): string {
  if (error.status === 429 || error.code === "over_request_rate_limit") {
    return RATE_LIMITED_MESSAGE;
  }
  if (error.status === undefined || error.status === 0 || error.status >= 500) {
    return UNAVAILABLE_MESSAGE;
  }
  return INVALID_CREDENTIALS_MESSAGE;
}
