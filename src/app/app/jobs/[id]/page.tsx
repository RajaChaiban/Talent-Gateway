import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalDate } from "@/components/jobs/local-date";
import { JobStatusBadge } from "@/components/jobs/status-badge";
import { requireSignedInUser } from "@/lib/auth/require-signed-in-user";
import { APP_NAME } from "@/lib/config";
import { getJobPage } from "@/lib/jobs/queries";
import { jobIdSchema } from "@/lib/jobs/schemas";
import { listResumes } from "@/lib/resumes/queries";
import { loadWork } from "@/lib/screening/queries";
import { resumesNeedingWork } from "@/lib/screening/work";
import { AnalyzePanel } from "./analyze-panel";
import { CandidatesSection } from "./candidates-section";
import { ExpandableText } from "./expandable-text";
import { JobThresholds } from "./job-thresholds";
import { ResumesSection } from "./resumes-section";

/** Tab title for the job page. */
export const metadata: Metadata = {
  title: `Job · ${APP_NAME}`,
};

/**
 * One job: its description, its two thresholds, its resumes, the Analyze
 * panel and the ranked candidates.
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

  const [page, resumes, work] = await Promise.all([
    getJobPage(supabase, id.data),
    listResumes(supabase, id.data),
    loadWork(supabase, id.data),
  ]);
  if (!page) notFound();
  const { job, candidates, notAtsReady, queued, counts } = page;

  return (
    <div className="flex w-full min-w-0 flex-col">
      <header className="flex flex-col gap-6">
        <Link
          href="/app"
          className="focus-ring inline-flex w-fit items-center gap-2 rounded-sm text-copy-14 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Jobs
        </Link>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 text-heading-32 break-words">{job.title}</h1>
            <JobStatusBadge status={job.status} />
          </div>
          <p className="text-copy-14 text-muted-foreground">
            Created <LocalDate iso={job.created_at} />
          </p>
        </div>
      </header>

      <section
        aria-labelledby="description-heading"
        className="mt-7 flex flex-col gap-3 rounded-lg border border-border surface-card p-5"
      >
        <h2 id="description-heading" className="text-heading-14">
          Job description
        </h2>
        <ExpandableText text={job.description} />
      </section>

      <section aria-labelledby="thresholds-heading" className="mt-5 flex flex-col gap-3">
        <h2 id="thresholds-heading" className="text-heading-14">
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

      <section id="resumes" aria-labelledby="resumes-heading" className="mt-8 scroll-mt-6">
        <ResumesSection key={job.id} jobId={job.id} resumes={resumes} />
      </section>

      <section aria-labelledby="analyze-heading" className="mt-8">
        <AnalyzePanel
          jobId={job.id}
          jobStatus={job.status}
          pending={resumesNeedingWork(work.rows, work.scored).length}
        />
      </section>

      <section aria-labelledby="candidates-heading" className="mt-9">
        <CandidatesSection
          candidates={candidates}
          notAtsReady={notAtsReady}
          queued={queued}
          counts={counts}
          topTalent={job.top_talent_threshold}
          jobTitle={job.title}
        />
      </section>

      <p className="pt-6 text-copy-13 text-muted-foreground">
        Scores are guidance, not a hiring decision. Review each candidate with your team.
      </p>
    </div>
  );
}
