import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalDate } from "@/components/jobs/local-date";
import { JobStatusBadge } from "@/components/jobs/status-badge";
import { requireSignedInUser } from "@/lib/auth/require-signed-in-user";
import { APP_NAME } from "@/lib/config";
import { resumeCountLabel } from "@/lib/jobs/helpers";
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
        <div className="flex flex-wrap items-center gap-3 text-label-14 text-muted-foreground">
          <JobStatusBadge status={job.status} />
          <span>
            Created <LocalDate iso={job.created_at} />
          </span>
        </div>
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
            {resumeCountLabel(resumes.length)}
          </span>
        </div>
        <ResumesSection key={job.id} jobId={job.id} resumes={resumes} />
      </section>

      <section aria-labelledby="analyze-heading" className="flex flex-col gap-3">
        <h2 id="analyze-heading" className="text-heading-20">
          Analyze
        </h2>
        <AnalyzePanel
          jobId={job.id}
          jobStatus={job.status}
          pending={resumesNeedingWork(work.rows, work.scored).length}
        />
      </section>

      <section aria-labelledby="candidates-heading" className="flex flex-col gap-3">
        <h2 id="candidates-heading" className="text-heading-20">
          Candidates
        </h2>
        <CandidatesSection
          candidates={candidates}
          notAtsReady={notAtsReady}
          queued={queued}
          counts={counts}
          topTalent={job.top_talent_threshold}
        />
      </section>
    </div>
  );
}
