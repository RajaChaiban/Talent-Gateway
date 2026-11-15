// Rules for the sign-in form, used by the sign-in server action in src/app/login/actions.ts.
import { z } from "zod";

/** The sign-in form: a trimmed email of at most 254 characters and a password of at most 256. */
export const signInSchema = z.object({
  email: z
    .string({ error: "Enter your email" })
    .trim()
    .min(1, "Enter your email")
    .max(254, "Enter a valid email address")
    .pipe(z.email("Enter a valid email address")),
  password: z
    .string({ error: "Enter your password" })
    .min(1, "Enter your password")
    .max(256, "Password is too long"),
});

/** The sign-in form values after validation. */
export type SignInInput = z.infer<typeof signInSchema>;

/** At most one message per sign-in form field. */
export type SignInFieldErrors = Partial<Record<keyof SignInInput, string>>;

/** Reduces a validation error to the first message for each field, for the form to show under that field. */
export function signInFieldErrors(error: z.ZodError<SignInInput>): SignInFieldErrors {
  const errors: SignInFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if ((field === "email" || field === "password") && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}
