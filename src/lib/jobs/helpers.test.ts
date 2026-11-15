import { describe, expect, it } from "vitest";
import {
  countResumes,
  formatJobDate,
  isTopTalent,
  rankCandidates,
  resumeCountLabel,
  selectNotAtsReady,
  selectQueued,
  sortCandidates,
} from "./helpers";
import { asStored } from "@/lib/score";
import type { Candidate, ResumeForFilter } from "./types";

function candidate(id: string, match_score: number, created_at: string): Candidate {
  return {
    id,
    match_score: asStored(match_score),
    created_at,
    email: null,
    full_name: id,
    gaps: [],
    invite_status: "NONE",
    job_id: "job",
    match_summary: "",
    radar_results: {},
    resume_id: id,
    strengths: [],
  };
}

function resume(id: string, overrides: Partial<ResumeForFilter>): ResumeForFilter {
  return {
    id,
    file_name: `${id}.pdf`,
    ats_score: null,
    ats_reasons: [],
    created_at: "2026-01-01T00:00:00Z",
    ats_status: null,
    ats_override: false,
    ...overrides,
  };
}

describe("sortCandidates", () => {
  it("orders by match score, highest first", () => {
    const sorted = sortCandidates([
      candidate("a", 55, "2026-01-01T00:00:00Z"),
      candidate("b", 92, "2026-01-02T00:00:00Z"),
      candidate("c", 71, "2026-01-03T00:00:00Z"),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["b", "c", "a"]);
  });

  it("breaks a tie on the real time, not the text, when fractions differ", () => {
    const sorted = sortCandidates([
      candidate("later", 80, "2026-01-01T00:00:00.500Z"),
      candidate("earlier", 80, "2026-01-01T00:00:00Z"),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["earlier", "later"]);
  });

  it("keeps the earlier candidate first on a tie and does not mutate the input", () => {
    const input = [
      candidate("late", 80, "2026-01-02T00:00:00Z"),
      candidate("early", 80, "2026-01-01T00:00:00Z"),
    ];
    expect(sortCandidates(input).map((c) => c.id)).toEqual(["early", "late"]);
    expect(input.map((c) => c.id)).toEqual(["late", "early"]);
  });
});

describe("selectNotAtsReady", () => {
  it("keeps NOT_ATS_READY resumes that were not overridden", () => {
    const result = selectNotAtsReady(
      [
        resume("rejected", { ats_status: "NOT_ATS_READY", ats_reasons: ["Too little text"] }),
        resume("overridden", { ats_status: "NOT_ATS_READY", ats_override: true }),
        resume("ready", { ats_status: "ATS_READY" }),
        resume("unchecked", { ats_status: null }),
      ],
      new Set(),
    );
    expect(result).toEqual([
      {
        id: "rejected",
        file_name: "rejected.pdf",
        ats_score: null,
        ats_reasons: ["Too little text"],
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);
  });
});

describe("isTopTalent", () => {
  it("counts a score equal to the threshold", () => {
    expect(isTopTalent(asStored(79), asStored(80))).toBe(false);
    expect(isTopTalent(asStored(80), asStored(80))).toBe(true);
    expect(isTopTalent(asStored(81), asStored(80))).toBe(true);
  });
});

describe("counts identity", () => {
  const resumes = [
    resume("scored", { ats_status: "ATS_READY" }),
    resume("scored-override", { ats_status: "NOT_ATS_READY", ats_override: true }),
    resume("queued", { ats_status: "NOT_ATS_READY", ats_override: true }),
    resume("set-aside-1", { ats_status: "NOT_ATS_READY" }),
    resume("set-aside-2", { ats_status: "NOT_ATS_READY" }),
    resume("new-1", {}),
    resume("new-2", {}),
    resume("new-3", {}),
    resume("ready", { ats_status: "ATS_READY" }),
    resume("unchecked-override", { ats_status: null, ats_override: true }),
    resume("scored-set-aside", { ats_status: "NOT_ATS_READY" }),
  ];
  const scored = new Set(["scored", "scored-override", "scored-set-aside"]);

  it("puts every resume in exactly one bucket", () => {
    const counts = countResumes(resumes, scored);
    expect(counts).toEqual({
      resumes: 11,
      scored: 3,
      queued: 2,
      unchecked: 3,
      not_ats_ready: 2,
      awaiting_scoring: 1,
    });
    const { resumes: total, ...buckets } = counts;
    expect(Object.values(buckets).reduce((a, b) => a + b, 0)).toBe(total);
  });

  it("agrees with the not-ready and queued lists", () => {
    const notReady = selectNotAtsReady(resumes, scored).map((r) => r.id);
    expect(notReady).toEqual(["set-aside-1", "set-aside-2"]);
    expect(notReady).toHaveLength(countResumes(resumes, scored).not_ats_ready);
    expect(selectQueued(resumes, scored).map((r) => r.id)).toEqual(["queued", "unchecked-override"]);
  });
});

describe("rankCandidates", () => {
  const row = (id: string, over: Partial<Candidate>): Candidate => ({
    ...candidate(id, 70, "2026-01-01T00:00:00Z"),
    ...over,
  });
  const files = [resume("high", {}), resume("low", {})];

  it("ranks and attaches file names", () => {
    const [first, second] = rankCandidates(
      [
        row("low", { match_score: asStored(40) }),
        row("high", { match_score: asStored(90), resume_id: "high" }),
      ],
      files,
    );
    expect(first?.id).toBe("high");
    expect(first?.resume_file_name).toBe("high.pdf");
    expect(second?.id).toBe("low");
    expect(second?.resume_file_name).toBe("low.pdf");
  });

  it("tolerates empty or malformed radar results", () => {
    const [a, b] = rankCandidates(
      [
        row("high", { match_score: asStored(90), radar_results: {} }),
        row("low", { radar_results: { copycat: "yes" } }),
      ],
      files,
    );
    expect(a?.radar_results).toEqual({});
    expect(b?.radar_results).toEqual({});
  });
});

describe("formatJobDate", () => {
  it("prints the UTC date in a fixed locale", () => {
    expect(formatJobDate("2026-03-05T23:30:00Z")).toBe("Mar 5, 2026");
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatJobDate("nope")).toBe("");
  });
});

describe("resumeCountLabel", () => {
  it("pluralises", () => {
    expect(resumeCountLabel(0)).toBe("0 resumes");
    expect(resumeCountLabel(1)).toBe("1 resume");
    expect(resumeCountLabel(6)).toBe("6 resumes");
  });
});
