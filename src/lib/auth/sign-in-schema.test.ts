import { describe, expect, it } from "vitest";
import { signInFieldErrors, signInSchema } from "./sign-in-schema";

function errorsFor(input: unknown) {
  const result = signInSchema.safeParse(input);
  if (result.success) throw new Error("expected the input to be rejected");
  return signInFieldErrors(result.error);
}

describe("signInSchema", () => {
  it("accepts a valid email and password and trims the email", () => {
    const result = signInSchema.safeParse({
      email: "  demo@example.com ",
      password: "a password with spaces ",
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      email: "demo@example.com",
      password: "a password with spaces ",
    });
  });

  it("asks for both fields when they are empty", () => {
    expect(errorsFor({ email: "", password: "" })).toEqual({
      email: "Enter your email",
      password: "Enter your password",
    });
  });

  it("treats a whitespace-only email as empty", () => {
    expect(errorsFor({ email: "   ", password: "x" })).toEqual({
      email: "Enter your email",
    });
  });

  it("rejects a malformed email", () => {
    expect(errorsFor({ email: "not-an-email", password: "x" })).toEqual({
      email: "Enter a valid email address",
    });
  });

  it("rejects missing fields, as when a form field is absent", () => {
    expect(errorsFor({ email: null, password: null })).toEqual({
      email: "Enter your email",
      password: "Enter your password",
    });
  });

  it("rejects an oversized password", () => {
    expect(
      errorsFor({ email: "demo@example.com", password: "x".repeat(257) }),
    ).toEqual({ password: "Password is too long" });
  });
});
