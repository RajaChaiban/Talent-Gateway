"use client";

import { useEffect, useState } from "react";
import { trafficLight } from "@/lib/config";
import { formatScore } from "@/lib/score";
import { lightClass } from "@/lib/traffic-light";
import { cn } from "@/lib/utils";
import { sampleJobs, type SampleJob } from "./sample-jobs";

const row = "flex items-center gap-3 px-4 py-2.5";
const mono = "font-mono tabular-nums";
const ROTATE_MS = 3000;
const COUNT = sampleJobs.length;

function JobCard({ job }: { job: SampleJob }) {
  const topScore = job.candidates[0][1];
  return (
    <>
      <p className={cn(row, "justify-between border-b border-border font-medium bg-secondary/30")}>
        {job.title}
        <span className={cn(mono, "text-label-12 font-normal text-muted-foreground")}>
          {job.applicants} applicants
        </span>
      </p>
      <ol className="divide-y divide-border">
        {job.candidates.map(([name, score], index) => (
          <li key={name} className={row}>
            <span className={cn(mono, "w-3 text-label-12 text-muted-foreground")}>{index + 1}</span>
            <span className="flex-1 font-medium">{name}</span>
            <span className={cn("size-2.5 rounded-full", lightClass[trafficLight(score)])} />
            <span data-score className={cn(mono, "w-8 text-right font-medium")}>
              {formatScore(score)}
            </span>
          </li>
        ))}
      </ol>
      <p className="surface-subtle min-h-[4.25rem] border-y border-border px-4 py-2.5 text-copy-13 text-muted-foreground bg-amber-500/5">
        <span className="font-medium text-amber-500">Unreadable file: </span>
        {job.unreadable}
      </p>
      <div className="space-y-3 p-4 bg-secondary/20">
        <p className="flex justify-between text-label-12 text-muted-foreground">
          Top candidate match
          <span className={cn(mono, "text-foreground font-medium")}>
            Score: {formatScore(topScore)} / 10
          </span>
        </p>
        <p className="min-h-[4.5rem] font-medium text-copy-14">{job.summary}</p>
        <div className="flex flex-wrap gap-2 text-label-12 text-muted-foreground">
          <span className="rounded border border-border px-2 py-0.5 bg-background">
            Strengths: {job.strengths}
          </span>
          <span className="rounded border border-border px-2 py-0.5 bg-background">
            Radar: {job.radar}
          </span>
        </div>
      </div>
    </>
  );
}

/**
 * A picture of the product drawn in markup: a ranked candidate list with green,
 * amber and red scores, one unreadable resume, and the top candidate's summary.
 *
 * DECISION: this is the only interactive part of an otherwise static page. It is
 * a client island over fixed sample data, so the page still needs no server work.
 *
 * It plays like a swipe carousel: the cards sit side by side on a track that
 * slides left every few seconds. A copy of the first card sits after the last,
 * so the loop keeps sliding the same way; once it lands on the copy, the track
 * snaps back to the real first card with no transition, and nobody can tell.
 * It pauses on hover or focus (WCAG 2.2.2) and never moves for reduced motion.
 */
export function ProductPreview() {
  // 0..COUNT-1 are the real cards; COUNT is the copy of the first one.
  const [index, setIndex] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [paused, setPaused] = useState(false);
  // A click restarts the timer so the card you picked gets a full interval.
  const [epoch, setEpoch] = useState(0);

  const active = index % COUNT;

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      setAnimate(true);
      setIndex((i) => (i >= COUNT ? 1 : i + 1));
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [paused, epoch]);

  // After the snap back, wait two frames so the browser paints the reset
  // position before the transition is switched on again.
  useEffect(() => {
    if (animate) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setAnimate(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [animate]);

  return (
    <figure
      className="min-w-0"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div role="tablist" aria-label="Sample jobs" className="mb-3 flex flex-wrap gap-2">
        {sampleJobs.map((item, i) => (
          <button
            key={item.tab}
            type="button"
            role="tab"
            id={`preview-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`preview-panel-${i}`}
            onClick={() => {
              setAnimate(true);
              setIndex(i);
              setEpoch((n) => n + 1);
            }}
            className={cn(
              "focus-ring rounded-full border px-3 py-1 text-label-12 transition-colors",
              i === active
                ? "border-border-strong bg-secondary text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {item.tab}
          </button>
        ))}
      </div>
      <div className="surface-card overflow-hidden rounded-lg border border-border text-copy-14 shadow-sm">
        <div
          className={cn(
            "flex ease-out motion-reduce:transition-none",
            animate ? "transition-transform duration-500" : "transition-none",
          )}
          style={{ transform: `translateX(-${index * 100}%)` }}
          onTransitionEnd={() => {
            if (index >= COUNT) {
              setAnimate(false);
              setIndex(0);
            }
          }}
        >
          {[...sampleJobs, sampleJobs[0]].map((job, i) => {
            const isCopy = i === COUNT;
            const isActive = i === index;
            return (
              <div
                key={isCopy ? "copy" : job.tab}
                id={isCopy ? undefined : `preview-panel-${i}`}
                role={isCopy ? undefined : "tabpanel"}
                aria-labelledby={isCopy ? undefined : `preview-tab-${i}`}
                aria-hidden={!isActive}
                inert={!isActive}
                className="w-full shrink-0"
              >
                <JobCard job={job} />
              </div>
            );
          })}
        </div>
      </div>
      <figcaption className="mt-2 text-label-12 text-muted-foreground">
        Illustration. Roles, candidate names and scores are simulated.
      </figcaption>
    </figure>
  );
}
