import { z } from "zod";

/** The address the recruiter approved; the browser checks it with the same rule before enabling the button. */
export const inviteEmailSchema = z
  .string({ error: "Enter the candidate's email address" })
  .trim()
  .min(1, "Enter the candidate's email address")
  .max(254, "Enter a valid email address")
  .pipe(z.email("Enter a valid email address"));

export const inviteBodySchema = z.object({ email: inviteEmailSchema });

export const candidateIdSchema = z.uuid({ error: "Candidate id is not valid" });
