import { describe, expect, it } from "vitest";
import {
  asStored,
  formatScore,
  isScore,
  isStoredScore,
  nearestStored,
  toScore,
  toStored,
  type Score,
} from "./score";

const EVERY_TENTH = Array.from({ length: 101 }, (_, stored) => stored);

/** Test input that is not necessarily a valid score: the functions must reject it at runtime. */
const asScore = (value: unknown) => value as Score;

describe("toScore and toStored", () => {
  it("converts the examples in the spec", () => {
    expect(toScore(asStored(83))).toBe(8.3);
    expect(toStored(asScore(8.3))).toBe(83);
  });

  it.each(EVERY_TENTH)("round-trips stored %i", (stored) => {
    const score = toScore(asStored(stored));
    expect(toStored(score)).toBe(stored);
    expect(toStored(asScore(Number(formatScore(asStored(stored)))))).toBe(stored);
  });

  it("is exact for the values that break naive float conversion", () => {
    expect(3 * 0.1).not.toBe(0.3);
    expect(toScore(asStored(3))).toBe(0.3);
    expect(0.57 * 100).not.toBe(57);
    expect(toStored(asScore(0.7))).toBe(7);
    expect(toStored(asScore(1.1))).toBe(11);
    expect(toStored(asScore(8.3))).toBe(83);
  });

  it("keeps the ends", () => {
    expect(toStored(asScore(0))).toBe(0);
    expect(toStored(asScore(10))).toBe(100);
    expect(Object.is(toStored(asScore(-0)), 0)).toBe(true);
  });

  it.each([10.1, -0.1, 8.25, 8.31, 0.05, 10.0001, NaN, Infinity, -Infinity, 100])(
    "rejects %s",
    (value) => {
      expect(() => toStored(asScore(value))).toThrow(RangeError);
      expect(isScore(value)).toBe(false);
    },
  );

  it.each(["7", "", null, undefined, {}, [], true])("rejects the non-number %j", (value) => {
    expect(isScore(value)).toBe(false);
    expect(() => toStored(asScore(value))).toThrow(RangeError);
  });

  it.each([-1, 101, 8.5, NaN, Infinity])("rejects stored %s", (value) => {
    expect(isStoredScore(value)).toBe(false);
    expect(() => asStored(value)).toThrow(RangeError);
  });
});

describe("formatScore", () => {
  it("always shows one decimal", () => {
    expect(formatScore(asStored(83))).toBe("8.3");
    expect(formatScore(asStored(100))).toBe("10.0");
    expect(formatScore(asStored(0))).toBe("0.0");
    expect(formatScore(asStored(80))).toBe("8.0");
    expect(formatScore(asStored(5))).toBe("0.5");
  });

  it.each(EVERY_TENTH)("formats stored %i as one decimal", (stored) => {
    expect(formatScore(asStored(stored))).toMatch(/^(10\.0|\d\.\d)$/);
  });
});

describe("nearestStored", () => {
  it("rounds to a tenth and clamps to the range", () => {
    expect(nearestStored(8.25)).toBe(83);
    expect(nearestStored(8.3)).toBe(83);
    expect(nearestStored(-4)).toBe(0);
    expect(nearestStored(99)).toBe(100);
  });
});

describe("the two scales are different types", () => {
  const stored = asStored(83);
  const shown = toScore(stored);

  /** Never called: the point is that each line below fails to compile without its directive. */
  function typeChecks() {
    // @ts-expect-error a Score is not a StoredScore
    formatScore(shown);
    // @ts-expect-error a plain number is not a StoredScore
    formatScore(83);
    // @ts-expect-error a StoredScore is not a Score
    toStored(stored);
    // @ts-expect-error a plain number is not a Score
    toStored(8.3);
    // @ts-expect-error a Score cannot be converted to a score again
    toScore(shown);
  }

  it("rejects a shown score where a stored one is expected, and the reverse", () => {
    expect(typeChecks).toBeTypeOf("function");
    expect(formatScore(stored)).toBe("8.3");
  });
});
