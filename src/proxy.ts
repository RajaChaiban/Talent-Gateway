import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decideRouteAccess } from "@/lib/auth/route-access";
import { getPublicSupabaseEnv } from "@/lib/supabase/public-env";

/**
 * Refreshes the Supabase session on every matched request and applies the
 * route-access rule.
 *
 * DECISION: this is the first check only. It reads the session token
 * (getClaims) instead of asking Supabase Auth about the user on every
 * request, so it stays cheap. Every /app page then calls
 * requireSignedInUser(), which does ask Supabase Auth.
 */
export async function proxy(request: NextRequest) {
  const env = getPublicSupabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Nothing may run between creating the client and this call: it is what
  // refreshes an expired access token and writes the new cookies.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const access = decideRouteAccess(
    {
      method: request.method,
      pathname: request.nextUrl.pathname,
      search: request.nextUrl.search,
    },
    signedIn,
  );
  if (access.action === "continue") return response;

  const redirect = NextResponse.redirect(new URL(access.to, request.url));
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = response.headers.get(header);
    if (value) redirect.headers.set(header, value);
  }
  return redirect;
}

/** The paths the proxy runs on; everything else skips it. */
export const config = {
  matcher: [
    // The recruiter area, including any file-like path under it.
    "/app/:path*",
    // Sign-in, so a signed-in visitor is sent on.
    "/login",
    // API routes, so a fetch from the app refreshes the session too. The
    // proxy never redirects them (they are not page navigations under /app);
    // each route handler checks the user itself.
    "/api/:path*",
  ],
};
