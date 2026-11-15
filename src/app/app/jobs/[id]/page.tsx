import type { Metadata } from "next";
import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalDate } from "@/components/jobs/local-date";
import { requireSignedInUser } from "@/lib/auth/require-signed-in-user";
import { APP_NAME } from "@/lib/config";
import { resumeCountLabel } from "@/lib/jobs/helpers";
import { getJob } from "@/lib/jobs/queries";
import { countResumes } from "@/lib/jobs/resume-count";
import { jobIdSchema } from "@/lib/jobs/schemas";
import { ExpandableText } from "./expandable-text";
import { JobThresholds } from "./job-thresholds";

export const metadata: Metadata = {
  title: `Job · ${APP_NAME}`,
};

/**
 * One job: its description, its two thresholds and its resumes.
 *
 * DECISION: the page checks the user itself, like every page under /app,
 * because the layout above it does not gate it. The job is read with the
 * recruiter's own client, so row-level security decides whether it exists.
 */
export default async function JobPage({ params }: PageProps<"/app/jobs/[id]">) {
  const { id: rawId } = await params;
  const { supabase } = await requireSignedInUser(`/app/jobs/${encodeURIComponent(rawId)}`);

  const id = jobIdSchema.safeParse(rawId);
  if (!id.success) notFound();

  const [job, resumeCount] = await Promise.all([
    getJob(supabase, id.data),
    countResumes(supabase, id.data),
  ]);
  if (!job) notFound();

  return (
    <div className="flex w-full flex-col gap-10">
      <header className="flex flex-col gap-2">
        <Link
          href="/app"
          className="focus-ring inline-flex w-fit items-center gap-1.5 rounded-sm text-label-14 text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Jobs
        </Link>
        <h1 className="text-heading-24 break-words">{job.title}</h1>
        <p className="text-label-14 text-muted-foreground">
          Created <LocalDate iso={job.created_at} />
        </p>
      </header>

      <section aria-labelledby="description-heading" className="flex flex-col gap-3">
        <h2 id="description-heading" className="text-heading-20">
          Job description
        </h2>
        <ExpandableText text={job.description} />
      </section>

      <section aria-labelledby="thresholds-heading" className="flex flex-col gap-3">
        <h2 id="thresholds-heading" className="text-heading-20">
          Thresholds
        </h2>
        <JobThresholds
          key={job.id}
          jobId={job.id}
          initial={{
            top_talent_threshold: job.top_talent_threshold,
            invite_threshold: job.invite_threshold,
          }}
        />
      </section>

      <section aria-labelledby="resumes-heading" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="resumes-heading" className="text-heading-20">
            Resumes
          </h2>
          <span className="text-label-14 tabular-nums text-muted-foreground">
            {resumeCountLabel(resumeCount)}
          </span>
        </div>
        {resumeCount === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-border surface-subtle px-6 py-10 text-center">
            <FileText className="mb-1 size-6 text-muted-foreground" aria-hidden />
            <p className="text-label-14 text-muted-foreground">No resumes yet</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
