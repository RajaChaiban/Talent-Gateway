import { afterEach, describe, expect, it, vi } from "vitest";
import { requestInvite } from "./invite-client";

const INVITE_FAILED_MESSAGE = "Could not send the invitation. Try again in a moment.";

const ID = "0b4d8f3e-6f0a-4c52-8d57-3a1f9b2c7e10";
const fetchMock = vi.fn();

function answer(status: number, body: unknown) {
  fetchMock.mockResolvedValue(Response.json(body, { status }));
}

vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

describe("requestInvite", () => {
  it("posts the address as JSON and reports success", async () => {
    answer(200, { data: { candidate_id: ID, invite_status: "SENT", sent_to: "a@b.co", sent_at: "x" } });

    await expect(requestInvite(ID, "a@b.co")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(`/api/candidates/${ID}/invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.co" }),
    });
  });

  it("shows the server's message for 400 without reloading", async () => {
    answer(400, { error: { code: "invalid_input", message: "email: Enter a valid email address" } });
    await expect(requestInvite(ID, "a@")).resolves.toEqual({
      ok: false,
      message: "email: Enter a valid email address",
      refresh: false,
    });
  });

  it.each([
    [409, "This invitation is already being sent."],
    [502, "The invitation could not be sent. Try again."],
  ])("shows the server's message for %i and reloads the page data", async (status, message) => {
    answer(status, { error: { code: "x", message } });
    await expect(requestInvite(ID, "a@b.co")).resolves.toEqual({ ok: false, message, refresh: true });
  });

  it.each([401, 403, 404, 500, 503])("uses the generic message for %i", async (status) => {
    answer(status, { error: { code: "x", message: "Something internal" } });
    await expect(requestInvite(ID, "a@b.co")).resolves.toEqual({
      ok: false,
      message: INVITE_FAILED_MESSAGE,
      refresh: false,
    });
  });

  it("uses the generic message when an error body is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 502 }));
    await expect(requestInvite(ID, "a@b.co")).resolves.toEqual({
      ok: false,
      message: INVITE_FAILED_MESSAGE,
      refresh: true,
    });
  });

  it("treats a 200 with an unexpected body as a failure and reloads", async () => {
    answer(200, { nope: true });
    await expect(requestInvite(ID, "a@b.co")).resolves.toEqual({
      ok: false,
      message: INVITE_FAILED_MESSAGE,
      refresh: true,
    });
  });

  it("turns a network failure into the generic message", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(requestInvite(ID, "a@b.co")).resolves.toEqual({
      ok: false,
      message: INVITE_FAILED_MESSAGE,
      refresh: false,
    });
  });
});
