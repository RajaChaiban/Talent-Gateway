import { describe, expect, it } from "vitest";
import { signedOutPath } from "./route-access";
import { isSupabaseAuthCookie, planSignedOut } from "./signed-out";

describe("isSupabaseAuthCookie", () => {
  it.each([
    "sb-projectref-auth-token",
    "sb-projectref-auth-token.0",
    "sb-projectref-auth-token.1",
    "sb-projectref-auth-token-code-verifier",
  ])("matches %s", (name) => {
    expect(isSupabaseAuthCookie(name)).toBe(true);
  });

  it.each(["theme", "sb-other", "__Host-next-auth", "my-sb-x-auth-token"])(
    "leaves %s alone",
    (name) => {
      expect(isSupabaseAuthCookie(name)).toBe(false);
    },
  );
});

describe("planSignedOut", () => {
  it("clears only the Supabase session cookies and goes to sign-in with next", () => {
    expect(
      planSignedOut(
        ["sb-ref-auth-token.0", "sb-ref-auth-token.1", "theme"],
        "/app/jobs/1",
      ),
    ).toEqual({
      location: "/login?next=%2Fapp%2Fjobs%2F1",
      clearCookies: ["sb-ref-auth-token.0", "sb-ref-auth-token.1"],
    });
  });

  it("never sends the browser off-site", () => {
    expect(planSignedOut([], "//evil.com").location).toBe("/login?next=%2Fapp");
    expect(planSignedOut([], undefined).location).toBe("/login?next=%2Fapp");
  });
});

describe("signedOutPath", () => {
  it("points server-side rejections at the signed-out route with a safe next", () => {
    expect(signedOutPath("/app/jobs/1")).toBe("/auth/signed-out?next=%2Fapp%2Fjobs%2F1");
    expect(signedOutPath("https://evil.com")).toBe("/auth/signed-out?next=%2Fapp");
  });
});
