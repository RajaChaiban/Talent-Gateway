import { describe, expect, it } from "vitest";
import { SCORE_WEIGHTS } from "@/lib/config";
import { skillsScore, totalScore, type MustHaveStatus, type ScoreParts } from "./total-score";

const statuses = (...list: MustHaveStatus[]) => list.map((status) => ({ status }));

const NOTHING: ScoreParts = {
  role_match: "same",
  start_score: 5,
  must_haves: statuses("missing", "missing"),
  evidence: 0,
  proof_of_work: 0,
  education: 0,
};

const EVERYTHING: ScoreParts = {
  role_match: "same",
  start_score: 5,
  must_haves: statuses("shown", "shown", "shown"),
  evidence: SCORE_WEIGHTS.evidenceMax,
  proof_of_work: SCORE_WEIGHTS.proofOfWorkMax,
  education: SCORE_WEIGHTS.educationMax,
};

describe("totalScore", () => {
  it("gives the same role with nothing else exactly 5.0 (stored 50)", () => {
    expect(totalScore(NOTHING)).toMatchObject({ start: 5, skills: 0, total: 5, stored: 50 });
  });

  it("gives the same role with everything 10.0 (stored 100)", () => {
    expect(totalScore(EVERYTHING)).toMatchObject({ skills: 3, total: 10, stored: 100 });
  });

  it("starts the same role at 5.0 whatever start score the model wrote", () => {
    expect(totalScore({ ...NOTHING, start_score: 0 }).stored).toBe(50);
    expect(totalScore({ ...NOTHING, start_score: 3.2 }).stored).toBe(50);
  });

  it.each([
    ["shown", 3],
    ["equivalent", 1.5],
    ["listed", 0.75],
    ["missing", 0],
  ] as const)("weighs a must-have that is %s as %s of 3.0", (status, skills) => {
    expect(skillsScore(statuses(status))).toBe(skills);
    expect(totalScore({ ...NOTHING, must_haves: statuses(status) }).total).toBe(Math.round((5 + skills) * 10) / 10);
  });

  it("shares the 3.0 skills points evenly across the must-haves", () => {
    expect(skillsScore(statuses("shown", "missing"))).toBe(1.5);
    expect(skillsScore(statuses("shown", "equivalent", "listed", "missing"))).toBeCloseTo((3 * 1.75) / 4, 10);
    expect(skillsScore([])).toBe(0);
  });

  it("clamps a related start to 2.5 to 4.0 and an unrelated start to 0 to 1.5", () => {
    expect(totalScore({ ...NOTHING, role_match: "related", start_score: 5 }).start).toBe(4);
    expect(totalScore({ ...NOTHING, role_match: "related", start_score: 1 }).start).toBe(2.5);
    expect(totalScore({ ...NOTHING, role_match: "related", start_score: 3.2 }).start).toBe(3.2);
    expect(totalScore({ ...NOTHING, role_match: "unrelated", start_score: 4 }).start).toBe(1.5);
    expect(totalScore({ ...NOTHING, role_match: "unrelated", start_score: -1 }).start).toBe(0);
  });

  it("clamps evidence, proof of work and education to their ranges", () => {
    const over = totalScore({ ...NOTHING, evidence: 3, proof_of_work: 2, education: 1 });
    expect(over).toMatchObject({ evidence: 1, proof_of_work: 0.6, education: 0.4, total: 7 });
    const under = totalScore({ ...NOTHING, evidence: -1, proof_of_work: -1, education: -1 });
    expect(under).toMatchObject({ evidence: 0, proof_of_work: 0, education: 0, total: 5 });
  });

  it("scales the additions by start / 5 for a related or unrelated role", () => {
    expect(totalScore({ ...EVERYTHING, role_match: "related", start_score: 4 }).total).toBe(8);
    expect(totalScore({ ...EVERYTHING, role_match: "related", start_score: 2.5 }).total).toBe(5);
    expect(totalScore({ ...EVERYTHING, role_match: "unrelated", start_score: 1 }).total).toBe(2);
    expect(totalScore({ ...EVERYTHING, role_match: "unrelated", start_score: 0 }).total).toBe(0);
  });

  it("keeps an unrelated resume weak however much it shows", () => {
    const unrelated = totalScore({ ...EVERYTHING, role_match: "unrelated", start_score: 9 });
    expect(unrelated).toMatchObject({ start: 1.5, total: 3, stored: 30 });
  });

  it("rounds the total to one decimal", () => {
    expect(totalScore({ ...NOTHING, must_haves: statuses("shown", "missing", "missing") })).toMatchObject({
      total: 6,
      stored: 60,
    });
    expect(totalScore({ ...NOTHING, must_haves: statuses("listed", "missing", "missing", "missing", "missing", "missing", "missing") })).toMatchObject({
      total: 5.1,
      stored: 51,
    });
    expect(totalScore({ ...NOTHING, role_match: "related", start_score: 2.5, evidence: 0.5 }).total).toBe(2.8);
    expect(totalScore({ ...NOTHING, role_match: "related", start_score: 3.5, evidence: 0.5 }).total).toBe(3.9);
  });

  it("puts two resumes about 0.6 apart when three of seven must-haves are equivalent instead of shown", () => {
    const shown = totalScore({ ...NOTHING, must_haves: statuses(...Array<MustHaveStatus>(7).fill("shown")) });
    const equivalent = totalScore({
      ...NOTHING,
      must_haves: statuses("shown", "shown", "shown", "shown", "equivalent", "equivalent", "equivalent"),
    });
    expect(shown.total - equivalent.total).toBeCloseTo(0.6, 5);
    expect(shown.stored - equivalent.stored).toBe(6);
  });
});
