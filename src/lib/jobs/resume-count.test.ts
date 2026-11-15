import { describe, expect, it, vi } from "vitest";
import { failed, queryBuilder } from "../../../test/supabase-mock";
import { JobsDataError } from "./queries";
import { countResumes } from "./resume-count";

const ID = "0b4d8f3e-6f0a-4c52-8d57-3a1f9b2c7e10";

describe("countResumes", () => {
  it("asks for a head-only exact count of the job's resumes", async () => {
    const builder = queryBuilder({ data: null, error: null, count: 3 });
    const from = vi.fn(() => builder);

    await expect(countResumes({ from } as never, ID)).resolves.toBe(3);
    expect(from).toHaveBeenCalledWith("resumes");
    expect(builder.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(builder.eq).toHaveBeenCalledWith("job_id", ID);
  });

  it("reads a missing count as zero", async () => {
    const from = vi.fn(() => queryBuilder({ data: null, error: null, count: null }));
    await expect(countResumes({ from } as never, ID)).resolves.toBe(0);
  });

  it("throws JobsDataError when the database fails", async () => {
    const from = vi.fn(() => queryBuilder(failed));
    await expect(countResumes({ from } as never, ID)).rejects.toBeInstanceOf(JobsDataError);
  });
});
