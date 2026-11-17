import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** A centred icon, title and line of text for a list with nothing to show, with an optional action below. */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-5 py-16 text-center">
      <span
        className="grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground"
        aria-hidden
      >
        <Icon className="size-5" />
      </span>
      <h3 className="mt-4 text-heading-16">{title}</h3>
      <p className="mt-2 max-w-sm text-copy-14 text-muted-foreground">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
