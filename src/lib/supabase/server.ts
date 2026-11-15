import { createServerClient } from "@supabase/ssr";
import { io } from "next/cache";
import { cookies } from "next/headers";
import { getPublicSupabaseEnv } from "./public-env";

/**
 * A Supabase client for server code (pages, server actions, route handlers).
 * It acts as the signed-in recruiter: the session lives in cookies, and
 * row-level security in the database applies to everything it does.
 *
 * DECISION: the anon key plus the user's session, never the service-role key.
 * Supabase stays the system of record and enforces its own access rules;
 * this app holds no credential that can bypass them.
 */
export async function createClient() {
  // Reading cookies marks the render as per-request, so a build without
  // env vars stops here instead of failing on missing variables.
  const cookieStore = await cookies();
  // The auth client reads the clock when it is created, which is not allowed
  // during a prerender. Wait until a real request is rendering.
  await io();
  const env = getPublicSupabaseEnv();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The request proxy refreshes the session instead.
        }
      },
    },
  });
}
