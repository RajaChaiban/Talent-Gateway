import { trafficLight, type TrafficLight } from "@/lib/config";
import { formatScore, type StoredScore } from "@/lib/score";
import { lightLabel } from "@/lib/traffic-light";
import { cn } from "@/lib/utils";

/** The tinted fill and text colour of the score pill for each light (status tokens in globals.css). */
const PILL_CLASS: Record<TrafficLight, string> = {
  green: "bg-status-green-subtle text-status-green",
  amber: "bg-status-amber-subtle text-status-amber",
  red: "bg-status-red-subtle text-status-red",
};

/**
 * The score out of 10 in a pill tinted by its traffic light, and the word for
 * that light, so color is never the only signal. On narrow screens the word is
 * kept for screen readers only, to leave the row room for the name.
 */
export function ScoreBadge({ score }: { score: StoredScore }) {
  const light = trafficLight(score);
  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <span
        className={cn(
          "rounded-md px-2.5 py-1.5 font-mono text-label-14 font-medium tabular-nums",
          PILL_CLASS[light],
        )}
      >
        {formatScore(score)}
        <span className="font-normal"> / 10</span>
      </span>
      <span className="sr-only text-copy-13 text-muted-foreground sm:not-sr-only">
        {lightLabel[light]}
      </span>
    </span>
  );
}
