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

export type SignInState = {
  email: string;
  fieldErrors: SignInFieldErrors;
  formError: string | null;
};

function formString(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}

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
