import { signInPath } from "./route-access";

/** Supabase's session cookies: `sb-<ref>-auth-token`, its `.0`/`.1` chunks and the PKCE verifier. */
const SUPABASE_AUTH_COOKIE = /^sb-.+-auth-token(?:-code-verifier)?(?:\.\d+)?$/;

/** True when `name` is a cookie that holds Supabase session data. */
export function isSupabaseAuthCookie(name: string): boolean {
  return SUPABASE_AUTH_COOKIE.test(name);
}

/** Where to send the browser and the names of the cookies to delete. */
export type SignedOutPlan = { location: string; clearCookies: string[] };

/**
 * What GET /auth/signed-out does, as data: clear every Supabase session
 * cookie on this browser and go to sign-in with a same-site `next`.
 *
 * Why this cannot loop: the proxy decides "signed in" from those cookies
 * alone. Once they are cleared, the next request to /login has no session,
 * so the proxy lets it through instead of sending it back to /app.
 */
export function planSignedOut(
  cookieNames: readonly string[],
  next: string | null | undefined,
): SignedOutPlan {
  return {
    location: signInPath(next),
    clearCookies: cookieNames.filter(isSupabaseAuthCookie),
  };
}
