import { describe, expect, it, vi } from "vitest";
import { JOB_LIST_LIMIT, JobsDataError, listJobs } from "./queries";

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
