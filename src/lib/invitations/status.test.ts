import { describe, expect, it } from "vitest";
import { INVITE_LIMITS } from "@/lib/config";
import { invitationStatus, isStaleApproval } from "./status";

const APPROVED_AT = "2026-11-15T10:00:00.000Z";
const after = (ms: number) => new Date(Date.parse(APPROVED_AT) + ms);

describe("isStaleApproval", () => {
  it("is fresh under 2 minutes and stale from 2 minutes", () => {
    expect(INVITE_LIMITS.staleApprovalMs).toBe(120_000);
    expect(isStaleApproval(APPROVED_AT, after(119_999))).toBe(false);
    expect(isStaleApproval(APPROVED_AT, after(120_000))).toBe(true);
  });

  it("reads the database's own timestamp format", () => {
    expect(isStaleApproval("2026-11-15T10:00:00.123456+00:00", after(60_000))).toBe(false);
  });

  it("treats an unreadable date as stale, so it can never block a retry", () => {
    expect(isStaleApproval("nope", after(0))).toBe(true);
  });
});

describe("invitationStatus", () => {
  it("is SENT once sent_at is set, whatever else the row holds", () => {
    expect(invitationStatus({ sent_at: APPROVED_AT, error: "old failure" })).toBe("SENT");
  });

  it("is FAILED when an error is recorded and nothing was sent", () => {
    expect(invitationStatus({ sent_at: null, error: "provider down" })).toBe("FAILED");
  });

  it("is APPROVED while neither is set", () => {
    expect(invitationStatus({ sent_at: null, error: null })).toBe("APPROVED");
  });
});
