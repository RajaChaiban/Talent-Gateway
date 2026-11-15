import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect to ${url}`);
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

const { requireSignedInUser, AuthUnavailableError } = await import(
  "./require-signed-in-user"
);

async function redirectTarget(next: string): Promise<string> {
  try {
    await requireSignedInUser(next);
  } catch (error) {
    if (error instanceof RedirectSignal) return error.url;
    throw error;
  }
  throw new Error("expected a redirect");
}

describe("requireSignedInUser", () => {
  beforeEach(() => {
    getUser.mockReset();
  });

  it("returns the user and the client when signed in", async () => {
    const user = { id: "user-1", email: "demo@example.com" };
    getUser.mockResolvedValue({ data: { user }, error: null });

    const result = await requireSignedInUser("/app");

    expect(result.user).toBe(user);
    expect(result.supabase.auth.getUser).toBe(getUser);
  });

  it("sends a missing session through the signed-out route with next", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthSessionMissingError(),
    });
    await expect(redirectTarget("/app/jobs/1")).resolves.toBe(
      "/auth/signed-out?next=%2Fapp%2Fjobs%2F1",
    );
  });

  it("sends a rejected session through the signed-out route", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("User not found", 403, "user_not_found"),
    });
    await expect(redirectTarget("/app")).resolves.toBe("/auth/signed-out?next=%2Fapp");
  });

  it("throws instead of redirecting when Supabase Auth is unavailable", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError("fetch failed", 0),
    });
    await expect(requireSignedInUser("/app")).rejects.toBeInstanceOf(
      AuthUnavailableError,
    );
  });
});
