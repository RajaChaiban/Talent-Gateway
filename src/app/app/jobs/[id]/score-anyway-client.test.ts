import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonData, jsonError } from "@/lib/http";
import {
  requestScoreAnyway,
  SCORE_ANYWAY_BUSY_MESSAGE,
  SCORE_ANYWAY_FAILED_MESSAGE,
  scoreAnywayOutcome,
} from "./score-anyway-client";

const FILE = "scan.pdf";
const ok = (status: string) => jsonData({ resume_id: "r-1", ats_override: true, status });
const failed = { kind: "error", message: SCORE_ANYWAY_FAILED_MESSAGE, refresh: false };

describe("scoreAnywayOutcome", () => {
  it("reports a scored resume and asks for a refresh", async () => {
    expect(await scoreAnywayOutcome(ok("scored"), FILE)).toEqual({
      kind: "done",
      message: "scan.pdf was scored. It is now on the Ranked tab.",
      refresh: true,
    });
  });

  it.each([
    ["failed", "scan.pdf was not scored: the analysis failed."],
    ["ats_failed", "scan.pdf was not scored: the analysis failed."],
    ["not_extracted", "scan.pdf has no readable text yet, so it was not scored."],
  ])("says plainly that a %s resume was not scored and where it is now", async (status, start) => {
    expect(await scoreAnywayOutcome(ok(status), FILE)).toEqual({
      kind: "notice",
      message: `${start} It is listed under Queued for scoring on the Ranked tab.`,
      refresh: true,
    });
  });

  it.each(["This resume has already been scored.", "This resume was not set aside."])(
    "shows the server's reason for a 409 (%s) and refreshes the stale list",
    async (message) => {
      expect(await scoreAnywayOutcome(jsonError("conflict", message, 409), FILE)).toEqual({
        kind: "notice",
        message: `scan.pdf: ${message}`,
        refresh: true,
      });
    },
  );

  it("treats a busy model (503) as try again, without a refresh", async () => {
    const busy = jsonError("model_busy", "The AI service is busy. Trying again shortly.", 503, {
      "Retry-After": "2",
    });
    expect(await scoreAnywayOutcome(busy, FILE)).toEqual({
      kind: "error",
      message: SCORE_ANYWAY_BUSY_MESSAGE,
      refresh: false,
    });
  });

  it("uses the general message for any other failure or an unreadable body", async () => {
    expect(await scoreAnywayOutcome(jsonError("not_found", "Resume not found", 404), FILE)).toEqual(failed);
    expect(await scoreAnywayOutcome(new Response(null, { status: 500 }), FILE)).toEqual(failed);
    expect(await scoreAnywayOutcome(new Response("nope", { status: 409 }), FILE)).toEqual(failed);
    expect(await scoreAnywayOutcome(jsonData({ status: "unknown" }), FILE)).toEqual(failed);
    expect(await scoreAnywayOutcome(new Response("<html>", { status: 200 }), FILE)).toEqual(failed);
  });
});

describe("requestScoreAnyway", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts to the resume's route and returns the outcome", async () => {
    const fetchMock = vi.fn(async () => ok("scored"));
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await requestScoreAnyway("r-1", FILE);
    expect(fetchMock).toHaveBeenCalledWith("/api/resumes/r-1/score-anyway", { method: "POST" });
    expect(outcome.kind).toBe("done");
  });

  it("turns a network failure into the general error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await requestScoreAnyway("r-1", FILE)).toEqual(failed);
  });
});
