import { beforeEach, describe, expect, it, vi } from "vitest";
import { asStored } from "@/lib/score";
import { failed, ok, queryBuilder } from "../../../../../test/supabase-mock";

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect to ${url}`);
  }
}

const from = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/require-signed-in-user", () => ({
  requireSignedInUser: async () => ({ user: { id: "user-1" }, supabase: { from } }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

const { createJobAction } = await import("./actions");

const initial = {
  values: {
    title: "",
    description: "",
    top_talent_threshold: asStored(80),
    invite_threshold: asStored(70),
  },
  fieldErrors: {},
  formError: null,
};

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  from.mockReset();
});

describe("createJobAction", () => {
  it("returns field errors, keeps the input and skips the database", async () => {
    const state = await createJobAction(
      initial,
      form({
        title: "   ",
        description: "Build APIs.",
        top_talent_threshold: "8.5",
        invite_threshold: "6",
      }),
    );

    expect(state.fieldErrors.title).toBe("Enter a job title");
    expect(state.fieldErrors.description).toBeUndefined();
    expect(state.values).toEqual({
      title: "   ",
      description: "Build APIs.",
      top_talent_threshold: 85,
      invite_threshold: 60,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a threshold with two decimals, naming the scale, and keeps the slider on the nearest tenth", async () => {
    const state = await createJobAction(
      initial,
      form({
        title: "Backend engineer",
        description: "Build APIs.",
        top_talent_threshold: "8.25",
        invite_threshold: "12",
      }),
    );

    expect(state.fieldErrors.top_talent_threshold).toBe(
      "Top talent threshold must be a number from 0 to 10 with at most one decimal",
    );
    expect(state.fieldErrors.invite_threshold).toBeDefined();
    expect(state.values.top_talent_threshold).toBe(83);
    expect(state.values.invite_threshold).toBe(100);
    expect(from).not.toHaveBeenCalled();
  });

  it("stores the thresholds as tenths", async () => {
    const builder = queryBuilder(ok({ id: "job-42" }));
    from.mockReturnValue(builder);

    await expect(
      createJobAction(
        initial,
        form({
          title: "Backend engineer",
          description: "Build APIs.",
          top_talent_threshold: "9.5",
          invite_threshold: "6",
        }),
      ),
    ).rejects.toMatchObject({ url: "/app/jobs/job-42" });
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ top_talent_threshold: 95, invite_threshold: 60 }),
    );
  });

  it("redirects to the new job after creating it", async () => {
    from.mockReturnValue(queryBuilder(ok({ id: "job-42" })));

    await expect(
      createJobAction(
        initial,
        form({ title: "Backend engineer", description: "Build APIs." }),
      ),
    ).rejects.toMatchObject({ url: "/app/jobs/job-42" });
  });

  it("keeps the input and shows a form error when the database fails", async () => {
    from.mockReturnValue(queryBuilder(failed));

    const state = await createJobAction(
      initial,
      form({ title: "Backend engineer", description: "Build APIs." }),
    );

    expect(state.formError).not.toBeNull();
    expect(state.values.title).toBe("Backend engineer");
  });
});
