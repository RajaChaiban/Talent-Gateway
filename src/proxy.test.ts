import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config } from "./proxy";

function runsOn(url: string): boolean {
  return unstable_doesMiddlewareMatch({ config, url });
}

describe("proxy matcher", () => {
  it.each([
    "/app",
    "/app/jobs/1",
    "/app/x.png",
    "/login",
    "/api/jobs/0b4d8f3e-6f0a-4c52-8d57-3a1f9b2c7e10",
    "/api/jobs",
  ])("runs on %s", (url) => {
    expect(runsOn(url)).toBe(true);
  });

  it.each([
    "/",
    "/robots.txt",
    "/sitemap.xml",
    "/logo.svg",
    "/favicon.ico",
    "/_next/static/chunks/main.js",
    "/_next/image?url=%2Flogo.png&w=64&q=75",
    "/application",
    "/auth/signed-out",
    "/apis",
  ])("skips %s", (url) => {
    expect(runsOn(url)).toBe(false);
  });
});
