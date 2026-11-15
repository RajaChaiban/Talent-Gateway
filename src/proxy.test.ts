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
  ])("skips %s", (url) => {
    expect(runsOn(url)).toBe(false);
  });
});
