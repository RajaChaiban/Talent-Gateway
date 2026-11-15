import { describe, expect, it } from "vitest";
import { removalVerdict } from "./removal";

describe("removalVerdict", () => {
  it("counts a successful delete as removed", () => {
    expect(removalVerdict({ ok: true, data: { removed: true } })).toEqual({ removed: true });
  });

  it("counts a 404 as removed: the row is already gone", () => {
    expect(removalVerdict({ ok: false, message: "Resume not found", status: 404 })).toEqual({
      removed: true,
    });
  });

  it("keeps the row and shows the message for a 409, a 5xx and a lost connection", () => {
    for (const status of [409, 500, 503, null]) {
      expect(removalVerdict({ ok: false, message: "No.", status })).toEqual({
        removed: false,
        message: "No.",
      });
    }
  });
});
