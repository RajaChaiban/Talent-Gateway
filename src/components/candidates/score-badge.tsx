import { trafficLight } from "@/lib/config";
import { formatScore, type StoredScore } from "@/lib/score";
import { lightClass, lightLabel } from "@/lib/traffic-light";
import { cn } from "@/lib/utils";

/** The score, its traffic-light dot and the word for that light, so color is never the only signal. */
export function ScoreBadge({ score }: { score: StoredScore }) {
  const light = trafficLight(score);
  return (
    <span className="inline-flex items-center gap-2 text-label-14">
      <span className={cn("size-2.5 shrink-0 rounded-full", lightClass[light])} aria-hidden />
      <span className="font-mono font-semibold tabular-nums">{formatScore(score)}</span>
      <span className="text-muted-foreground">{lightLabel[light]}</span>
    </span>
  );
}
