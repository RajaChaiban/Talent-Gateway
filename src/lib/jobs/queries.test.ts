import { describe, expect, it, vi } from "vitest";
import { ok, queryBuilder, type QueryResult } from "../../../test/supabase-mock";
import { getJobPage, JOB_LIST_LIMIT, JobsDataError, listJobs } from "./queries";

type Result = { data: unknown; error: unknown };

/** A stand-in for the Supabase client that records the query it was asked to build. */
function clientReturning(result: Result) {
  const limit = vi.fn().mockResolvedValue(result);
  const order = vi.fn(() => ({ limit }));
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as never, from, select, order, limit };
}

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Senior Frontend Engineer",
  status: "CREATED",
  created_at: "2026-11-14T10:00:00Z",
  top_talent_threshold: 80,
  invite_threshold: 70,
};

describe("listJobs", () => {
  it("reads jobs newest first, capped, with the resume count in the same query", async () => {
    const { client, from, select, order, limit } = clientReturning({
      data: [{ ...row, resumes: [{ count: 6 }] }],
      error: null,
    });

    const jobs = await listJobs(client);

    expect(from).toHaveBeenCalledWith("jobs");
    expect(select).toHaveBeenCalledWith(expect.stringContaining("resumes(count)"));
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(JOB_LIST_LIMIT);
    expect(jobs).toEqual([{ ...row, resume_count: 6 }]);
  });

  it("does not ask for the description, which the list never shows", async () => {
    const { client, select } = clientReturning({ data: [], error: null });
    await listJobs(client);
    expect(select).not.toHaveBeenCalledWith(expect.stringContaining("description"));
  });

  it("counts a job with no resumes as zero", async () => {
    const { client } = clientReturning({ data: [{ ...row, resumes: [] }], error: null });
    expect((await listJobs(client))[0].resume_count).toBe(0);
  });

  it("returns an empty list when there are no jobs", async () => {
    const { client } = clientReturning({ data: [], error: null });
    expect(await listJobs(client)).toEqual([]);
  });

  it("throws a JobsDataError that keeps the database error as its cause", async () => {
    const cause = { code: "42501", message: "permission denied for table jobs" };
    const { client } = clientReturning({ data: null, error: cause });

    const error = await listJobs(client).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(JobsDataError);
    expect((error as JobsDataError).message).toBe("Jobs database call failed: list jobs");
    expect((error as JobsDataError).cause).toBe(cause);
  });
});

describe("getJobPage", () => {
  const JOB_ID = row.id;
  const invitation = {
    sent_to: "priya@example.com",
    sent_at: "2026-11-15T10:00:05.000Z",
    approved_at: "2026-11-15T10:00:00.000Z",
  };
  const candidateRow = (id: string, score: number, invitations: typeof invitation | null) => ({
    id,
    job_id: JOB_ID,
    resume_id: `resume-${id}`,
    full_name: id,
    match_score: score,
    match_summary: "",
    strengths: [],
    gaps: [],
    radar_results: {},
    email: `${id}@example.com`,
    invite_status: invitations ? "SENT" : "NONE",
    created_at: "2026-11-14T10:00:00Z",
    invitations,
  });

  function client(results: Record<string, QueryResult>) {
    const builders = Object.fromEntries(
      Object.entries(results).map(([table, result]) => [table, queryBuilder(result)]),
    );
    return { client: { from: vi.fn((table: string) => builders[table]) } as never, builders };
  }

  it("reads each candidate's invitation in the same candidates query and attaches it", async () => {
    const { client: supabase, builders } = client({
      jobs: ok({ ...row, description: "d" }),
      candidates: ok([candidateRow("a", 60, null), candidateRow("b", 90, invitation)]),
      resumes: ok([]),
    });

    const page = await getJobPage(supabase, JOB_ID);

    expect(builders.candidates.select).toHaveBeenCalledWith(
      "*, invitations(sent_to, sent_at, approved_at)",
    );
    expect(page?.candidates.map((candidate) => [candidate.id, candidate.invitation])).toEqual([
      ["b", invitation],
      ["a", null],
    ]);
    expect(page?.candidates[0]).toMatchObject({ email: "b@example.com", invite_status: "SENT" });
  });
});
