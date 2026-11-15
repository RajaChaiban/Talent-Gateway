import { cache } from "react";
import { verifyUser } from "./verified-user";

/**
 * `verifyUser()` deduplicated per request, for server components: a layout
 * and a page can both ask without a second call to Supabase Auth.
 */
export const getCurrentUser = cache(verifyUser);
