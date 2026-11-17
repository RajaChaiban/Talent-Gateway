"use client";

import { ChevronDown, ChevronRight, Mail, MailCheck } from "lucide-react";
import { RadarChips } from "@/components/candidates/radar-chips";
import { ScoreBadge } from "@/components/candidates/score-badge";
import { Button } from "@/components/ui/button";
import { isTopTalent } from "@/lib/jobs/helpers";
import type { RankedCandidate } from "@/lib/jobs/types";
import type { StoredScore } from "@/lib/score";
import { CandidateDetail } from "./candidate-detail";
import { inviteShortcutLabel } from "./invite-panel";

type Props = {
  candidate: RankedCandidate;
  /** The candidate's place in the full ranking, from 1, shown even when a search hides others. */
  rank: number;
  topTalent: StoredScore;
  jobTitle: string;
  open: boolean;
  onToggle: () => void;
  focusInvite: boolean;
  onInvite: () => void;
  onInviteFocused: () => void;
};

const TAG = "rounded-sm px-1.5 py-0.5 text-label-12 font-medium";

/**
 * One ranked candidate. The header holds two sibling controls, because a
 * button cannot sit inside another: the expand trigger, and the invite
 * shortcut, which only opens the detail and focuses the email field. Sending
 * stays the panel's own button, after the recruiter has checked the address.
 */
export function CandidateRow({
  candidate,
  rank,
  topTalent,
  jobTitle,
  open,
  onToggle,
  focusInvite,
  onInvite,
  onInviteFocused,
}: Props) {
  const detailId = `candidate-${candidate.id}-detail`;
  const inviteLabel = inviteShortcutLabel(candidate.invite_status);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <li className="rounded-lg border border-border surface-card">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 p-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={onToggle}
          className="focus-ring flex min-w-0 flex-1 basis-64 items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-background-subtle"
        >
          <span
            className="w-5 shrink-0 text-center font-mono text-label-12 text-muted-foreground tabular-nums"
            aria-hidden
          >
            {String(rank).padStart(2, "0")}
          </span>
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="min-w-0 break-words text-label-16 font-medium">
              {candidate.full_name}
            </span>
            {isTopTalent(candidate.match_score, topTalent) ? (
              <span className={`${TAG} bg-success-subtle text-success`}>Top talent</span>
            ) : null}
            {candidate.invite_status === "SENT" ? (
              <span className={`${TAG} inline-flex items-center gap-1 bg-muted text-muted-foreground`}>
                <MailCheck className="size-3" aria-hidden />
                Invited
              </span>
            ) : null}
          </span>
          <ScoreBadge score={candidate.match_score} />
          <Chevron className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
        {inviteLabel && !open ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto"
            aria-label={`${inviteLabel}: ${candidate.full_name}`}
            onClick={onInvite}
          >
            <Mail data-icon="inline-start" aria-hidden />
            {inviteLabel}
          </Button>
        ) : null}
      </div>
      <div className="px-4 pb-3 empty:hidden sm:pl-12">
        <RadarChips radar={candidate.radar_results} />
      </div>
      {open ? (
        <div id={detailId} role="region" aria-label={`${candidate.full_name} details`}>
          <CandidateDetail
            candidate={candidate}
            jobTitle={jobTitle}
            focusInvite={focusInvite}
            onInviteFocused={onInviteFocused}
          />
        </div>
      ) : null}
    </li>
  );
}
