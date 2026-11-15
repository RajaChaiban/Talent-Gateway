import { createClient } from "@/lib/supabase/server";
import { classifyGetUser, type UserCheck } from "./user-check";

export type ServerClient = Awaited<ReturnType<typeof createClient>>;

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
