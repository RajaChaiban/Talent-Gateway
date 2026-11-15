import { AuthApiError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const signInWithPassword = vi.fn();

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect to ${url}`);
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser, signInWithPassword } }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

const { signIn } = await import("./actions");

const initial = { email: "", fieldErrors: {}, formError: null };

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const signedOut = { data: { user: null }, error: new AuthSessionMissingError() };

describe("signIn action", () => {
  beforeEach(() => {
    getUser.mockReset();
    signInWithPassword.mockReset();
  });

  it("rejects malformed input without calling Supabase", async () => {
    const state = await signIn(initial, form({ email: "nope", password: "" }));

    expect(state).toEqual({
      email: "nope",
      fieldErrors: {
        email: "Enter a valid email address",
        password: "Enter your password",
      },
      formError: null,
    });
    expect(getUser).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("keeps the email and shows one message for wrong credentials", async () => {
    getUser.mockResolvedValue(signedOut);
    signInWithPassword.mockResolvedValue({
      data: {},
      error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
    });

    const state = await signIn(
      initial,
      form({ email: "demo@example.com", password: "wrong", next: "/app" }),
    );

    expect(state).toEqual({
      email: "demo@example.com",
      fieldErrors: {},
      formError: "Email or password is incorrect",
    });
  });

  it("redirects to the safe next after signing in", async () => {
    getUser.mockResolvedValue(signedOut);
    signInWithPassword.mockResolvedValue({ data: {}, error: null });

    await expect(
      signIn(
        initial,
        form({ email: "demo@example.com", password: "right", next: "//evil.com" }),
      ),
    ).rejects.toMatchObject({ url: "/app" });
  });

  it("skips signing in again when the browser is already signed in", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    await expect(
      signIn(
        initial,
        form({ email: "demo@example.com", password: "x", next: "/app/jobs/1" }),
      ),
    ).rejects.toMatchObject({ url: "/app/jobs/1" });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
