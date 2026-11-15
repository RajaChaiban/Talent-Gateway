import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

function request(path: string, cookie: string) {
  return new NextRequest(`http://localhost:3000${path}`, { headers: { cookie } });
}

describe("GET /auth/signed-out", () => {
  it("expires the session cookies, keeps others and redirects to sign-in", () => {
    const response = GET(
      request(
        "/auth/signed-out?next=%2Fapp%2Fjobs%2F1",
        "sb-ref-auth-token.0=a; sb-ref-auth-token.1=b; theme=dark",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fapp%2Fjobs%2F1",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");

    const cleared = response.cookies.getAll();
    expect(cleared.map((cookie) => cookie.name).sort()).toEqual([
      "sb-ref-auth-token.0",
      "sb-ref-auth-token.1",
    ]);
    for (const cookie of cleared) {
      expect(cookie.value).toBe("");
      expect(cookie.maxAge).toBe(0);
      expect(cookie.path).toBe("/");
    }
  });

  it("falls back to /app for an off-site next", () => {
    const response = GET(request("/auth/signed-out?next=%2F%2Fevil.com", ""));
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fapp",
    );
  });
});
