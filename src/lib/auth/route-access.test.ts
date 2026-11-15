import { describe, expect, it } from "vitest";
import { decideRouteAccess } from "./route-access";

function get(path: string) {
  const url = new URL(path, "http://localhost");
  return { method: "GET", pathname: url.pathname, search: url.search };
}

describe("decideRouteAccess when signed out", () => {
  it("lets / and /login through", () => {
    expect(decideRouteAccess(get("/"), false)).toEqual({ action: "continue" });
    expect(decideRouteAccess(get("/login"), false)).toEqual({ action: "continue" });
  });

  it("sends /app to sign-in with next set to /app", () => {
    expect(decideRouteAccess(get("/app"), false)).toEqual({
      action: "redirect",
      to: "/login?next=%2Fapp",
    });
  });

  it("sends a deep /app link to sign-in and keeps the path in next", () => {
    expect(decideRouteAccess(get("/app/jobs/1"), false)).toEqual({
      action: "redirect",
      to: "/login?next=%2Fapp%2Fjobs%2F1",
    });
  });

  it("keeps the query string of the protected page in next", () => {
    expect(decideRouteAccess(get("/app/jobs/1?tab=ranked"), false)).toEqual({
      action: "redirect",
      to: "/login?next=%2Fapp%2Fjobs%2F1%3Ftab%3Dranked",
    });
  });

  it("does not treat paths that only start with the letters app as protected", () => {
    expect(decideRouteAccess(get("/application"), false)).toEqual({
      action: "continue",
    });
  });

  it("lets a HEAD navigation redirect like a GET", () => {
    expect(
      decideRouteAccess({ method: "HEAD", pathname: "/app", search: "" }, false),
    ).toEqual({ action: "redirect", to: "/login?next=%2Fapp" });
  });

  it("never redirects a Server Action POST; the action checks for itself", () => {
    expect(
      decideRouteAccess({ method: "POST", pathname: "/app", search: "" }, false),
    ).toEqual({ action: "continue" });
  });

  it("never redirects an API request; the route handler answers 401 itself", () => {
    expect(
      decideRouteAccess({ method: "PATCH", pathname: "/api/jobs/1", search: "" }, false),
    ).toEqual({ action: "continue" });
    expect(decideRouteAccess(get("/api/jobs/1"), false)).toEqual({ action: "continue" });
  });
});

describe("decideRouteAccess when signed in", () => {
  it("lets / , /app and deep /app paths through", () => {
    expect(decideRouteAccess(get("/"), true)).toEqual({ action: "continue" });
    expect(decideRouteAccess(get("/app"), true)).toEqual({ action: "continue" });
    expect(decideRouteAccess(get("/app/jobs/1"), true)).toEqual({
      action: "continue",
    });
  });

  it("sends /login to /app when there is no next", () => {
    expect(decideRouteAccess(get("/login"), true)).toEqual({
      action: "redirect",
      to: "/app",
    });
  });

  it("sends /login to the safe next path", () => {
    expect(decideRouteAccess(get("/login?next=%2Fapp%2Fjobs%2F1"), true)).toEqual({
      action: "redirect",
      to: "/app/jobs/1",
    });
  });

  it("sends /login to /app when next points off-site", () => {
    expect(decideRouteAccess(get("/login?next=%2F%2Fevil.com"), true)).toEqual({
      action: "redirect",
      to: "/app",
    });
    expect(
      decideRouteAccess(get("/login?next=https%3A%2F%2Fevil.com"), true),
    ).toEqual({ action: "redirect", to: "/app" });
  });

  it("does not send /login back to /login", () => {
    expect(decideRouteAccess(get("/login?next=%2Flogin%3Fnext%3D%252Fapp"), true)).toEqual({
      action: "redirect",
      to: "/app",
    });
  });

  it("never redirects the sign-in Server Action POST", () => {
    expect(
      decideRouteAccess({ method: "POST", pathname: "/login", search: "" }, true),
    ).toEqual({ action: "continue" });
  });
});
