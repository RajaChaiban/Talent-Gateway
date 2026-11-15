import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobsDataError } from "@/lib/jobs/queries";
import { FakeDb, type Row } from "../../../test/fake-supabase";
import { seedJob, seedResume } from "../../../test/screening-harness";
import { inviteCandidate } from "./invite";
import { invitationMessage } from "./message";
import type { SendInvitationEmail } from "./send";

type InviteDeps = NonNullable<Parameters<typeof inviteCandidate>[2]>;
type InvitationEmail = Parameters<SendInvitationEmail>[0];

const START = Date.parse("2026-11-15T10:00:00.000Z");
const RECRUITER = "user-1";
const RESUME_EMAIL = "priya@example.com";

let db: FakeDb;
let clock: number;
let sent: InvitationEmail[];
let deps: InviteDeps;
let candidate: Row;
const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

/** The stand-in outbox's behaviour, recorded: every call is one email that would have gone out. */
function outbox(email: InvitationEmail): Promise<string> {
  sent.push(email);
  return Promise.resolve(`outbox:${email.idempotencyKey}`);
}

beforeEach(() => {
  db = new FakeDb();
  clock = START;
  sent = [];
  deps = { now: () => new Date(clock), send: vi.fn(outbox) };
  const job = seedJob(db, { title: "Backend engineer" });
  const resume = seedResume(db, job.id as string);
  candidate = db.insertRow("candidates", {
    job_id: job.id,
    resume_id: resume.id,
    full_name: "Priya Natarajan",
    match_score: 85,
    match_summary: "Strong match",
    email: RESUME_EMAIL,
  });
  errorLog.mockClear();
});

const invite = (email = RESUME_EMAIL, over: Partial<InviteDeps> = {}, approvedBy = RECRUITER) =>
  inviteCandidate(
    db as never,
    { candidateId: candidate.id as string, email, approvedBy },
    { ...deps, ...over },
  );
const invitations = () => db.rows("invitations");
const candidateRow = () => db.rows("candidates")[0];
const failingSend = () => vi.fn(async () => Promise.reject(new Error("provider down")));

describe("inviteCandidate: first click", () => {
  it("acceptance 1: creates exactly one invitation and ends SENT with an outbox message id", async () => {
    const outcome = await invite();

    expect(invitations()).toHaveLength(1);
    const row = invitations()[0];
    expect(row.message_id).toBe(`outbox:${row.id as string}`);
    expect(row.sent_at).toBe(new Date(START).toISOString());
    expect(row.error).toBeNull();
    expect(candidateRow().invite_status).toBe("SENT");
    expect(outcome).toEqual({
      kind: "sent",
      state: {
        candidate_id: candidate.id,
        invite_status: "SENT",
        sent_to: RESUME_EMAIL,
        sent_at: new Date(START).toISOString(),
      },
    });
  });

  it("sends one email built by the message function, keyed by the invitation id", async () => {
    await invite();
    expect(sent).toEqual([
      {
        to: RESUME_EMAIL,
        ...invitationMessage("Priya Natarajan", "Backend engineer"),
        idempotencyKey: invitations()[0].id,
      },
    ]);
  });

  it("sets the candidate to APPROVED before the send", async () => {
    let during: unknown;
    await invite(RESUME_EMAIL, {
      send: async (email) => {
        during = candidateRow().invite_status;
        return outbox(email);
      },
    });
    expect(during).toBe("APPROVED");
  });

  it("acceptance 8: approved_by holds the recruiter who clicked", async () => {
    await invite(RESUME_EMAIL, {}, "recruiter-42");
    expect(invitations()[0]).toMatchObject({
      approved_by: "recruiter-42",
      approved_at: new Date(START).toISOString(),
    });
  });

  it("acceptance 3: a corrected address is stored in sent_to and candidates.email is unchanged", async () => {
    await invite("priya.natarajan@work.example");
    expect(invitations()[0].sent_to).toBe("priya.natarajan@work.example");
    expect(sent[0].to).toBe("priya.natarajan@work.example");
    expect(candidateRow().email).toBe(RESUME_EMAIL);
  });

  it("returns not_found for an unknown candidate, with no write and no send", async () => {
    const outcome = await inviteCandidate(
      db as never,
      { candidateId: crypto.randomUUID(), email: RESUME_EMAIL, approvedBy: RECRUITER },
      deps,
    );
    expect(outcome).toEqual({ kind: "not_found" });
    expect(sent).toEqual([]);
    expect(db.calls.filter((call) => call.op !== "select")).toEqual([]);
  });
});

describe("inviteCandidate: exactly once", () => {
  it("acceptance 2: a second click sends nothing, adds no row and ignores a different address", async () => {
    await invite();
    clock += 10 * 60_000;
    const outcome = await invite("someone.else@example.com");

    expect(sent).toHaveLength(1);
    expect(invitations()).toHaveLength(1);
    expect(outcome).toEqual({
      kind: "stored",
      state: {
        candidate_id: candidate.id,
        invite_status: "SENT",
        sent_to: RESUME_EMAIL,
        sent_at: new Date(START).toISOString(),
      },
    });
  });

  it("acceptance 2: two clicks at once make one invitation row and exactly one send", async () => {
    const outcomes = await Promise.all([invite(), invite("other@example.com")]);

    expect(invitations()).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "sent")).toHaveLength(1);
    const loser = outcomes.find((outcome) => outcome.kind !== "sent");
    expect(["in_progress", "stored"]).toContain(loser?.kind);
    expect(candidateRow().invite_status).toBe("SENT");
  });

  it("five clicks at once still make one row and one send", async () => {
    await Promise.all(Array.from({ length: 5 }, () => invite()));
    expect(invitations()).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("the request that loses the insert race does not send, and answers the winner's sent state", async () => {
    let releaseWinner: () => void = () => undefined;
    const winnerSending = new Promise<void>((resolve) => {
      releaseWinner = resolve;
    });
    const winner = invite(RESUME_EMAIL, {
      send: async (email) => {
        await winnerSending;
        return outbox(email);
      },
    });
    const loser = invite("other@example.com");

    await expect(loser).resolves.toEqual({ kind: "in_progress" });
    releaseWinner();
    await expect(winner).resolves.toMatchObject({ kind: "sent" });
    expect(sent).toHaveLength(1);
  });

  it("repairs a candidate status left behind when the invitation is already sent", async () => {
    await invite();
    candidateRow().invite_status = "APPROVED";
    const outcome = await invite();
    expect(outcome.kind).toBe("stored");
    expect(candidateRow().invite_status).toBe("SENT");
    expect(sent).toHaveLength(1);
  });
});

describe("inviteCandidate: failure and retry", () => {
  it("acceptance 5: a send failure ends FAILED with the error recorded", async () => {
    const outcome = await invite(RESUME_EMAIL, { send: failingSend() });

    expect(outcome).toEqual({
      kind: "failed",
      state: {
        candidate_id: candidate.id,
        invite_status: "FAILED",
        sent_to: RESUME_EMAIL,
        sent_at: null,
      },
    });
    expect(invitations()).toHaveLength(1);
    expect(invitations()[0]).toMatchObject({ error: "provider down", sent_at: null, message_id: null });
    expect(candidateRow().invite_status).toBe("FAILED");
    expect(errorLog).toHaveBeenCalledWith("Sending an invitation email failed");
  });

  it("acceptance 5: Try again then succeeds on the same row, with a corrected address", async () => {
    await invite(RESUME_EMAIL, { send: failingSend() });
    const firstId = invitations()[0].id;
    clock += 5_000;

    const outcome = await invite("priya.natarajan@work.example", {}, "user-2");

    expect(outcome.kind).toBe("sent");
    expect(invitations()).toHaveLength(1);
    expect(invitations()[0]).toMatchObject({
      id: firstId,
      sent_to: "priya.natarajan@work.example",
      approved_by: "user-2",
      error: null,
      message_id: `outbox:${firstId as string}`,
    });
    expect(sent).toHaveLength(1);
    expect(candidateRow()).toMatchObject({ invite_status: "SENT", email: RESUME_EMAIL });
  });

  it("two Try again clicks at once on a FAILED invitation send once", async () => {
    await invite(RESUME_EMAIL, { send: failingSend() });
    const outcomes = await Promise.all([invite(), invite()]);
    expect(sent).toHaveLength(1);
    expect(outcomes.map((outcome) => outcome.kind).toSorted()).toEqual(["in_progress", "sent"]);
  });

  it("stores a fallback error text when the send throws something without a message", async () => {
    await invite(RESUME_EMAIL, { send: vi.fn(async () => Promise.reject("nope")) });
    expect(invitations()[0].error).toBe("The email could not be sent");
  });
});

describe("inviteCandidate: an approval that has not finished (acceptance 6)", () => {
  /** An invitation whose send never finished: APPROVED, no sent_at, no error. */
  function seedApproved(approvedAt: number) {
    db.insertRow("invitations", {
      candidate_id: candidate.id,
      approved_by: "user-0",
      approved_at: new Date(approvedAt).toISOString(),
      sent_to: RESUME_EMAIL,
    });
    candidateRow().invite_status = "APPROVED";
  }

  it("younger than 2 minutes: in progress, nothing sent, nothing written", async () => {
    seedApproved(START - 119_000);
    const outcome = await invite();
    expect(outcome).toEqual({ kind: "in_progress" });
    expect(sent).toEqual([]);
    expect(db.calls.filter((call) => call.op !== "select")).toEqual([]);
  });

  it("2 minutes or older: retried on the same row and sent", async () => {
    seedApproved(START - 120_000);
    const outcome = await invite("corrected@example.com");
    expect(outcome.kind).toBe("sent");
    expect(sent).toHaveLength(1);
    expect(invitations()).toHaveLength(1);
    expect(invitations()[0]).toMatchObject({
      sent_to: "corrected@example.com",
      approved_by: RECRUITER,
      approved_at: new Date(START).toISOString(),
    });
  });

  it("two retries of a stale approval at once send once", async () => {
    seedApproved(START - 5 * 60_000);
    const outcomes = await Promise.all([invite(), invite()]);
    expect(sent).toHaveLength(1);
    expect(outcomes.map((outcome) => outcome.kind).toSorted()).toEqual(["in_progress", "sent"]);
  });
});

describe("inviteCandidate: database failures", () => {
  it("throws JobsDataError when a read fails, before any send", async () => {
    db.failWhen = (call) => (call.table === "candidates" && call.op === "select" ? "08006" : null);
    await expect(invite()).rejects.toBeInstanceOf(JobsDataError);
    expect(sent).toEqual([]);
  });

  it("throws JobsDataError when the insert fails for a reason other than the unique constraint", async () => {
    db.failWhen = (call) => (call.table === "invitations" && call.op === "insert" ? "23503" : null);
    await expect(invite()).rejects.toBeInstanceOf(JobsDataError);
    expect(sent).toEqual([]);
  });
});
