export const DEFAULT_SIGNED_IN_PATH = "/app";

const PROBE_ORIGIN = "http://same-site.invalid";

/**
 * Returns `next` only when it is a path on this site, otherwise the signed-in
 * home. Rejects absolute URLs, protocol-relative values (`//host`), backslash
 * tricks (`/\host`), paths that normalise to one of those (`/a/..//host`) and
 * anything a browser would resolve to another origin.
 */
export function safeRedirectPath(next: string | null | undefined): string {
  if (typeof next !== "string" || !next.startsWith("/")) {
    return DEFAULT_SIGNED_IN_PATH;
  }
  if (next.startsWith("//") || next.startsWith("/\\")) {
    return DEFAULT_SIGNED_IN_PATH;
  }

  let url: URL;
  try {
    url = new URL(next, PROBE_ORIGIN);
  } catch {
    return DEFAULT_SIGNED_IN_PATH;
  }
  if (url.origin !== PROBE_ORIGIN) {
    return DEFAULT_SIGNED_IN_PATH;
  }

  // Normalising can itself produce a protocol-relative path: `/a/..//host` becomes `//host`.
  if (url.pathname.startsWith("//") || url.pathname.startsWith("/\\")) {
    return DEFAULT_SIGNED_IN_PATH;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
