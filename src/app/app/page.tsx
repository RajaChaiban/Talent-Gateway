import { BriefcaseBusiness, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { LocalDate } from "@/components/jobs/local-date";
import { JobStatusBadge } from "@/components/jobs/status-badge";
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
    <section aria-labelledby="jobs-heading" className="flex flex-1 flex-col">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-copy-14 text-muted-foreground">Your workspace</p>
          <h1 id="jobs-heading" className="mt-1 text-3xl font-semibold tracking-[-0.04em]">
            Jobs
          </h1>
        </div>
        <Link href="/app/jobs/new" className={buttonVariants({ size: "lg" })}>
          <Plus data-icon="inline-start" aria-hidden />
          New job
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="surface-card mt-8 flex flex-col items-center rounded-lg border border-border px-5 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
            <BriefcaseBusiness className="size-5" aria-hidden />
          </span>
          <h2 className="mt-4 text-heading-16">No jobs yet</h2>
          <p className="mt-2 max-w-sm text-copy-14 text-muted-foreground">
            Jobs you create will appear here, each with its ranked candidates.
          </p>
          <Link
            href="/app/jobs/new"
            className={buttonVariants({ size: "lg", className: "mt-5" })}
          >
            Create your first job
          </Link>
        </div>
      ) : (
        <>
          <ul className="surface-card mt-8 overflow-hidden rounded-lg border border-border">
            {jobs.map((job) => (
              <li key={job.id} className="border-b border-border last:border-b-0">
                <Link
                  href={`/app/jobs/${job.id}`}
                  className="focus-ring flex flex-col gap-3 p-4 transition-colors outline-none hover:bg-background-subtle sm:flex-row sm:items-center"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-label-16 font-medium">{job.title}</span>
                    <span className="mt-1 block text-label-12 text-muted-foreground">
                      Created <LocalDate iso={job.created_at} />
                    </span>
                  </span>
                  <JobStatusBadge status={job.status} />
                  <span className="text-label-14 text-muted-foreground tabular-nums">
                    {resumeCountLabel(job.resume_count)}
                  </span>
                  <ChevronRight
                    className="hidden size-4 text-muted-foreground sm:block"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-label-12 text-muted-foreground">
            Showing {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
          </p>
        </>
      )}
    </section>
  );
}
