import { APICallError, RetryError } from "ai";
import { describe, expect, it } from "vitest";
import { DEFAULT_RETRY_AFTER_SECONDS, rateLimitRetryAfter } from "./errors";

function apiError(statusCode: number, headers: Record<string, string> = {}) {
  return new APICallError({
    message: "call failed",
    url: "https://ai-gateway.vercel.sh/v1/ai/language-model",
    requestBodyValues: {},
    statusCode,
    responseHeaders: headers,
  });
}

describe("rateLimitRetryAfter", () => {
  it("reads Retry-After from a 429", () => {
    expect(rateLimitRetryAfter(apiError(429, { "retry-after": "7" }))).toBe(7);
  });

  it("uses the default wait for a 429 without a usable header", () => {
    expect(rateLimitRetryAfter(apiError(429))).toBe(DEFAULT_RETRY_AFTER_SECONDS);
    expect(rateLimitRetryAfter(apiError(429, { "retry-after": "soon" }))).toBe(
      DEFAULT_RETRY_AFTER_SECONDS,
    );
  });

  it("caps a long Retry-After at a minute", () => {
    expect(rateLimitRetryAfter(apiError(429, { "retry-after": "3600" }))).toBe(60);
  });

  it("finds a 429 inside the SDK's RetryError and uses the latest attempt's header", () => {
    const error = new RetryError({
      message: "Failed after 2 attempts",
      reason: "maxRetriesExceeded",
      errors: [apiError(429, { "retry-after": "2" }), apiError(429, { "retry-after": "3" })],
    });
    expect(rateLimitRetryAfter(error)).toBe(3);
  });

  it("recognises the gateway's own rate-limit error by name and type", () => {
    const gatewayError = Object.assign(new Error("slow down"), {
      name: "GatewayRateLimitError",
      type: "rate_limit_exceeded",
      cause: apiError(429, { "retry-after": "4" }),
    });
    expect(rateLimitRetryAfter(gatewayError)).toBe(4);
  });

  it("is null for other failures", () => {
    expect(rateLimitRetryAfter(apiError(500))).toBeNull();
    expect(rateLimitRetryAfter(new Error("boom"))).toBeNull();
    expect(rateLimitRetryAfter(null)).toBeNull();
  });
});
