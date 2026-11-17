"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, CircleAlert, CircleCheck, LoaderCircle, Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { NotAtsReadyResume } from "@/lib/jobs/types";
import { resumeFileHref } from "@/lib/resumes/saved-status";
import { formatScore } from "@/lib/score";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { FileGlyph } from "./file-glyph";
import { requestScoreAnyway, type ScoreAnywayOutcome } from "./score-anyway-client";

/**
 * The resumes the ATS check set aside. "Score anyway" overrides the check and
 * runs the analysis in the same call, which takes seconds: the button shows
 * that it is working and the other buttons wait. The result is shown above the
 * list, because a resume that was scored (or queued) leaves this list.
 *
 * DECISION: a set-aside resume is never dropped silently. Its ATS score and
 * reasons are shown so the recruiter can judge the check, and only an explicit
 * click sends it to the model, so a bad file costs nothing unless asked.
 */
export function NotReadyList({
  resumes,
  totalCount,
}: {
  /** The set-aside resumes to show: all of them, or those matching the search. */
  resumes: NotAtsReadyResume[];
  /** How many are set aside before the search, to tell "none set aside" from "none match". */
  totalCount: number;
}) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ScoreAnywayOutcome | null>(null);
  const busy = activeId !== null || refreshing;

  async function scoreAnyway(resume: NotAtsReadyResume) {
    setActiveId(resume.id);
    setOutcome(null);
    const result = await requestScoreAnyway(resume.id, resume.file_name);
    setOutcome(result);
    setActiveId(null);
    if (result.refresh) startTransition(() => router.refresh());
  }

  const notice = outcome ? (
    <p
      role={outcome.kind === "done" ? "status" : "alert"}
      className={cn(
        "rounded-md border px-3 py-2 text-copy-14",
        outcome.kind === "done" && "border-success-border bg-success-subtle text-success",
        outcome.kind === "notice" && "border-warning-border bg-warning-subtle text-warning",
        outcome.kind === "error" && "border-error-border bg-error-subtle text-error",
      )}
    >
      {outcome.message}
    </p>
  ) : null;

  if (totalCount === 0) {
    return (
      <>
        {notice}
        <EmptyState
          icon={CircleCheck}
          title="No resumes set aside"
          body="Resumes the ATS check sets aside are listed here, so you can still score them."
        />
      </>
    );
  }

  if (resumes.length === 0) {
    return (
      <>
        {notice}
        <EmptyState icon={Search} title="No matching resumes" body="Try a different search." />
      </>
    );
  }

  return (
    <>
      {notice}
      <ul className="flex flex-col gap-3">
        {resumes.map((resume) => {
          const scoring = activeId === resume.id;
          return (
            <li
              key={resume.id}
              className="flex flex-col gap-3 rounded-lg border border-border surface-card p-4 sm:flex-row sm:items-start"
            >
              <FileGlyph />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="truncate text-label-14 font-medium" title={resume.file_name}>
                    {resume.file_name}
                  </p>
                  <p className="text-copy-13 text-muted-foreground">
                    ATS score{" "}
                    <span className="font-mono font-medium text-foreground tabular-nums">
                      {resume.ats_score === null ? "not recorded" : formatScore(resume.ats_score)}
                    </span>
                    <span role="status" className="block">
                      {scoring ? "Scoring this resume. This can take a few seconds." : ""}
                    </span>
                  </p>
                </div>
                {resume.ats_reasons.length > 0 ? (
                  <ul aria-label="Reasons" className="flex flex-wrap gap-2">
                    {resume.ats_reasons.map((reason, index) => (
                      <li
                        key={`${index}:${reason}`}
                        className="inline-flex max-w-full items-start gap-1 rounded-md bg-warning-subtle px-2 py-1 text-label-12 text-warning"
                      >
                        <CircleAlert className="mt-px size-3 shrink-0" aria-hidden />
                        <span className="min-w-0 break-words">{reason}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => scoreAnyway(resume)}
                  aria-label={`Score anyway: ${resume.file_name}`}
                >
                  {scoring ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
                  {scoring ? "Scoring…" : "Score anyway"}
                </Button>
                <a
                  href={resumeFileHref(resume.id)}
                  aria-label={`Download ${resume.file_name}`}
                  className={buttonVariants({ variant: "outline" })}
                >
                  <ArrowDownToLine data-icon="inline-start" aria-hidden />
                  Download
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
