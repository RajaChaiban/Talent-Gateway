import { AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb, type Row } from "../../../../../../test/fake-supabase";
import { SIGNED_IN } from "../../../../../../test/supabase-mock";
import { seedJob, seedResume } from "../../../../../../test/screening-harness";

const getUser = vi.fn();
let db: FakeDb;
const send = vi.fn(async (email: { idempotencyKey: string }) => `outbox:${email.idempotencyKey}`);

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from: (table: string) => db.from(table) }),
}));
vi.mock("@/lib/invitations/send", () => ({ sendInvitationEmail: send }));

const route = await import("./route");

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
/** A browser sends Sec-Fetch-Site on every request; same-origin unless a test says otherwise. */
const SAME_ORIGIN = { "sec-fetch-site": "same-origin" };
const RESUME_EMAIL = "priya@example.com";

function post(id: string, body: unknown = { email: RESUME_EMAIL }, site = SAME_ORIGIN) {
  return route.POST(
    new Request(`http://localhost/api/candidates/${id}/invite`, {
      method: "POST",
      headers: { ...site, "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    ctx(id),
  );
}

let candidate: Row;
const candidateId = () => candidate.id as string;
const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

beforeEach(() => {
  db = new FakeDb();
  const job = seedJob(db);
  const resume = seedResume(db, job.id as string);
  candidate = db.insertRow("candidates", {
    job_id: job.id,
    resume_id: resume.id,
    full_name: "Priya Natarajan",
    match_score: 85,
    match_summary: "Strong match",
    email: RESUME_EMAIL,
  });
  getUser.mockReset();
  getUser.mockResolvedValue(SIGNED_IN);
  send.mockClear();
  errorLog.mockClear();
});

describe("POST /api/candidates/[id]/invite", () => {
  it("sets maxDuration", () => {
    expect(route.maxDuration).toBe(30);
  });

  it("acceptance 1 and 8: invites a NONE candidate once, as the signed-in recruiter", async () => {
    const response = await post(candidateId());

    expect(response.status).toBe(200);
    const row = db.rows("invitations")[0];
    await expect(response.json()).resolves.toEqual({
      data: {
        candidate_id: candidateId(),
        invite_status: "SENT",
        sent_to: RESUME_EMAIL,
        sent_at: row.sent_at,
      },
    });
    expect(db.rows("invitations")).toHaveLength(1);
    expect(row).toMatchObject({ approved_by: "user-1", message_id: `outbox:${row.id as string}` });
    expect(db.rows("candidates")[0].invite_status).toBe("SENT");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("acceptance 2: a second click answers 200 with the stored status and sends nothing", async () => {
    await post(candidateId());
    const response = await post(candidateId(), { email: "someone.else@example.com" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { invite_status: "SENT", sent_to: RESUME_EMAIL },
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(db.rows("invitations")).toHaveLength(1);
  });

  it("acceptance 2: two clicks at once make one row and one send", async () => {
    const responses = await Promise.all([post(candidateId()), post(candidateId())]);
    expect(responses.map((response) => response.status).toSorted()).toEqual([200, 409]);
    expect(db.rows("invitations")).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("acceptance 3: stores a corrected address in sent_to and leaves candidates.email unchanged", async () => {
    await post(candidateId(), { email: " priya.natarajan@work.example " });
    expect(db.rows("invitations")[0].sent_to).toBe("priya.natarajan@work.example");
    expect(db.rows("candidates")[0].email).toBe(RESUME_EMAIL);
  });

  it.each([
    ["an empty address", { email: "" }],
    ["an invalid address", { email: "priya@" }],
    ["no address", {}],
  ])("acceptance 4: answers 400 for %s, with no write and no send", async (_, body) => {
    const response = await post(candidateId(), body);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "invalid_input" } });
    expect(db.calls).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it("answers 400 for a body that is not JSON", async () => {
    const response = await post(candidateId(), "{nope");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "invalid_input" } });
  });

  it("answers 400 for an id that is not a UUID", async () => {
    const response = await post("not-a-uuid");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "invalid_input", message: "Candidate id is not valid" },
    });
  });

  it("acceptance 5: a send failure answers 502 email_failed and leaves the candidate FAILED; Try again succeeds", async () => {
    send.mockRejectedValueOnce(new Error("provider down"));
    const failed = await post(candidateId());
    expect(failed.status).toBe(502);
    await expect(failed.json()).resolves.toEqual({
      error: { code: "email_failed", message: "The invitation could not be sent. Try again." },
    });
    expect(db.rows("candidates")[0].invite_status).toBe("FAILED");
    expect(db.rows("invitations")[0].error).toBe("provider down");

    const retried = await post(candidateId());
    expect(retried.status).toBe(200);
    expect(db.rows("invitations")).toHaveLength(1);
    expect(db.rows("candidates")[0].invite_status).toBe("SENT");
  });

  it("acceptance 6: a recent APPROVED answers 409 conflict and sends nothing", async () => {
    db.insertRow("invitations", {
      candidate_id: candidateId(),
      approved_by: "user-0",
      approved_at: new Date().toISOString(),
      sent_to: RESUME_EMAIL,
    });
    const response = await post(candidateId());
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "conflict" } });
    expect(send).not.toHaveBeenCalled();
  });

  it("acceptance 6: an APPROVED older than 2 minutes is retried", async () => {
    db.insertRow("invitations", {
      candidate_id: candidateId(),
      approved_by: "user-0",
      approved_at: new Date(Date.now() - 3 * 60_000).toISOString(),
      sent_to: RESUME_EMAIL,
    });
    const response = await post(candidateId());
    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("acceptance 7: answers 401 when signed out, before anything else", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    const response = await post(candidateId(), { email: "" }, { "sec-fetch-site": "cross-site" });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "unauthorized" } });
    expect(db.calls).toEqual([]);
  });

  it("answers 503 when Supabase Auth cannot answer", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) });
    const response = await post(candidateId());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "auth_unavailable" } });
  });

  it("acceptance 7: answers 403 for a cross-site request, with no write and no send", async () => {
    const response = await post(candidateId(), undefined, { "sec-fetch-site": "cross-site" });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "forbidden" } });
    expect(db.calls).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it("acceptance 7: answers 404 for an unknown candidate", async () => {
    const response = await post(crypto.randomUUID());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: "not_found", message: "Candidate not found" },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("answers 500 with a safe message when the database fails, logging the code only", async () => {
    db.failWhen = (call) => (call.table === "invitations" && call.op === "insert" ? "42501" : null);
    const response = await post(candidateId());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: { code: "server_error", message: "Something went wrong. Try again in a moment." },
    });
    expect(errorLog).toHaveBeenCalledWith("Jobs database call failed: insert invitation (code 42501)");
    expect(send).not.toHaveBeenCalled();
  });
});
