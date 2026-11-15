import { RADAR_FLAGS } from "@/lib/jobs/radar";
import type { RankedCandidate } from "@/lib/jobs/types";
import { resumeFileHref } from "@/lib/resumes/saved-status";
import { InvitePanel } from "./invite-panel";

function BulletList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-heading-14">{title}</h4>
      {items.length > 0 ? (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-copy-14">
          {items.map((item, index) => (
            <li key={`${index}:${item}`}>{item}</li>
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
    <div className="flex flex-col gap-4 border-t border-border px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-1">
        <h4 className="text-heading-14">Summary</h4>
        <p className="text-copy-14">{candidate.match_summary}</p>
      </div>
      <BulletList title="Strengths" items={candidate.strengths} empty="None listed." />
      <BulletList title="Gaps" items={candidate.gaps} empty="None listed." />
      <div className="flex flex-col gap-1">
        <h4 className="text-heading-14">Radar</h4>
        {radarEntries.length > 0 ? (
          <ul className="flex flex-col gap-1 text-copy-14">
            {radarEntries.map(({ key, label, entry }) => (
              <li key={key}>
                <span className="font-medium">{label}</span>{" "}
                <span className="text-muted-foreground">
                  ({entry.flagged ? "flagged" : "not flagged"})
                </span>
                : {entry.note}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-copy-14 text-muted-foreground">No Radar results stored.</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h4 className="text-heading-14">Invitation</h4>
        <InvitePanel
          candidate={candidate}
          jobTitle={jobTitle}
          focusEmail={focusInvite}
          onEmailFocused={onInviteFocused}
        />
      </div>
      <p className="text-copy-13 text-muted-foreground">
        Resume file:{" "}
        <a
          href={resumeFileHref(candidate.resume_id)}
          aria-label={`Download ${candidate.resume_file_name}`}
          className="focus-ring rounded-sm font-mono break-all text-link underline underline-offset-4"
        >
          {candidate.resume_file_name}
        </a>
      </p>
    </div>
  );
}
