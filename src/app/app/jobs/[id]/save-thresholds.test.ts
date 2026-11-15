import { afterEach, describe, expect, it, vi } from "vitest";
import { asStored, toScore } from "@/lib/score";
import { saveThresholds } from "./save-thresholds";

const ID = "0b4d8f3e-6f0a-4c52-8d57-3a1f9b2c7e10";
const fetchMock = vi.fn();

function answer(status: number, body: unknown) {
  fetchMock.mockResolvedValue(Response.json(body, { status }));
}

vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

describe("saveThresholds", () => {
  it("sends a PATCH with the 0 to 10 value and reports success", async () => {
    answer(200, { data: {} });

    await expect(
      saveThresholds(ID, { invite_threshold: toScore(asStored(75)) }),
    ).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(`/api/jobs/${ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invite_threshold: 7.5 }),
    });
  });

  it.each([401, 403, 404])("passes on the server's message for %i", async (status) => {
    answer(status, { error: { code: "x", message: "Sign in to continue." } });
    await expect(saveThresholds(ID, { invite_threshold: toScore(asStored(70)) })).resolves.toEqual({
      ok: false,
      message: "Sign in to continue.",
    });
  });

  it.each([400, 500, 503])("fails with no message for %i, so the generic text is shown", async (status) => {
    answer(status, { error: { code: "x", message: "Something internal" } });
    await expect(saveThresholds(ID, { invite_threshold: toScore(asStored(70)) })).resolves.toEqual({
      ok: false,
    });
  });

  it("fails with no message when an error body is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 404 }));
    await expect(saveThresholds(ID, { invite_threshold: toScore(asStored(70)) })).resolves.toEqual({
      ok: false,
      message: undefined,
    });
  });
});
