"use client";

import type { RankedCandidate } from "@/lib/jobs/types";
import type { StoredScore } from "@/lib/score";
import { CandidateRow } from "./candidate-row";

type Props = {
  candidates: RankedCandidate[];
  topTalent: StoredScore;
  jobTitle: string;
  openId: string | null;
  onToggle: (id: string) => void;
};

export function RankedList({ candidates, topTalent, jobTitle, openId, onToggle }: Props) {
  return (
    <ol className="flex flex-col gap-2" aria-label="Candidates, best match first">
      {candidates.map((candidate) => (
        <CandidateRow
          key={candidate.id}
          candidate={candidate}
          topTalent={topTalent}
          jobTitle={jobTitle}
          open={openId === candidate.id}
          onToggle={() => onToggle(candidate.id)}
        />
      ))}
    </ol>
  );
}
