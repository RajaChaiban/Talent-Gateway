"use client";

import { useId, useState } from "react";
import { radarChips, type RadarChip, type RadarResults } from "@/lib/jobs/radar";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function Chip({ chip }: { chip: RadarChip }) {
  const noteId = useId();
  const [dismissed, setDismissed] = useState(false);
  return (
    <span
      className="group inline-flex"
      onPointerEnter={() => setDismissed(false)}
      onFocus={() => setDismissed(false)}
    >
      <button
        type="button"
        aria-describedby={noteId}
        onKeyDown={(event) => {
          if (event.key === "Escape") setDismissed(true);
        }}
        className={cn(
          badgeVariants({ variant: "outline" }),
          "cursor-default border-warning-border bg-warning-subtle text-warning",
        )}
      >
        {chip.label}
      </button>
      <span
        id={noteId}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-full z-10 mt-1 hidden rounded-xl border border-border bg-popover px-3 py-2 text-copy-13 text-popover-foreground shadow-menu group-focus-within:block group-hover:block",
          dismissed && "hidden!",
        )}
      >
        {chip.note}
      </span>
    </span>
  );
}

/** One chip for each Radar flag that is set; its note shows on hover and keyboard focus. */
export function RadarChips({ radar }: { radar: RadarResults }) {
  const chips = radarChips(radar);
  if (chips.length === 0) return null;
  return (
    <ul className="relative flex flex-wrap gap-1.5" aria-label="Radar flags">
      {chips.map((chip) => (
        <li key={chip.key}>
          <Chip chip={chip} />
        </li>
      ))}
    </ul>
  );
}
