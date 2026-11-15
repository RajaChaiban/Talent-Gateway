import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
  type User,
} from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { classifyGetUser } from "./user-check";

const user = { id: "user-1", email: "demo@example.com" } as User;
const noUser = { user: null };

describe("classifyGetUser", () => {
  it("is signed in when Supabase returns a user", () => {
    expect(classifyGetUser({ data: { user }, error: null })).toEqual({
      status: "signed-in",
      user,
    });
  });

  it("is signed out when there is no session cookie", () => {
    expect(
      classifyGetUser({ data: noUser, error: new AuthSessionMissingError() }),
    ).toEqual({ status: "signed-out" });
  });

  it.each([
    ["an invalid JWT", 401, "bad_jwt"],
    ["a deleted user", 403, "user_not_found"],
    ["a revoked session", 403, "session_not_found"],
    ["a banned user", 400, "user_banned"],
  ])("is signed out for %s", (_label, status, code) => {
    expect(
      classifyGetUser({ data: noUser, error: new AuthApiError("rejected", status, code) }),
    ).toEqual({ status: "signed-out" });
  });

  it("is unavailable when the network fails", () => {
    expect(
      classifyGetUser({
        data: noUser,
        error: new AuthRetryableFetchError("fetch failed", 0),
      }),
    ).toEqual({ status: "unavailable" });
  });

  it("is unavailable when Supabase Auth returns a 5xx", () => {
    expect(
      classifyGetUser({
        data: noUser,
        error: new AuthApiError("server error", 500, "unexpected_failure"),
      }),
    ).toEqual({ status: "unavailable" });
    expect(
      classifyGetUser({
        data: noUser,
        error: new AuthRetryableFetchError("bad gateway", 502),
      }),
    ).toEqual({ status: "unavailable" });
  });

  it("is unavailable when rate limited or the error is unknown", () => {
    expect(
      classifyGetUser({
        data: noUser,
        error: new AuthApiError("slow down", 429, "over_request_rate_limit"),
      }),
    ).toEqual({ status: "unavailable" });
    expect(
      classifyGetUser({ data: noUser, error: new AuthUnknownError("odd", null) }),
    ).toEqual({ status: "unavailable" });
  });
});
