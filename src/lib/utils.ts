import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The type scale in globals.css adds `text-heading-24`, `text-label-14`, ...
 * Without this, tailwind-merge reads them as text colors and drops one of
 * `text-heading-24 text-muted-foreground`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: [(value: string) => /^(heading|label|copy|button)-\d+$/.test(value)] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
