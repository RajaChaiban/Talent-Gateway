import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

const { requireUser, UNAUTHORIZED_MESSAGE, AUTH_UNAVAILABLE_MESSAGE } = await import(
  "./require-user"
);

describe("requireUser", () => {
  beforeEach(() => {
    getUser.mockReset();
  });

  it("returns the user and the client when Supabase verifies the session", async () => {
    const user = { id: "user-1", email: "demo@example.com" };
    getUser.mockResolvedValue({ data: { user }, error: null });

    const result = await requireUser();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user).toBe(user);
      expect(result.supabase.auth.getUser).toBe(getUser);
    }
  });

  it("returns a 401 JSON error when there is no session", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthSessionMissingError(),
    });

    const result = await requireUser();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(result.response.headers.get("content-type")).toContain(
        "application/json",
      );
      await expect(result.response.json()).resolves.toEqual({
        error: { code: "unauthorized", message: UNAUTHORIZED_MESSAGE },
      });
    }
  });

  it("returns a 401 when Supabase rejects the token", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("invalid JWT", 401, "bad_jwt"),
    });

    const result = await requireUser();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("returns a 503 when Supabase Auth cannot be reached", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError("fetch failed", 0),
    });

    const result = await requireUser();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(503);
      await expect(result.response.json()).resolves.toEqual({
        error: { code: "auth_unavailable", message: AUTH_UNAVAILABLE_MESSAGE },
      });
    }
  });

  it("returns a 503 when Supabase Auth fails with a 5xx", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("server error", 500, "unexpected_failure"),
    });

    const result = await requireUser();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });
});
