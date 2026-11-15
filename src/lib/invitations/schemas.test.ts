import { describe, expect, it } from "vitest";
import { candidateIdSchema, inviteBodySchema, inviteEmailSchema } from "./schemas";

describe("inviteBodySchema (acceptance 4: an empty or invalid address is refused)", () => {
  it("accepts a valid address and trims it", () => {
    expect(inviteBodySchema.parse({ email: "  priya@example.com " })).toEqual({
      email: "priya@example.com",
    });
  });

  it.each([
    ["empty", ""],
    ["blank", "   "],
    ["no at sign", "priya.example.com"],
    ["no domain", "priya@"],
    ["too long", `${"a".repeat(250)}@example.com`],
  ])("refuses an address that is %s", (_, email) => {
    expect(inviteEmailSchema.safeParse(email).success).toBe(false);
    expect(inviteBodySchema.safeParse({ email }).success).toBe(false);
  });

  it("refuses a missing or non-string email", () => {
    expect(inviteBodySchema.safeParse({}).success).toBe(false);
    expect(inviteBodySchema.safeParse({ email: 42 }).success).toBe(false);
  });
});

describe("candidateIdSchema", () => {
  it("accepts a UUID and refuses anything else", () => {
    expect(candidateIdSchema.safeParse("0b4d8f3e-6f0a-4c52-8d57-3a1f9b2c7e10").success).toBe(true);
    expect(candidateIdSchema.safeParse("not-a-uuid").success).toBe(false);
  });
});
