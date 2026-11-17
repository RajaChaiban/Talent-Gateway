// The page at /app/jobs/new, where a recruiter creates a job.

import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { requireSignedInUser } from "@/lib/auth/require-signed-in-user";
import { APP_NAME } from "@/lib/config";
import { NewJobForm } from "./new-job-form";

/** Tab title for the new-job page. */
export const metadata: Metadata = {
  title: `New job · ${APP_NAME}`,
};

/** Checks the user itself, because the /app layout does not gate its pages, then shows the form. */
export default async function NewJobPage() {
  await requireSignedInUser("/app/jobs/new");

  return (
    <section
      aria-labelledby="new-job-heading"
      className="flex w-full max-w-3xl flex-col"
    >
      <Link
        href="/app"
        className="focus-ring inline-flex w-fit items-center gap-2 rounded-sm text-label-14 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Jobs
      </Link>
      <h1 id="new-job-heading" className="mt-6 text-3xl font-semibold tracking-[-0.04em]">
        Create a new job
      </h1>
      <p className="mt-2 text-copy-14 text-muted-foreground">
        Set the role details and screening thresholds.
      </p>
      <div className="mt-8">
        <NewJobForm />
      </div>
    </section>
  );
}
