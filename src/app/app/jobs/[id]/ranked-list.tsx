"use client";

import type { RankedCandidate } from "@/lib/jobs/types";
import type { StoredScore } from "@/lib/score";
import { CandidateRow } from "./candidate-row";

type Props = {
  candidates: RankedCandidate[];
  topTalent: StoredScore;
  openId: string | null;
  onToggle: (id: string) => void;
};

export function RankedList({ candidates, topTalent, openId, onToggle }: Props) {
  return (
    <ol className="flex flex-col gap-2" aria-label="Candidates, best match first">
      {candidates.map((candidate) => (
        <CandidateRow
          key={candidate.id}
          candidate={candidate}
          topTalent={topTalent}
          open={openId === candidate.id}
          onToggle={() => onToggle(candidate.id)}
        />
      ))}
    </ol>
  );
}
