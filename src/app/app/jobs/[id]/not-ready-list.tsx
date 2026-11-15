"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NotAtsReadyResume } from "@/lib/jobs/types";
import { formatScore } from "@/lib/score";
import { cn } from "@/lib/utils";
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
export function NotReadyList({ resumes }: { resumes: NotAtsReadyResume[] }) {
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

  if (resumes.length === 0) {
    return (
      <>
        {notice}
        <p className="text-copy-14 text-muted-foreground">No resumes have been set aside.</p>
      </>
    );
  }

  return (
    <>
      {notice}
      <ul className="flex flex-col gap-2">
        {resumes.map((resume) => {
          const scoring = activeId === resume.id;
          return (
            <li
              key={resume.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 sm:px-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <span className="min-w-0 font-mono text-label-14 font-medium break-all">
                  {resume.file_name}
                </span>
                <span className="text-label-14 text-muted-foreground">
                  ATS score{" "}
                  <span className="font-mono font-semibold text-foreground tabular-nums">
                    {resume.ats_score === null ? "not recorded" : formatScore(resume.ats_score)}
                  </span>
                </span>
              </div>
              {resume.ats_reasons.length > 0 ? (
                <ul aria-label="Reasons" className="flex list-disc flex-col gap-1 pl-5 text-copy-14">
                  {resume.ats_reasons.map((reason, index) => (
                    <li key={`${index}:${reason}`}>{reason}</li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => scoreAnyway(resume)}
                  aria-label={`Score anyway: ${resume.file_name}`}
                >
                  {scoring ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
                  {scoring ? "Scoring…" : "Score anyway"}
                </Button>
                <span role="status" className="text-copy-13 text-muted-foreground">
                  {scoring ? "Scoring this resume. This can take a few seconds." : ""}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
