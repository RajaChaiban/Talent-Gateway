import { trafficLight } from "@/lib/config";
import { asStored, formatScore } from "@/lib/score";
import { lightClass } from "@/lib/traffic-light";
import { cn } from "@/lib/utils";

/** Invented sample data: these people do not exist. Scores are stored values out of 100. */
const sampleCandidates = [
  ["Amara Okafor", asStored(91)],
  ["Daniel Reyes", asStored(83)],
  ["Mei Lin", asStored(68)],
  ["Tomas Berg", asStored(44)],
] as const;

const row = "flex items-center gap-3 px-4 py-2.5";
const mono = "font-mono tabular-nums";

/**
 * A still picture of the product drawn in markup: a ranked candidate list with
 * green, amber and red scores, Radar chips, and one resume flagged as not ATS-ready.
 */
export function ProductPreview() {
  return (
    <figure className="min-w-0">
      <div
        role="img"
        aria-label="Illustration with sample data: a ranked candidate list with green, amber and red match scores, an unreadable application alert, and a candidate evaluation summary."
        className="surface-card overflow-hidden rounded-lg border border-border text-copy-14 shadow-sm"
      >
        <p className={cn(row, "justify-between border-b border-border font-medium bg-secondary/30")}>
          Senior Frontend Engineer
          <span className={cn(mono, "text-label-12 font-normal text-muted-foreground")}>
            5 applicants
          </span>
        </p>
        <ol className="divide-y divide-border">
          {sampleCandidates.map(([name, score], index) => (
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
        <p className="surface-subtle border-y border-border px-4 py-2.5 text-copy-13 text-muted-foreground bg-amber-500/5">
          <span className="font-medium text-amber-500">Unreadable file: </span>
          Only 38 characters detected: scanned image or corrupted PDF
        </p>
        <div className="space-y-3 p-4 bg-secondary/20">
          <p className="flex justify-between text-label-12 text-muted-foreground">
            Top candidate match
            <span className={cn(mono, "text-foreground font-medium")}>Score: 9.1 / 10</span>
          </p>
          <p className="font-medium text-copy-14">
            Strong systems architecture experience with modern web stacks, distributed systems, and performance tuning.
          </p>
          <div className="flex gap-2 text-label-12 text-muted-foreground">
            <span className="rounded border border-border px-2 py-0.5 bg-background">Strengths: 3</span>
            <span className="rounded border border-border px-2 py-0.5 bg-background">Radar: Clean profile</span>
          </div>
        </div>
      </div>
      <figcaption className="mt-2 text-label-12 text-muted-foreground">
        Illustration. Candidate names and scores are simulated.
      </figcaption>
    </figure>
  );
}
