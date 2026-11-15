import { describe, expect, it } from "vitest";
import { FakeDb } from "../../../test/fake-supabase";

/** The in-memory fake the pipeline tests rely on must enforce the schema's unique constraints. */
describe("FakeDb unique constraints", () => {
  function setup() {
    const db = new FakeDb();
    const job = db.insertRow("jobs", { title: "t", description: "d" });
    const other = db.insertRow("jobs", { title: "t2", description: "d" });
    const resume = db.insertRow("resumes", { job_id: job.id, file_name: "a.pdf", storage_path: "a" });
    const row = { job_id: job.id, resume_id: resume.id, full_name: "A", match_score: 50, match_summary: "s" };
    return { db, job, other, resume, row };
  }

  it("an upsert that conflicts on (job_id, resume_id) does nothing", async () => {
    const { db, row } = setup();
    await db.from("candidates").insert(row);
    const result = await db
      .from("candidates")
      .upsert({ ...row, full_name: "B" }, { onConflict: "job_id,resume_id", ignoreDuplicates: true })
      .select()
      .maybeSingle();
    expect(result).toEqual({ data: null, error: null });
    expect(db.rows("candidates")).toHaveLength(1);
  });

  it("a row that conflicts only on resume_id fails with 23505", async () => {
    const { db, row, other } = setup();
    await db.from("candidates").insert(row);
    const result = await db
      .from("candidates")
      .upsert({ ...row, job_id: other.id }, { onConflict: "job_id,resume_id", ignoreDuplicates: true })
      .select()
      .maybeSingle();
    expect(result.error).toMatchObject({ code: "23505" });
    expect(db.rows("candidates")).toHaveLength(1);
  });
});
