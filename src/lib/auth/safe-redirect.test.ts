import { describe, expect, it } from "vitest";
import { DEFAULT_SIGNED_IN_PATH, safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it.each([
    ["/app", "/app"],
    ["/app/jobs/1", "/app/jobs/1"],
    ["/app/jobs/1?tab=ranked#top", "/app/jobs/1?tab=ranked#top"],
    ["/", "/"],
  ])("keeps the same-site path %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it.each([
    ["protocol-relative", "//evil.com"],
    ["protocol-relative with a path", "//evil.com/app"],
    ["absolute https", "https://evil.com"],
    ["absolute http to this path", "http://localhost/app"],
    ["backslash", "/\\evil.com"],
    ["tab hidden in a protocol-relative value", "/\t/evil.com"],
    ["dot segments that normalise to protocol-relative", "/a/..//evil.com"],
    ["encoded dot segments that normalise to protocol-relative", "/a/%2e%2e//evil.com"],
    ["a dot segment before a doubled slash", "/.//evil.com"],
    ["javascript scheme", "javascript:alert(1)"],
    ["relative path", "app"],
    ["empty", ""],
  ])("falls back for %s", (_label, input) => {
    expect(safeRedirectPath(input)).toBe(DEFAULT_SIGNED_IN_PATH);
  });

  it("falls back when next is missing", () => {
    expect(safeRedirectPath(null)).toBe("/app");
    expect(safeRedirectPath(undefined)).toBe("/app");
  });
});
