import { BriefcaseBusiness, Plus } from "lucide-react";
import Link from "next/link";
import { LocalDate } from "@/components/jobs/local-date";
import { buttonVariants } from "@/components/ui/button";
import { requireSignedInUser } from "@/lib/auth/require-signed-in-user";
import { resumeCountLabel } from "@/lib/jobs/helpers";
import { listJobs } from "@/lib/jobs/queries";

/**
 * The signed-in home: the recruiter's jobs, newest first.
 *
 * DECISION: the page checks the user itself. The layout above it is only
 * chrome, and a layout does not gate its child pages. The list is read with
 * the recruiter's own client, so the database's row-level security applies.
 */
export default async function JobsPage() {
  const { supabase } = await requireSignedInUser("/app");
  const jobs = await listJobs(supabase);

  return (
    <section aria-labelledby="jobs-heading" className="flex flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 id="jobs-heading" className="text-heading-24">
          Jobs
        </h1>
        <Link href="/app/jobs/new" className={buttonVariants({ size: "lg" })}>
          <Plus data-icon="inline-start" aria-hidden />
          New job
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-border surface-subtle px-6 py-16 text-center">
          <BriefcaseBusiness className="mb-2 size-6 text-muted-foreground" aria-hidden />
          <h2 className="text-heading-20">No jobs yet</h2>
          <p className="max-w-sm text-copy-14 text-muted-foreground">
            Jobs you create will appear here, each with its ranked candidates.
          </p>
          <Link
            href="/app/jobs/new"
            className={buttonVariants({ variant: "outline", size: "lg", className: "mt-4" })}
          >
            Create your first job
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link
                href={`/app/jobs/${job.id}`}
                className="focus-ring flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3.5 transition-colors outline-none hover:border-border-strong hover:bg-background-subtle sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5"
              >
                <span className="min-w-0 truncate text-label-16 font-medium">{job.title}</span>
                <span className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-label-14 text-muted-foreground">
                  <LocalDate iso={job.created_at} />
                  <span className="tabular-nums">{resumeCountLabel(job.resume_count)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
