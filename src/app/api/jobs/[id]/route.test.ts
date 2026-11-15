import { AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { failed, ok, queryBuilder, SIGNED_IN } from "../../../../../test/supabase-mock";

const getUser = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from }),
}));

const { PATCH } = await import("./route");
const { SERVER_ERROR_MESSAGE } = await import("@/lib/jobs/api");

const ID = "0b4d8f3e-6f0a-4c52-8d57-3a1f9b2c7e10";
/** A row as the database holds it: scores are stored tenths. */
const jobRow = {
  id: ID,
  title: "Backend engineer",
  description: "Build APIs.",
  top_talent_threshold: 80,
  invite_threshold: 70,
  created_at: "2026-03-05T10:00:00Z",
};

/** The same job as the API returns it: scores on the 0 to 10 scale. */
const jobBody = { ...jobRow, top_talent_threshold: 8, invite_threshold: 7 };

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

const SAME_ORIGIN = { "sec-fetch-site": "same-origin" };
const CROSS_SITE = { "sec-fetch-site": "cross-site", origin: "https://evil.example" };

function patch(id: string, body: string, site: Record<string, string> = SAME_ORIGIN) {
  return PATCH(
    new Request(`http://localhost/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...site },
      body,
    }),
    ctx(id),
  );
}

const signedOut = { data: { user: null }, error: new AuthSessionMissingError() };
const authDown = {
  data: { user: null },
  error: new AuthRetryableFetchError("fetch failed", 0),
};

beforeEach(() => {
  getUser.mockReset();
  from.mockReset();
  getUser.mockResolvedValue(SIGNED_IN);
});

describe("PATCH /api/jobs/[id]", () => {
  it("returns 401 JSON with no database call when signed out", async () => {
    getUser.mockResolvedValue(signedOut);
    const response = await patch(ID, JSON.stringify({ invite_threshold: 5 }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "unauthorized" } });
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 503 with no database call when auth is down", async () => {
    getUser.mockResolvedValue(authDown);
    expect((await patch(ID, JSON.stringify({ invite_threshold: 5 }))).status).toBe(503);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 403 forbidden and makes no database call for a cross-site request", async () => {
    const response = await patch(ID, JSON.stringify({ invite_threshold: 5 }), CROSS_SITE);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "forbidden" } });
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 403 for a same-site but not same-origin request", async () => {
    const response = await patch(ID, JSON.stringify({ invite_threshold: 5 }), {
      "sec-fetch-site": "same-site",
    });
    expect(response.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("still answers 401 first when a cross-site request is also signed out", async () => {
    getUser.mockResolvedValue(signedOut);
    const response = await patch(ID, JSON.stringify({ invite_threshold: 5 }), CROSS_SITE);
    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("stores a threshold of 8.5 as 85 and returns the job with 8.5", async () => {
    const builder = queryBuilder(ok({ ...jobRow, top_talent_threshold: 85 }));
    from.mockReturnValue(builder);

    const response = await patch(ID, JSON.stringify({ top_talent_threshold: 8.5 }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { ...jobBody, top_talent_threshold: 8.5 },
    });
    expect(from).toHaveBeenCalledWith("jobs");
    expect(builder.update).toHaveBeenCalledWith({ top_talent_threshold: 85 });
    expect(builder.eq).toHaveBeenCalledWith("id", ID);
  });

  it("returns 400 for an empty body", async () => {
    const response = await patch(ID, JSON.stringify({}));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "invalid_input" } });
    expect(from).not.toHaveBeenCalled();
  });

  it.each([10.1, -0.1, 8.25, 150, "7"])(
    "returns 400 naming the field and the scale for %j",
    async (value) => {
      const response = await patch(ID, JSON.stringify({ invite_threshold: value }));
      expect(response.status).toBe(400);
      const { error } = await response.json();
      expect(error.message).toContain("invite_threshold");
      expect(error.message).toContain("must be a number from 0 to 10 with at most one decimal");
      expect(from).not.toHaveBeenCalled();
    },
  );

  it("returns 400 for malformed JSON", async () => {
    expect((await patch(ID, "{oops")).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed id", async () => {
    const response = await patch("nope", JSON.stringify({ invite_threshold: 5 }));
    expect(response.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 404 when no row matches", async () => {
    from.mockReturnValue(queryBuilder(ok(null)));
    const response = await patch(ID, JSON.stringify({ invite_threshold: 5 }));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "not_found" } });
  });

  it("returns 500 with a safe message and logs no database text when the database fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    from.mockReturnValue(queryBuilder(failed));

    const response = await patch(ID, JSON.stringify({ invite_threshold: 5 }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: { code: "server_error", message: SERVER_ERROR_MESSAGE } });
    expect(JSON.stringify(body)).not.toContain("db down");
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).not.toContain("db down");
    log.mockRestore();
  });
});
