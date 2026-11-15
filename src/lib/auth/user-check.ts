import {
  isAuthApiError,
  isAuthSessionMissingError,
  type User,
} from "@supabase/supabase-js";

/** Who is signed in. "unavailable" means Supabase Auth could not answer, which is not the same as signed out. */
export type UserCheck =
  | { status: "signed-in"; user: User }
  | { status: "signed-out" }
  | { status: "unavailable" };

type GetUserResult = {
  data: { user: User | null };
  error: unknown;
};

/**
 * Turns a `supabase.auth.getUser()` result into one of three answers.
 * Only a missing session or a token Supabase rejected (a 4xx other than 429)
 * means "signed out". Network failures, rate limits and 5xx mean Auth could
 * not answer, which must not be treated as signed out: doing so would send a
 * signed-in user to /login while the proxy, which trusts the unexpired JWT,
 * sends them straight back.
 */
export function classifyGetUser({ data, error }: GetUserResult): UserCheck {
  if (!error) {
    return data.user ? { status: "signed-in", user: data.user } : { status: "signed-out" };
  }
  if (isAuthSessionMissingError(error)) return { status: "signed-out" };
  if (
    isAuthApiError(error) &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 429
  ) {
    return { status: "signed-out" };
  }
  return { status: "unavailable" };
}
