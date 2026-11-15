import { describe, expect, it } from "vitest";
import {
  createJobFieldErrors,
  createJobSchema,
  DESCRIPTION_MAX,
  inputErrorMessage,
  jobIdSchema,
  TITLE_MAX,
  updateThresholdsSchema,
} from "./schemas";

const valid = { title: "Backend engineer", description: "Build APIs." };

describe("createJobSchema", () => {
  it("applies the 8.0 / 7.0 defaults, stored as 80 / 70", () => {
    expect(createJobSchema.parse(valid)).toEqual({
      ...valid,
      top_talent_threshold: 80,
      invite_threshold: 70,
    });
  });

  it("trims the title and description", () => {
    const parsed = createJobSchema.parse({
      title: "  Backend engineer  ",
      description: "\n Build APIs. \n",
    });
    expect(parsed.title).toBe("Backend engineer");
    expect(parsed.description).toBe("Build APIs.");
  });

  it("rejects an empty or whitespace-only title", () => {
    expect(createJobSchema.safeParse({ ...valid, title: "" }).success).toBe(false);
    expect(createJobSchema.safeParse({ ...valid, title: "   " }).success).toBe(false);
  });

  it("accepts a 200 character title and rejects 201", () => {
    expect(
      createJobSchema.safeParse({ ...valid, title: "a".repeat(TITLE_MAX) }).success,
    ).toBe(true);
    expect(
      createJobSchema.safeParse({ ...valid, title: "a".repeat(TITLE_MAX + 1) }).success,
    ).toBe(false);
  });

  it("rejects an empty description and one over 20,000 characters", () => {
    expect(createJobSchema.safeParse({ ...valid, description: "" }).success).toBe(false);
    expect(
      createJobSchema.safeParse({ ...valid, description: "a".repeat(DESCRIPTION_MAX) })
        .success,
    ).toBe(true);
    expect(
      createJobSchema.safeParse({
        ...valid,
        description: "a".repeat(DESCRIPTION_MAX + 1),
      }).success,
    ).toBe(false);
  });

  it.each([
    [0, 0],
    [10, 100],
  ])("accepts the threshold bound %i, stored as %i", (value, stored) => {
    const result = createJobSchema.safeParse({
      ...valid,
      top_talent_threshold: value,
      invite_threshold: value,
    });
    expect(result.success).toBe(true);
    expect(result.data?.top_talent_threshold).toBe(stored);
  });

  it("parses a 0 to 10 threshold to stored tenths", () => {
    const parsed = createJobSchema.parse({
      ...valid,
      top_talent_threshold: 8.5,
      invite_threshold: 5.1,
    });
    expect(parsed.top_talent_threshold).toBe(85);
    expect(parsed.invite_threshold).toBe(51);
  });

  it.each([-0.1, 10.1, 100, 8.25, "7", null])("rejects threshold %s", (value) => {
    expect(
      createJobSchema.safeParse({ ...valid, top_talent_threshold: value }).success,
    ).toBe(false);
    expect(
      createJobSchema.safeParse({ ...valid, invite_threshold: value }).success,
    ).toBe(false);
  });

  it("maps issues to one message per field", () => {
    const result = createJobSchema.safeParse({
      title: " ",
      description: "",
      top_talent_threshold: 10.1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = createJobFieldErrors(result.error);
      expect(Object.keys(errors).sort()).toEqual([
        "description",
        "title",
        "top_talent_threshold",
      ]);
      expect(inputErrorMessage(result.error)).toMatch(/^title: /);
      expect(errors.top_talent_threshold).toBe(
        "Top talent threshold must be a number from 0 to 10 with at most one decimal",
      );
    }
  });
});

describe("updateThresholdsSchema", () => {
  it("accepts either threshold alone or both", () => {
    expect(updateThresholdsSchema.parse({ top_talent_threshold: 9 })).toEqual({
      top_talent_threshold: 90,
    });
    expect(updateThresholdsSchema.parse({ invite_threshold: 0 })).toEqual({ invite_threshold: 0 });
    expect(
      updateThresholdsSchema.parse({ top_talent_threshold: 9, invite_threshold: 6.5 }),
    ).toEqual({ top_talent_threshold: 90, invite_threshold: 65 });
  });

  it("requires at least one threshold", () => {
    expect(updateThresholdsSchema.safeParse({}).success).toBe(false);
    expect(updateThresholdsSchema.safeParse({ title: "x" }).success).toBe(false);
  });

  it.each([-0.1, 10.1, 1.55, "8"])("rejects %s", (value) => {
    expect(updateThresholdsSchema.safeParse({ top_talent_threshold: value }).success).toBe(
      false,
    );
    expect(updateThresholdsSchema.safeParse({ invite_threshold: value }).success).toBe(false);
  });
});

describe("jobIdSchema", () => {
  it("accepts a uuid and rejects anything else", () => {
    expect(jobIdSchema.safeParse("0b4d8f3e-6f0a-4c52-8d57-3a1f9b2c7e10").success).toBe(true);
    expect(jobIdSchema.safeParse("not-an-id").success).toBe(false);
    expect(jobIdSchema.safeParse("").success).toBe(false);
  });
});
