"use client";

import type { RankedCandidate } from "@/lib/jobs/types";
import type { StoredScore } from "@/lib/score";
import { CandidateRow } from "./candidate-row";

type Props = {
  candidates: RankedCandidate[];
  /** Each candidate's place in the full ranking, from 1, so a filtered list keeps the real numbers. */
  ranks: ReadonlyMap<string, number>;
  topTalent: StoredScore;
  jobTitle: string;
  openId: string | null;
  onToggle: (id: string) => void;
  /** The candidate whose invitation email field should take focus, if any. */
  focusInviteId: string | null;
  onInvite: (id: string) => void;
  onInviteFocused: () => void;
};

/** The ranked candidates, best match first, as one expandable row each. Only one row is open at a time; `openId` says which. */
export function RankedList({
  candidates,
  ranks,
  topTalent,
  jobTitle,
  openId,
  onToggle,
  focusInviteId,
  onInvite,
  onInviteFocused,
}: Props) {
  return (
    <ol className="flex flex-col gap-3" aria-label="Candidates, best match first">
      {candidates.map((candidate, index) => (
        <CandidateRow
          key={candidate.id}
          candidate={candidate}
          rank={ranks.get(candidate.id) ?? index + 1}
          topTalent={topTalent}
          jobTitle={jobTitle}
          open={openId === candidate.id}
          onToggle={() => onToggle(candidate.id)}
          focusInvite={focusInviteId === candidate.id}
          onInvite={() => onInvite(candidate.id)}
          onInviteFocused={onInviteFocused}
        />
      ))}
    </ol>
  );
}
