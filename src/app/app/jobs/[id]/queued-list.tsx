import type { QueuedResume } from "@/lib/jobs/types";

/** Resumes the recruiter chose to score anyway that have no candidate row yet. */
export function QueuedList({ resumes }: { resumes: QueuedResume[] }) {
  if (resumes.length === 0) return null;
  return (
    <section aria-labelledby="queued-heading" className="flex flex-col gap-2">
      <h3 id="queued-heading" className="text-heading-14">
        Queued for scoring
      </h3>
      <ul className="flex flex-col gap-2">
        {resumes.map((resume) => (
          <li
            key={resume.id}
            className="rounded-lg border border-border bg-card px-4 py-3 text-label-14 sm:px-5"
          >
            <span className="font-mono break-all">{resume.file_name}</span>
            <span className="text-muted-foreground"> will be scored in the next analysis.</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
