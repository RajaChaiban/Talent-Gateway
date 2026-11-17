import { ArrowDownToLine, Check, CircleAlert, type LucideIcon } from "lucide-react";
import { RADAR_FLAGS } from "@/lib/jobs/radar";
import type { RankedCandidate } from "@/lib/jobs/types";
import { resumeFileHref } from "@/lib/resumes/saved-status";
import { cn } from "@/lib/utils";
import { InvitePanel } from "./invite-panel";

function BulletList({
  title,
  items,
  empty,
  icon: Icon,
  iconClass,
}: {
  title: string;
  items: string[];
  empty: string;
  icon: LucideIcon;
  iconClass: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-heading-14">{title}</h3>
      {items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {items.map((item, index) => (
            <li key={`${index}:${item}`} className="flex gap-2 text-copy-14 text-muted-foreground">
              <Icon className={cn("mt-0.5 size-4 shrink-0", iconClass)} aria-hidden />
              <span className="min-w-0 break-words">{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-copy-14 text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

/** The expanded part of a candidate row: summary, strengths, gaps, every Radar note, the invitation and the resume file. */
export function CandidateDetail({
  candidate,
  jobTitle,
  focusInvite = false,
  onInviteFocused,
}: {
  candidate: RankedCandidate;
  jobTitle: string;
  /** Move focus to the invitation's email field (the row's invite shortcut was used). */
  focusInvite?: boolean;
  onInviteFocused?: () => void;
}) {
  const radarEntries = RADAR_FLAGS.flatMap(({ key, label }) => {
    const entry = candidate.radar_results[key];
    return entry ? [{ key, label, entry }] : [];
  });

  return (
    <div className="flex flex-col gap-5 rounded-b-lg border-t border-border surface-subtle p-4 sm:p-5">
      <div className="flex flex-col gap-2">
        <h3 className="sr-only">Summary</h3>
        <p className="text-copy-14 leading-6 text-muted-foreground">{candidate.match_summary}</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <BulletList
          title="Strengths"
          items={candidate.strengths}
          empty="None listed."
          icon={Check}
          iconClass="text-success"
        />
        <BulletList
          title="Gaps"
          items={candidate.gaps}
          empty="None listed."
          icon={CircleAlert}
          iconClass="text-warning"
        />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border surface-card p-4">
        <h3 className="text-heading-14">Radar</h3>
        {radarEntries.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border">
            {radarEntries.map(({ key, label, entry }) => (
              <li key={key} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
                <span className="flex flex-wrap items-center justify-between gap-2 text-label-14">
                  <span className="font-medium">{label}</span>
                  <span
                    className={cn(
                      "rounded-sm px-1.5 py-0.5 text-label-12 font-medium",
                      entry.flagged ? "bg-warning-subtle text-warning" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {entry.flagged ? "Flagged" : "Not flagged"}
                  </span>
                </span>
                <span className="text-copy-14 text-muted-foreground">{entry.note}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-copy-14 text-muted-foreground">No Radar results stored.</p>
        )}
      </div>

      <p className="text-copy-14 text-muted-foreground">
        Resume file:{" "}
        <a
          href={resumeFileHref(candidate.resume_id)}
          aria-label={`Download ${candidate.resume_file_name}`}
          className="focus-ring inline-flex max-w-full items-center gap-1 rounded-sm font-mono break-all text-link underline-offset-4 hover:underline"
        >
          {candidate.resume_file_name}
          <ArrowDownToLine className="size-4 shrink-0" aria-hidden />
        </a>
      </p>

      <div className="flex flex-col gap-3 rounded-lg border border-border surface-card p-4">
        <h3 className="text-heading-14">Interview invitation</h3>
        <InvitePanel
          candidate={candidate}
          jobTitle={jobTitle}
          focusEmail={focusInvite}
          onEmailFocused={onInviteFocused}
        />
      </div>
    </div>
  );
}
