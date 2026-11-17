import { FileText } from "lucide-react";

/** The square file icon at the start of a resume row. */
export function FileGlyph() {
  return (
    <span
      className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
      aria-hidden
    >
      <FileText className="size-5" />
    </span>
  );
}
