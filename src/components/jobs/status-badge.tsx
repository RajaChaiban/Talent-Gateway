// Small badge showing a job's status, used in the job list and on the job page.

import { Badge } from "@/components/ui/badge";

const STATUS_LABELS: Record<string, string> = {
  CREATED: "Created",
  ANALYZING: "Analyzing",
  DONE: "Done",
  ERROR: "Error",
};

const STATUS_TONES: Record<string, string> = {
  DONE: "border-success-border bg-success-subtle text-success",
  ANALYZING: "border-warning-border bg-warning-subtle text-warning",
  ERROR: "border-error-border bg-error-subtle text-error",
};

/** An unknown status is shown as it is rather than hidden. */
export function JobStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className={STATUS_TONES[status]}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
