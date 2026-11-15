import type { User } from "@supabase/supabase-js";
import { jsonError } from "@/lib/http";
import { verifyUser, type ServerClient } from "./verified-user";

/** Either the verified user with the recruiter's client, or the JSON error response to return as it is. */
export type RequireUserResult =
  | { ok: true; user: User; supabase: ServerClient }
  | { ok: false; response: Response };

/** Message of the 401 response. */
export const UNAUTHORIZED_MESSAGE = "Sign in to continue.";
/** Message of the 503 response. */
export const AUTH_UNAVAILABLE_MESSAGE =
  "Sign-in could not be checked right now. Try again in a moment.";

/**
 * Route-handler guard. Hands back the verified user plus the cookie-bound
 * client, or a ready-to-return JSON error: 401 when there is no valid
 * session, 503 when Supabase Auth could not answer.
 *
 * DECISION: a route handler answers with JSON instead of redirecting, because
 * its caller is `fetch`, not a page navigation, and a redirect would hand it
 * the sign-in page's HTML instead of an error it can show.
 */
export async function requireUser(): Promise<RequireUserResult> {
  const check = await verifyUser();

  switch (check.status) {
    case "signed-in":
      return { ok: true, user: check.user, supabase: check.supabase };
    case "signed-out":
      return {
        ok: false,
        response: jsonError("unauthorized", UNAUTHORIZED_MESSAGE, 401),
      };
    case "unavailable":
      return {
        ok: false,
        response: jsonError("auth_unavailable", AUTH_UNAVAILABLE_MESSAGE, 503),
      };
  }
}
