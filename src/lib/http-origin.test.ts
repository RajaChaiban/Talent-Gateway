import { describe, expect, it } from "vitest";
import { CROSS_SITE_MESSAGE, isSameOrigin, requireSameOrigin } from "./http-origin";

function post(headers: Record<string, string>, url = "https://app.example.com/api/jobs") {
  return new Request(url, { method: "POST", headers });
}

describe("isSameOrigin from Sec-Fetch-Site", () => {
  it("passes the exact token same-origin", () => {
    expect(isSameOrigin(post({ "sec-fetch-site": "same-origin" }))).toBe(true);
  });

  it.each(["none", "same-site", "cross-site", "", "bogus"])("refuses %j", (site) => {
    expect(isSameOrigin(post({ "sec-fetch-site": site }))).toBe(false);
  });

  it.each(["Same-Origin", "SAME-ORIGIN", " Same-Origin ", "same-origin, same-origin", "same-origin;x"])(
    "refuses the oddly written %j",
    (site) => {
      expect(isSameOrigin(post({ "sec-fetch-site": site }))).toBe(false);
    },
  );

  it("refuses a padded value that reaches it untrimmed, even with a matching Origin", () => {
    const request = post({ origin: "https://app.example.com" });
    const padded = new Proxy(request, {
      get: (target, key) =>
        key === "headers"
          ? { get: (name: string) => (name === "sec-fetch-site" ? " same-origin " : target.headers.get(name)) }
          : Reflect.get(target, key),
    });
    expect(isSameOrigin(padded)).toBe(false);
  });

  it("trusts Sec-Fetch-Site over a matching Origin", () => {
    expect(
      isSameOrigin(post({ "sec-fetch-site": "cross-site", origin: "https://app.example.com" })),
    ).toBe(false);
  });

  it("trusts Sec-Fetch-Site over a foreign Origin", () => {
    expect(
      isSameOrigin(post({ "sec-fetch-site": "same-origin", origin: "https://evil.example" })),
    ).toBe(true);
  });
});

describe("isSameOrigin from Origin and the request host", () => {
  it("passes an Origin equal to the request host", () => {
    expect(isSameOrigin(post({ origin: "https://app.example.com" }))).toBe(true);
  });

  it("compares hosts case-insensitively", () => {
    expect(isSameOrigin(post({ origin: "https://APP.example.com" }))).toBe(true);
  });

  it("refuses a cross-site Origin", () => {
    expect(isSameOrigin(post({ origin: "https://evil.example" }))).toBe(false);
  });

  it("refuses a sibling subdomain", () => {
    expect(isSameOrigin(post({ origin: "https://evil.example.com" }))).toBe(false);
  });

  it("refuses a different port", () => {
    expect(
      isSameOrigin(post({ origin: "http://localhost:3001" }, "http://localhost:3000/api/jobs")),
    ).toBe(false);
  });

  it("passes the same port", () => {
    expect(
      isSameOrigin(post({ origin: "http://localhost:3000" }, "http://localhost:3000/api/jobs")),
    ).toBe(true);
  });

  it("refuses a missing Origin when there is no Sec-Fetch-Site", () => {
    expect(isSameOrigin(post({}))).toBe(false);
  });

  it("refuses the null origin", () => {
    expect(isSameOrigin(post({ origin: "null" }))).toBe(false);
  });

  it("refuses an Origin that is not a URL or not http(s)", () => {
    expect(isSameOrigin(post({ origin: "not a url" }))).toBe(false);
    expect(isSameOrigin(post({ origin: "file://app.example.com" }))).toBe(false);
  });

  it("uses the Host header over the URL", () => {
    const request = post(
      { origin: "https://app.example.com", host: "app.example.com", "x-forwarded-proto": "https" },
      "http://127.0.0.1:3000/api/jobs",
    );
    expect(isSameOrigin(request)).toBe(true);
  });

  it("honours x-forwarded-host from the platform proxy", () => {
    const request = post(
      {
        origin: "https://app.example.com",
        host: "internal:3000",
        "x-forwarded-host": "app.example.com",
        "x-forwarded-proto": "https",
      },
      "http://internal:3000/api/jobs",
    );
    expect(isSameOrigin(request)).toBe(true);
  });

  it("uses the first x-forwarded-host when there are several", () => {
    const request = post(
      {
        origin: "https://app.example.com",
        "x-forwarded-host": "app.example.com, internal:3000",
        "x-forwarded-proto": "https, http",
      },
      "http://internal:3000/api/jobs",
    );
    expect(isSameOrigin(request)).toBe(true);
  });

  it("refuses an Origin matching only the internal host behind a proxy", () => {
    const request = post(
      { origin: "http://internal:3000", "x-forwarded-host": "app.example.com" },
      "http://internal:3000/api/jobs",
    );
    expect(isSameOrigin(request)).toBe(false);
  });

  it("treats an explicit default port as the same host", () => {
    const request = post({ origin: "https://app.example.com", host: "app.example.com:443" });
    expect(isSameOrigin(request)).toBe(true);
  });

  it("refuses an Origin with another scheme on the same host", () => {
    expect(isSameOrigin(post({ origin: "http://app.example.com" }))).toBe(false);
  });

  it("takes the scheme from x-forwarded-proto behind a TLS-terminating proxy", () => {
    const request = post(
      {
        origin: "https://app.example.com",
        "x-forwarded-host": "app.example.com",
        "x-forwarded-proto": "https",
      },
      "http://internal:3000/api/jobs",
    );
    expect(isSameOrigin(request)).toBe(true);
    expect(
      isSameOrigin(
        post(
          { origin: "http://app.example.com", "x-forwarded-host": "app.example.com", "x-forwarded-proto": "https" },
          "http://internal:3000/api/jobs",
        ),
      ),
    ).toBe(false);
  });

  it("falls back to the request URL's scheme without x-forwarded-proto", () => {
    expect(
      isSameOrigin(post({ origin: "https://app.example.com", host: "app.example.com" }, "http://app.example.com/api/jobs")),
    ).toBe(false);
  });
});

describe("requireSameOrigin", () => {
  it("returns null for a same-origin request", () => {
    expect(requireSameOrigin(post({ "sec-fetch-site": "same-origin" }))).toBeNull();
  });

  it("returns a 403 forbidden response for a cross-site request", async () => {
    const response = requireSameOrigin(post({ origin: "https://evil.example" }));
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: { code: "forbidden", message: CROSS_SITE_MESSAGE },
    });
  });
});
