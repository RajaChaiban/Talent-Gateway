"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSignedInUser } from "@/lib/auth/require-signed-in-user";
import { JOB_THRESHOLD_DEFAULTS } from "@/lib/config";
import { logServerError } from "@/lib/log";
import { nearestStored, type StoredScore } from "@/lib/score";
import { createJob, JobsDataError } from "@/lib/jobs/queries";
import {
  createJobFieldErrors,
  createJobSchema,
  type CreateJobFieldErrors,
} from "@/lib/jobs/schemas";

/** `values` thresholds are stored tenths, the unit the sliders run in; the form posts them on the 0 to 10 scale. */
export type CreateJobState = {
  values: {
    title: string;
    description: string;
    top_talent_threshold: StoredScore;
    invite_threshold: StoredScore;
  };
  fieldErrors: CreateJobFieldErrors;
  formError: string | null;
};

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** A threshold typed on the 0 to 10 scale. An empty field is left out, so the schema's default applies. */
function scoreInput(formData: FormData, name: string): number | undefined {
  const raw = text(formData, name).trim();
  return raw === "" ? undefined : Number(raw);
}

/** Where the slider goes back to after a failed submit: the nearest tenth, or the default for an empty or unreadable field. */
function slidable(score: number | undefined, fallback: StoredScore): StoredScore {
  return score !== undefined && Number.isFinite(score) ? nearestStored(score) : fallback;
}

/**
 * DECISION: a server action, not an API route. The form works without
 * client-side JavaScript, and the input is checked on the server with the same
 * schema whatever the browser sent. The action checks the user itself: an
 * action is a public POST endpoint, so the page guard alone is not enough.
 */
export async function createJobAction(
  _previous: CreateJobState,
  formData: FormData,
): Promise<CreateJobState> {
  const { supabase } = await requireSignedInUser("/app/jobs/new");

  const raw = {
    title: text(formData, "title"),
    description: text(formData, "description"),
    top_talent_threshold: scoreInput(formData, "top_talent_threshold"),
    invite_threshold: scoreInput(formData, "invite_threshold"),
  };
  const values = {
    ...raw,
    top_talent_threshold: slidable(raw.top_talent_threshold, JOB_THRESHOLD_DEFAULTS.topTalent),
    invite_threshold: slidable(raw.invite_threshold, JOB_THRESHOLD_DEFAULTS.invite),
  };

  const parsed = createJobSchema.safeParse(raw);
  if (!parsed.success) {
    return { values, fieldErrors: createJobFieldErrors(parsed.error), formError: null };
  }

  let jobId: string;
  try {
    jobId = (await createJob(supabase, parsed.data)).id;
  } catch (error) {
    if (!(error instanceof JobsDataError)) throw error;
    logServerError(error.message, error);
    return {
      values,
      fieldErrors: {},
      formError: "The job could not be saved. Your text is still here; try again.",
    };
  }

  revalidatePath("/app");
  redirect(`/app/jobs/${jobId}`);
}
