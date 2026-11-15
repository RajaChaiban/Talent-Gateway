import { createClient } from "@/lib/supabase/server";
import { classifyGetUser, type UserCheck } from "./user-check";

/** The Supabase client bound to the request's cookies, so row-level security applies as the signed-in recruiter. */
export type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** A UserCheck together with the client that was used to make it. */
export type VerifiedUserCheck = UserCheck & { supabase: ServerClient };

/**
 * The one place that asks Supabase Auth who is signed in. Uses `getUser()`,
 * which verifies the session with Supabase, never the unverified cookie.
 */
export async function verifyUser(): Promise<VerifiedUserCheck> {
  const supabase = await createClient();
  const result = await supabase.auth.getUser();
  return { ...classifyGetUser(result), supabase };
}
