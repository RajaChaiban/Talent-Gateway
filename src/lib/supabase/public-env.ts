import { z } from "zod";

/**
 * The two Supabase values the browser is allowed to see. The anon key is
 * public by design: row-level security in the database decides what it can read.
 */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/** The checked public Supabase values: the project URL and the anon key. */
export type PublicSupabaseEnv = z.infer<typeof publicEnvSchema>;

/** Names the variables that are wrong, never their values. */
export function envErrorMessage(error: z.ZodError): string {
  const names = [...new Set(error.issues.map((issue) => issue.path.join(".") || "(root)"))];
  return `Missing or invalid environment variables: ${names.join(", ")}`;
}

/**
 * DECISION: validate at the point of use and fail with the variable's name,
 * instead of passing `undefined` to the Supabase client and getting an
 * unrelated network error later.
 *
 * The reads are literal `process.env.NEXT_PUBLIC_*` so Next.js can inline them.
 */
export function getPublicSupabaseEnv(): PublicSupabaseEnv {
  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (result.success) return result.data;
  throw new Error(envErrorMessage(result.error));
}
