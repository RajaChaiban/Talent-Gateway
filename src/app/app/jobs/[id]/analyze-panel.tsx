"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ANALYZE_QUEUE_LIMITS as LIMITS } from "@/lib/config";
import {
  analyzeOne,
  fetchProgress,
  settleUnfinishedRun,
  startJobAnalysis,
  type JobProgress,
} from "@/lib/screening/analyze-client";
import { createAnalyzeQueue } from "@/lib/screening/analyze-queue";
import { createThrottle } from "@/lib/screening/throttle";

/** Where an analysis run is: not started, in progress, done, or stopped by an error. */
export type Phase = "idle" | "running" | "finished" | "error";

type Engine = {
  queue: ReturnType<typeof createAnalyzeQueue>;
  controller: AbortController;
  progress: ReturnType<typeof createThrottle>;
  refresh: ReturnType<typeof createThrottle>;
};

function resumes(count: number): string {
  return count === 1 ? "1 resume" : `${count} resumes`;
}

function ProgressBar({ progress }: { progress: JobProgress }) {
  const total = progress.extracted;
  const analyzed = total - progress.remaining;
  const fraction = total === 0 ? 1 : analyzed / total;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex justify-between gap-3 text-label-12 text-muted-foreground tabular-nums">
        <span>
          {analyzed} of {total} analyzed
        </span>
        <span className="font-mono" aria-hidden>
          {Math.round(fraction * 100)}%
        </span>
      </p>
      <div
        role="progressbar"
        aria-label="Analysis progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={analyzed}
        aria-valuetext={`${analyzed} of ${total} analyzed`}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full w-full origin-left rounded-full bg-primary transition-transform"
          style={{ transform: `scaleX(${fraction})` }}
        />
      </div>
    </div>
  );
}

function Outcome({ failed, progress }: { failed: number; progress: JobProgress | null }) {
  const setAside = progress?.ats_failed ?? 0;
  return (
    <p className="flex items-center gap-1.5 text-copy-14">
      {failed > 0 ? (
        <>
          <CircleAlert className="size-4 text-error" aria-hidden />
          <span>
            Done with <span className="font-medium text-error">{failed} failed</span>.
          </span>
        </>
      ) : (
        <>
          <CircleCheck className="size-4 text-success" aria-hidden />
          <span>Done.</span>
        </>
      )}
      {setAside > 0 ? (
        <span className="text-muted-foreground">
          {resumes(setAside)} not ATS-ready, set aside.
        </span>
      ) : null}
    </p>
  );
}

/** The panel's display state, passed in so the view has no behaviour of its own. */
export type AnalyzePanelViewProps = {
  /** Resumes that need work: what Analyze would send. */
  pending: number;
  phase: Phase;
  progress: JobProgress | null;
  /** Resumes that failed in this page's last run. */
  failed: number;
  message: string | null;
  onAnalyze: () => void;
};

/** What the panel shows for a state; no behaviour of its own. */
export function AnalyzePanelView({
  pending,
  phase,
  progress,
  failed,
  message,
  onAnalyze,
}: AnalyzePanelViewProps) {
  const running = phase === "running";
  return (
    <div className="surface-card flex flex-col gap-5 rounded-lg border border-border p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="analyze-heading" className="text-heading-16">
            Analyze resumes
          </h2>
          <p className="mt-1 text-copy-14 text-muted-foreground">
            {pending > 0
              ? `${resumes(pending)} to analyze. Each gets the ATS check; only ATS-ready resumes are scored by AI.`
              : "Every resume with text has been analyzed."}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          {phase === "finished" && failed > 0 ? (
            <Button variant="outline" size="lg" onClick={onAnalyze}>
              <RotateCcw aria-hidden />
              Retry failed
            </Button>
          ) : null}
          <Button size="lg" onClick={onAnalyze} disabled={running || pending === 0}>
            {running ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden />
                Analyzing…
              </>
            ) : (
              <>
                <Sparkles aria-hidden />
                {pending > 0 ? `Analyze ${resumes(pending)}` : "Nothing to analyze"}
              </>
            )}
          </Button>
        </div>
      </div>
      <div aria-live="polite" className="flex flex-col gap-3 empty:hidden">
        {running && !progress ? (
          <p className="text-copy-14 text-muted-foreground">Starting…</p>
        ) : null}
        {(running || phase === "finished") && progress ? <ProgressBar progress={progress} /> : null}
        {phase === "finished" ? <Outcome failed={failed} progress={progress} /> : null}
        {phase === "error" ? (
          <p className="flex items-center gap-1.5 text-copy-14 text-error">
            <CircleAlert className="size-4" aria-hidden />
            {message ?? "Analysis stopped. Try again."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The Analyze button and progress. Analyze asks the job route which resumes
 * need work, then runs the per-resume route for each with at most three in
 * flight (src/lib/screening/analyze-queue.ts); the bar follows the progress
 * route, and new candidates appear through a throttled router.refresh().
 * Leaving the page stops the queue. Opening a job left ANALYZING (a run whose
 * tab was closed) reads progress once, which settles it if nothing remains.
 *
 * DECISION: the browser drives the batch, one resume per request and three at
 * a time, so every function call stays short and a busy model slows the run
 * instead of failing it. The bar shows the counts the server reads from the
 * rows, not the queue's own tally, so it stays right after a reload or a retry.
 */
export function AnalyzePanel({
  jobId,
  jobStatus,
  pending,
}: {
  jobId: string;
  jobStatus: string;
  pending: number;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [failed, setFailed] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const engineRef = useRef<Engine | null>(null);

  useEffect(
    () => () => {
      const engine = engineRef.current;
      engineRef.current = null;
      if (!engine) return;
      engine.queue.stop();
      engine.controller.abort();
      engine.progress.cancel();
      engine.refresh.cancel();
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void settleUnfinishedRun(jobId, jobStatus, controller.signal, fetchProgress).then((settled) => {
      if (settled && !controller.signal.aborted) router.refresh();
    });
    return () => controller.abort();
  }, [jobId, jobStatus, router]);

  /** One engine per mounted panel, made on the first click (so a dev-mode remount cannot leave a stopped one behind). */
  function getEngine(): Engine {
    if (engineRef.current) return engineRef.current;
    const controller = new AbortController();
    const progressThrottle = createThrottle(() => {
      void fetchProgress(jobId, controller.signal).then((next) => {
        if (next && !controller.signal.aborted) setProgress(next);
      });
    }, LIMITS.progressThrottleMs);
    const refresh = createThrottle(() => router.refresh(), LIMITS.refreshThrottleMs);
    let finished = 0;
    const queue = createAnalyzeQueue({
      run: analyzeOne,
      concurrency: LIMITS.concurrency,
      maxAttempts: LIMITS.maxAttempts,
      backoffBaseMs: LIMITS.backoffBaseMs,
      backoffMaxMs: LIMITS.backoffMaxMs,
      onChange: (next) => {
        setFailed(next.failed);
        if (next.finished !== finished) {
          finished = next.finished;
          progressThrottle.request();
          refresh.request();
        }
      },
    });
    engineRef.current = { queue, controller, progress: progressThrottle, refresh };
    return engineRef.current;
  }

  async function analyze() {
    const engine = getEngine();
    const { signal } = engine.controller;
    setPhase("running");
    setMessage(null);
    try {
      const start = await startJobAnalysis(jobId, signal);
      if (!start.ok) {
        setMessage(start.message);
        setPhase("error");
        return;
      }
      engine.progress.request();
      await engine.queue.run(start.resumeIds);
      if (signal.aborted) return;
      engine.progress.cancel();
      const final = await fetchProgress(jobId, signal);
      if (signal.aborted) return;
      if (final) setProgress(final);
      engine.refresh.cancel();
      router.refresh();
      setPhase("finished");
    } catch {
      if (!signal.aborted) setPhase("error");
    }
  }

  return (
    <AnalyzePanelView
      pending={pending}
      phase={phase}
      progress={progress}
      failed={failed}
      message={message}
      onAnalyze={analyze}
    />
  );
}
