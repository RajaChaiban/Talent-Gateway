import { describe, expect, it } from "vitest";
import { DEFAULT_FILES_DIR, DEFAULT_RUNS, parseArgs } from "./args";

describe("parseArgs", () => {
  it("uses the defaults with no arguments", () => {
    expect(parseArgs([])).toEqual({
      model: null,
      label: "run",
      runs: DEFAULT_RUNS,
      filesDir: DEFAULT_FILES_DIR,
      only: null,
      help: false,
    });
  });

  it("reads every flag", () => {
    expect(
      parseArgs([
        "--label",
        "baseline",
        "--model",
        "anthropic/some-model-1.0",
        "--runs",
        "5",
        "--files",
        "other/dir",
        "--only",
        "8",
      ]),
    ).toEqual({ model: "anthropic/some-model-1.0", label: "baseline", runs: 5, filesDir: "other/dir", only: [8], help: false });
  });

  it("reads --only as test numbers in order, once each", () => {
    expect(parseArgs(["--only", "8,3"]).only).toEqual([3, 8]);
    expect(parseArgs(["--only", "5, 5"]).only).toEqual([5]);
  });

  it("refuses an --only outside 1 to 8, and a label kept for comparison reports", () => {
    expect(() => parseArgs(["--only", "9"])).toThrow("from 1 to 8");
    expect(() => parseArgs(["--only", "8,"])).toThrow("from 1 to 8");
    expect(() => parseArgs(["--only", "all"])).toThrow("from 1 to 8");
    expect(() => parseArgs(["--label", "Compare A vs B"])).toThrow("comparison reports");
  });

  it("asks for help", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
  });

  it("refuses an unknown flag, a missing value, a bad slug and a bad run count", () => {
    expect(() => parseArgs(["--bogus", "1"])).toThrow("Unknown argument --bogus");
    expect(() => parseArgs(["--label"])).toThrow("--label needs a value");
    expect(() => parseArgs(["--label", "--runs"])).toThrow("--label needs a value");
    expect(() => parseArgs(["--model", "no-slash"])).toThrow("provider/model");
    expect(() => parseArgs(["--runs", "0"])).toThrow("1 to 10");
    expect(() => parseArgs(["--runs", "2.5"])).toThrow("1 to 10");
    expect(() => parseArgs(["--label", "   "])).toThrow("must not be empty");
  });
});
