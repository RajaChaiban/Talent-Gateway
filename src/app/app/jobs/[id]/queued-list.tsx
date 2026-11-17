import { ListChecks, Search } from "lucide-react";
import type { QueuedResume } from "@/lib/jobs/types";
import { EmptyState } from "./empty-state";
import { FileGlyph } from "./file-glyph";

/** Resumes the recruiter chose to score anyway that have no candidate row yet. */
export function QueuedList({
  resumes,
  totalCount,
}: {
  /** The queued resumes to show: all of them, or those matching the search. */
  resumes: QueuedResume[];
  /** How many are queued before the search, to tell "queue is clear" from "none match". */
  totalCount: number;
}) {
  if (totalCount === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="Queue is clear"
        body="No resumes are waiting to be scored anyway."
      />
    );
  }
  if (resumes.length === 0) {
    return <EmptyState icon={Search} title="No matching resumes" body="Try a different search." />;
  }
  return (
    <ul className="flex flex-col gap-2">
      {resumes.map((resume) => (
        <li
          key={resume.id}
          className="flex items-center gap-3 rounded-lg border border-border surface-card p-3"
        >
          <FileGlyph />
          <div className="min-w-0 flex-1">
            <p className="truncate text-label-14 font-medium" title={resume.file_name}>
              {resume.file_name}
            </p>
            <p className="mt-1 text-copy-13 text-muted-foreground">
              Will be scored in the next analysis.
            </p>
          </div>
          <span className="shrink-0 rounded-sm bg-muted px-2 py-1 text-label-12 text-muted-foreground">
            Waiting
          </span>
        </li>
      ))}
    </ul>
  );
}
