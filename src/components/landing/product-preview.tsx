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
 * A still picture of the product drawn in markup: a ranked candidate list and
 * an evaluation summary. It is exposed to assistive technology as one image with
 * a description, so the sample names are never read out as real people.
 */
export function ProductPreview() {
  return (
    <figure className="min-w-0">
      <div
        role="img"
        aria-label="Illustration with invented sample data: a job's ranked candidate list with green, amber and red scores and one resume that is not ATS-ready, and a top match candidate evaluation."
        className="surface-card overflow-hidden rounded-lg border border-border text-copy-14"
      >
        <p className={cn(row, "justify-between border-b border-border font-medium")}>
          Senior Frontend Engineer
          <span className={cn(mono, "text-label-12 font-normal text-muted-foreground")}>
            5 resumes
          </span>
        </p>
        <ol className="divide-y divide-border">
          {sampleCandidates.map(([name, score], index) => (
            <li key={name} className={row}>
              <span className={cn(mono, "w-3 text-label-12 text-muted-foreground")}>{index + 1}</span>
              <span className="flex-1">{name}</span>
              <span className={cn("size-2.5 rounded-full", lightClass[trafficLight(score)])} />
              <span data-score className={cn(mono, "w-8 text-right font-medium")}>
                {formatScore(score)}
              </span>
            </li>
          ))}
        </ol>
        <p className="surface-subtle border-y border-border px-4 py-2.5 text-copy-13 text-muted-foreground">
          <span className="font-medium text-foreground">Not ATS-ready: </span>
          Only 38 characters of text could be read: likely a scanned image
        </p>
        <div className="space-y-3 p-4">
          <p className="flex justify-between text-label-12 text-muted-foreground">
            Top candidate analysis
            <span className={cn(mono, "text-foreground font-medium")}>Score: 9.1</span>
          </p>
          <p className="font-medium">
            Strong systems architecture experience with Next.js, Edge runtimes, and high-throughput Postgres.
          </p>
          <div className="flex gap-2 text-label-12 text-muted-foreground">
            <span className="rounded border border-border px-2 py-0.5">Strengths: 3</span>
            <span className="rounded border border-border px-2 py-0.5">Radar: Clean</span>
          </div>
        </div>
      </div>
      <figcaption className="mt-2 text-label-12 text-muted-foreground">
        Illustration. Names and scores are invented.
      </figcaption>
    </figure>
  );
}
