import { jsonError } from "@/lib/http";

export const CROSS_SITE_MESSAGE = "This request must come from the app itself.";

function firstValue(header: string | null): string | null {
  const value = header?.split(",")[0]?.trim();
  return value ? value : null;
}

/** The origin the request was addressed to, as the browser saw it (scheme and host). */
function requestOrigin(request: Request): URL | null {
  const url = new URL(request.url);
  const proto = firstValue(request.headers.get("x-forwarded-proto"))?.toLowerCase();
  const scheme = proto ? `${proto.replace(/:$/, "")}:` : url.protocol;
  const host =
    firstValue(request.headers.get("x-forwarded-host")) ??
    firstValue(request.headers.get("host")) ??
    url.host;
  try {
    return new URL(`${scheme}//${host}`);
  } catch {
    return null;
  }
}

/**
 * True when a state-changing request was sent by a page of this app, false
 * for anything another site, a browser extension or a bare client could have
 * sent.
 *
 * - `Sec-Fetch-Site`, when present, decides: only the exact lowercase token
 *   `same-origin`, as browsers send it, passes. `none` (a navigation the
 *   user started, which is never a PATCH, or an extension), `same-site`,
 *   `cross-site` and anything else fail, a differently cased value
 *   included. The value is not trimmed here; over real HTTP the platform
 *   strips surrounding whitespace before this code sees the header, so a
 *   `same-origin` that is only padded arrives exact and passes, and padding
 *   cannot turn another value into `same-origin`.
 * - Otherwise the `Origin` header's scheme and host must equal the request's
 *   own (`x-forwarded-proto`, then the URL's scheme; `x-forwarded-host`, then
 *   `host`, then the URL's host). A missing or `null` Origin fails, so callers
 *   use this on state-changing requests only.
 */
export function isSameOrigin(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null) return fetchSite === "same-origin";

  const origin = request.headers.get("origin");
  if (!origin || origin.trim().toLowerCase() === "null") return false;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  if (originUrl.protocol !== "https:" && originUrl.protocol !== "http:") return false;

  const own = requestOrigin(request);
  return own !== null && own.protocol === originUrl.protocol && own.host === originUrl.host;
}

/**
 * Guard for state-changing route handlers: a ready-to-return 403 `forbidden`
 * response for a cross-site request, or null to carry on.
 *
 * DECISION: the session lives in cookies, which a browser attaches to a
 * request another site makes. Refusing anything not sent by this app's own
 * pages stops such a request from changing data with the recruiter's session.
 */
export function requireSameOrigin(request: Request): Response | null {
  return isSameOrigin(request) ? null : jsonError("forbidden", CROSS_SITE_MESSAGE, 403);
}
