import { describe, expect, it } from "vitest";
import { asStored, formatScore } from "@/lib/score";
import { updateThresholds } from "./queries";
import { JOB_SCORES, toApi } from "./serialize";
import type { Job } from "./types";

const job: Job = {
  id: "job-1",
  title: "Backend engineer",
  description: "Build APIs.",
  top_talent_threshold: asStored(85),
  invite_threshold: asStored(70),
  created_at: "2026-03-05T10:00:00Z",
};

describe("toApi", () => {
  it("turns the named stored scores into 0 to 10 scores and leaves the rest", () => {
    expect(toApi(job, JOB_SCORES)).toEqual({
      ...job,
      top_talent_threshold: 8.5,
      invite_threshold: 7,
    });
  });

  it("does not change its input", () => {
    toApi(job, JOB_SCORES);
    expect(job.top_talent_threshold).toBe(85);
  });
});

const client = { from: () => undefined } as never;

describe("a serialised job cannot be used as a stored one", () => {
  const api = toApi(job, JOB_SCORES);

  /** Never called: the point is that each line below fails to compile without its directive. */
  function typeChecks() {
    // @ts-expect-error already serialised: its scores are no longer stored tenths
    toApi(api, JOB_SCORES);
    // @ts-expect-error a 0 to 10 score is not a StoredScore
    formatScore(api.top_talent_threshold);
    // @ts-expect-error an API score is not a stored one: the query layer takes stored tenths
    updateThresholds(client, "id", { top_talent_threshold: api.top_talent_threshold });
  }

  it("is a compile error to serialise twice or to use the 0 to 10 form as stored tenths", () => {
    expect(typeChecks).toBeTypeOf("function");
    expect(formatScore(job.top_talent_threshold)).toBe("8.5");
  });
});
