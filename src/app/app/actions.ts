"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Server action behind the Sign out button: ends this browser's session and sends the user to the landing page. */
export async function signOut() {
  const supabase = await createClient();
  // "local" ends only this browser's session: the demo login is shared, so a
  // global sign-out would also sign out everyone else using it. It needs no
  // session check of its own: with no session it simply clears nothing, and
  // supabase-js removes the local session before its network call, so it
  // also works while Supabase Auth is unreachable.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}
