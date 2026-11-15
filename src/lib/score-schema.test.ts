import { describe, expect, it } from "vitest";
import { scoreField } from "./score-schema";

describe("scoreField", () => {
  const field = scoreField("Invite threshold");

  it("parses 0 to 10 scores to stored tenths", () => {
    expect(field.parse(8.5)).toBe(85);
    expect(field.parse(0)).toBe(0);
    expect(field.parse(10)).toBe(100);
  });

  it.each([10.1, -0.1, 8.25, "7", null, NaN])("rejects %s with the scale in the message", (value) => {
    const result = field.safeParse(value);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Invite threshold must be a number from 0 to 10 with at most one decimal",
      );
    }
  });
});
