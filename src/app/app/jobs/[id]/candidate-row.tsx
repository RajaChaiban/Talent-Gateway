"use client";

import { ChevronDown } from "lucide-react";
import { RadarChips } from "@/components/candidates/radar-chips";
import { ScoreBadge } from "@/components/candidates/score-badge";
import { Badge } from "@/components/ui/badge";
import { isTopTalent } from "@/lib/jobs/helpers";
import type { RankedCandidate } from "@/lib/jobs/types";
import type { StoredScore } from "@/lib/score";
import { cn } from "@/lib/utils";
import { CandidateDetail } from "./candidate-detail";

type Props = {
  candidate: RankedCandidate;
  topTalent: StoredScore;
  open: boolean;
  onToggle: () => void;
};

export function CandidateRow({ candidate, topTalent, open, onToggle }: Props) {
  const detailId = `candidate-${candidate.id}-detail`;
  return (
    <li className="rounded-lg border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={onToggle}
        className="focus-ring flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg px-4 py-3 text-left transition-colors hover:bg-background-subtle sm:px-5"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
          <span className="min-w-0 break-words text-label-14 font-medium">
            {candidate.full_name}
          </span>
          {isTopTalent(candidate.match_score, topTalent) ? (
            <Badge className="border-success-border bg-success-subtle text-success">
              Top talent
            </Badge>
          ) : null}
        </span>
        <ScoreBadge score={candidate.match_score} />
      </button>
      <div className="flex flex-col gap-2 px-4 pb-3 sm:px-5">
        <RadarChips radar={candidate.radar_results} />
      </div>
      {open ? (
        <div id={detailId} role="region" aria-label={`${candidate.full_name} details`}>
          <CandidateDetail candidate={candidate} />
        </div>
      ) : null}
    </li>
  );
}
