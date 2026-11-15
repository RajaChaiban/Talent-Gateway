import { describe, expect, it } from "vitest";
import {
  INVALID_CREDENTIALS_MESSAGE,
  RATE_LIMITED_MESSAGE,
  UNAVAILABLE_MESSAGE,
  signInErrorMessage,
} from "./sign-in-errors";

describe("signInErrorMessage", () => {
  it("uses one message for a wrong email or a wrong password", () => {
    expect(
      signInErrorMessage({ status: 400, code: "invalid_credentials" }),
    ).toBe("Email or password is incorrect");
    expect(signInErrorMessage({ status: 400, code: "email_not_confirmed" })).toBe(
      INVALID_CREDENTIALS_MESSAGE,
    );
  });

  it("says when sign-in is rate limited", () => {
    expect(signInErrorMessage({ status: 429 })).toBe(RATE_LIMITED_MESSAGE);
    expect(signInErrorMessage({ code: "over_request_rate_limit" })).toBe(
      RATE_LIMITED_MESSAGE,
    );
  });

  it("says when Supabase cannot be reached or fails", () => {
    expect(signInErrorMessage({ status: 0 })).toBe(UNAVAILABLE_MESSAGE);
    expect(signInErrorMessage({})).toBe(UNAVAILABLE_MESSAGE);
    expect(signInErrorMessage({ status: 503 })).toBe(UNAVAILABLE_MESSAGE);
  });
});
