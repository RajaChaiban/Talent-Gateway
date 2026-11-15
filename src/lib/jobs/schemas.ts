import { z } from "zod";
import { JOB_THRESHOLD_DEFAULTS } from "@/lib/config";
import { scoreField } from "@/lib/score-schema";

/** Longest job title, in characters. */
export const TITLE_MAX = 200;
/** Longest job description, in characters. */
export const DESCRIPTION_MAX = 20_000;

const topTalent = scoreField("Top talent threshold");
const invite = scoreField("Invite threshold");

/**
 * The new-job request: title, description and the two thresholds (typed on the 0 to 10 scale, parsed to stored tenths,
 * with defaults from JOB_THRESHOLD_DEFAULTS).
 */
export const createJobSchema = z.object({
  title: z
    .string({ error: "Enter a job title" })
    .trim()
    .min(1, "Enter a job title")
    .max(TITLE_MAX, `Title must be ${TITLE_MAX} characters or fewer`),
  description: z
    .string({ error: "Paste the job description" })
    .trim()
    .min(1, "Paste the job description")
    .max(
      DESCRIPTION_MAX,
      `Description must be ${DESCRIPTION_MAX.toLocaleString("en-US")} characters or fewer`,
    ),
  top_talent_threshold: topTalent.default(JOB_THRESHOLD_DEFAULTS.topTalent),
  invite_threshold: invite.default(JOB_THRESHOLD_DEFAULTS.invite),
});

/** The request that changes thresholds. At least one of the two must be sent. */
export const updateThresholdsSchema = z
  .object({
    top_talent_threshold: topTalent.optional(),
    invite_threshold: invite.optional(),
  })
  .refine(
    (value) =>
      value.top_talent_threshold !== undefined || value.invite_threshold !== undefined,
    { message: "Send top_talent_threshold or invite_threshold" },
  );

/** A job id from the URL; it must be a UUID. */
export const jobIdSchema = z.uuid({ error: "Job id is not valid" });
/** A resume id from the URL; it must be a UUID. */
export const resumeIdSchema = z.uuid({ error: "Resume id is not valid" });

/** Thresholds are typed on the 0 to 10 scale and parsed to stored tenths: both types below hold stored integers. */
export type CreateJobInput = z.output<typeof createJobSchema>;
/** The validated threshold change, with stored tenths. */
export type UpdateThresholdsInput = z.output<typeof updateThresholdsSchema>;

/** A field of the new-job form that can carry an error message. */
export type CreateJobField = "title" | "description" | "top_talent_threshold" | "invite_threshold";
/** At most one message per new-job field. */
export type CreateJobFieldErrors = Partial<Record<CreateJobField, string>>;

const CREATE_FIELDS: readonly string[] = [
  "title",
  "description",
  "top_talent_threshold",
  "invite_threshold",
];

/** Reduces a validation error to the first message for each new-job field, for the form to show under that field. */
export function createJobFieldErrors(error: z.ZodError): CreateJobFieldErrors {
  const errors: CreateJobFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && CREATE_FIELDS.includes(field)) {
      const key = field as CreateJobField;
      if (!errors[key]) errors[key] = issue.message;
    }
  }
  return errors;
}

/** One safe sentence for an API error, naming the field when there is one. */
export function inputErrorMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid input";
  const field = issue.path.filter((part) => typeof part === "string").join(".");
  return field ? `${field}: ${issue.message}` : issue.message;
}
