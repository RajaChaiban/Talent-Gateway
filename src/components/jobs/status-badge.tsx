// Small badge showing a job's status, used in the job list and on the job page.

import { Badge } from "@/components/ui/badge";

const STATUS_LABELS: Record<string, string> = {
  CREATED: "Created",
  ANALYZING: "Analyzing",
  DONE: "Done",
  ERROR: "Error",
};

/** An unknown status is shown as it is rather than hidden. */
export function JobStatusBadge({ status }: { status: string }) {
  const variant =
    status === "ERROR" ? "destructive" : status === "DONE" ? "default" : "secondary";
  return <Badge variant={variant}>{STATUS_LABELS[status] ?? status}</Badge>;
}
