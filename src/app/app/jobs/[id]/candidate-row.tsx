"use client";

import { ChevronDown, Mail, MailCheck } from "lucide-react";
import { RadarChips } from "@/components/candidates/radar-chips";
import { ScoreBadge } from "@/components/candidates/score-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isTopTalent } from "@/lib/jobs/helpers";
import type { RankedCandidate } from "@/lib/jobs/types";
import type { StoredScore } from "@/lib/score";
import { cn } from "@/lib/utils";
import { CandidateDetail } from "./candidate-detail";
import { inviteShortcutLabel } from "./invite-panel";

type Props = {
  candidate: RankedCandidate;
  topTalent: StoredScore;
  jobTitle: string;
  open: boolean;
  onToggle: () => void;
  focusInvite: boolean;
  onInvite: () => void;
  onInviteFocused: () => void;
};

/**
 * One ranked candidate. The header holds two sibling controls, because a
 * button cannot sit inside another: the expand trigger, and the invite
 * shortcut, which only opens the detail and focuses the email field. Sending
 * stays the panel's own button, after the recruiter has checked the address.
 */
export function CandidateRow({
  candidate,
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
  return (
    <li className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-2 py-1.5 sm:px-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={onToggle}
          className="focus-ring flex min-w-0 flex-1 basis-64 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-background-subtle"
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
            {candidate.invite_status === "SENT" ? (
              <Badge variant="secondary">
                <MailCheck data-icon="inline-start" aria-hidden />
                Invited
              </Badge>
            ) : null}
          </span>
          <ScoreBadge score={candidate.match_score} />
        </button>
        {inviteLabel && !open ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mx-2"
            aria-label={`${inviteLabel}: ${candidate.full_name}`}
            onClick={onInvite}
          >
            <Mail data-icon="inline-start" aria-hidden />
            {inviteLabel}
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 px-4 pb-3 sm:px-5">
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
