import { DEFAULT_SIGNED_IN_PATH, safeRedirectPath } from "./safe-redirect";

export const SIGN_IN_PATH = "/login";
export const SIGNED_OUT_PATH = "/auth/signed-out";

/** `/login?next=…` with `next` reduced to a same-site path. */
export function signInPath(next: string | null | undefined): string {
  const params = new URLSearchParams({ next: safeRedirectPath(next) });
  return `${SIGN_IN_PATH}?${params.toString()}`;
}

/**
 * Where server code sends a browser whose session Supabase rejected: the
 * signed-out route clears the session cookies, then goes to sign-in.
 */
export function signedOutPath(next: string | null | undefined): string {
  const params = new URLSearchParams({ next: safeRedirectPath(next) });
  return `${SIGNED_OUT_PATH}?${params.toString()}`;
}

export type RouteAccess =
  | { action: "continue" }
  | { action: "redirect"; to: string };

export type RouteRequest = {
  method: string;
  pathname: string;
  /** The raw query string including its leading `?`, or empty. */
  search: string;
};

function isProtectedPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

function isSignInPath(pathname: string): boolean {
  return pathname === SIGN_IN_PATH || pathname === `${SIGN_IN_PATH}/`;
}

function isNavigation(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

/**
 * The proxy's redirect rule, free of Next.js and Supabase so it can be unit
 * tested. Only page navigations (GET, HEAD) are redirected: a Server Action
 * is a POST to the page that uses it, and redirecting it would replay the
 * POST against another page, so it continues and the action checks for
 * itself.
 */
export function decideRouteAccess(
  { method, pathname, search }: RouteRequest,
  signedIn: boolean,
): RouteAccess {
  if (!isNavigation(method)) return { action: "continue" };

  if (!signedIn && isProtectedPath(pathname)) {
    const params = new URLSearchParams({ next: `${pathname}${search}` });
    return { action: "redirect", to: `${SIGN_IN_PATH}?${params.toString()}` };
  }
  if (signedIn && isSignInPath(pathname)) {
    const next = safeRedirectPath(new URLSearchParams(search).get("next"));
    const nextPathname = new URL(next, "http://same-site.invalid").pathname;
    return {
      action: "redirect",
      to: isSignInPath(nextPathname) ? DEFAULT_SIGNED_IN_PATH : next,
    };
  }
  return { action: "continue" };
}
