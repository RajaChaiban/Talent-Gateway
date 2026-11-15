import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { getCurrentUser } from "./current-user";
import { signedOutPath } from "./route-access";
import type { ServerClient } from "./verified-user";

/**
 * Thrown when Supabase Auth could not answer, so the error boundary shows a retryable error
 * instead of signing the user out.
 */
export class AuthUnavailableError extends Error {
  constructor() {
    super("Supabase Auth could not verify the session");
    this.name = "AuthUnavailableError";
  }
}

/**
 * The check every /app page and every server-side data function calls
 * before it reads or renders anything. A layout check does not gate its
 * child pages, so each page does this itself.
 *
 * - Signed in: returns the user and the cookie-bound client (RLS applies).
 * - Session rejected or missing: redirects through /auth/signed-out, which
 *   clears the cookies and lands on /login?next=`next`.
 * - Auth unavailable: throws, so the segment's error boundary shows a
 *   retryable error instead of signing a valid user out.
 */
export async function requireSignedInUser(
  next: string,
): Promise<{ user: User; supabase: ServerClient }> {
  const check = await getCurrentUser();
  if (check.status === "signed-in") {
    return { user: check.user, supabase: check.supabase };
  }
  if (check.status === "signed-out") redirect(signedOutPath(next));
  throw new AuthUnavailableError();
}
