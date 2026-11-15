import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { planSignedOut } from "@/lib/auth/signed-out";

/** Clears cookies and redirects, with no network call. */
export const maxDuration = 5;

const querySchema = z.object({ next: z.string().max(2048).optional() });

/**
 * Reached when server code finds the session cookie present but rejected by
 * Supabase Auth (user deleted or banned, session revoked). Clears the
 * session cookies without any network call, so it works even when Auth is
 * down, then redirects to /login. The proxy does not run on this route.
 */
export function GET(request: NextRequest) {
  const query = querySchema.safeParse({
    next: request.nextUrl.searchParams.get("next") ?? undefined,
  });
  const plan = planSignedOut(
    request.cookies.getAll().map((cookie) => cookie.name),
    query.success ? query.data.next : undefined,
  );

  const response = NextResponse.redirect(new URL(plan.location, request.url), 303);
  for (const name of plan.clearCookies) {
    response.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
