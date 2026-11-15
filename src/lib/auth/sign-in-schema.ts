import { z } from "zod";

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

export type SignInInput = z.infer<typeof signInSchema>;

export type SignInFieldErrors = Partial<Record<keyof SignInInput, string>>;

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
