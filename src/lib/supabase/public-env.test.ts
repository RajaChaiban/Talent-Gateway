import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicSupabaseEnv } from "./public-env";

describe("getPublicSupabaseEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns both values when they are set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    expect(getPublicSupabaseEnv()).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });
  });

  it("names a missing variable", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(() => getPublicSupabaseEnv()).toThrow(
      "Missing or invalid environment variables: NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  });

  it("rejects a URL that is not a URL, and never prints the value", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not-a-url");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    expect(() => getPublicSupabaseEnv()).toThrow(
      "Missing or invalid environment variables: NEXT_PUBLIC_SUPABASE_URL",
    );
    expect(() => getPublicSupabaseEnv()).not.toThrow(/not-a-url/);
  });

  it("names both when both are missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(() => getPublicSupabaseEnv()).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  });
});
