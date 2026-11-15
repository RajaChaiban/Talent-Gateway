"use server";

import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/lib/auth/safe-redirect";
import { signInErrorMessage } from "@/lib/auth/sign-in-errors";
import { verifyUser } from "@/lib/auth/verified-user";
import {
  signInFieldErrors,
  signInSchema,
  type SignInFieldErrors,
} from "@/lib/auth/sign-in-schema";

/** What the sign-in form shows after a submit: the email to keep in the field, per-field errors and one form-level error. */
export type SignInState = {
  email: string;
  fieldErrors: SignInFieldErrors;
  formError: string | null;
};

function formString(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}

/** Server action for the sign-in form. Returns a state with errors on a bad input or a failed sign-in; on success it redirects to the validated `next` path and does not return. */
export async function signIn(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = formString(formData, "email");
  const parsed = signInSchema.safeParse({
    email,
    password: formString(formData, "password"),
  });

  if (!parsed.success) {
    return {
      email: email ?? "",
      fieldErrors: signInFieldErrors(parsed.error),
      formError: null,
    };
  }

  const next = safeRedirectPath(formString(formData, "next"));

  // The proxy does not redirect Server Action POSTs, so a stale sign-in tab
  // can post here while already signed in: just continue to `next`.
  const check = await verifyUser();
  if (check.status === "signed-in") redirect(next);

  const { error } = await check.supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return {
      email: parsed.data.email,
      fieldErrors: {},
      formError: signInErrorMessage(error),
    };
  }

  redirect(next);
}
