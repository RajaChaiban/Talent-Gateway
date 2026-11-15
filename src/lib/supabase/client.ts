import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { getPublicSupabaseEnv } from "./public-env";

/**
 * A Supabase client for the browser. It acts as the signed-in recruiter with
 * the anon key and the session cookie, so row-level security and the Storage
 * policies apply to everything it does. It is used only to send a resume to
 * Storage with a token the sign route created.
 */
export function createClient() {
  const env = getPublicSupabaseEnv();
  return createBrowserClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
