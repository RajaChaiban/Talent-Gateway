import Link from "next/link";
import { Sparkles } from "lucide-react";
import { APP_NAME } from "@/lib/config";
import { cn } from "@/lib/utils";

/** The product mark (a rounded primary square with a sparkle) beside the app name, linking to `href`. */
export function Brand({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "focus-ring inline-flex items-center gap-2.5 rounded-md text-heading-16 text-foreground",
        className,
      )}
    >
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Sparkles aria-hidden className="size-4" />
      </span>
      {APP_NAME}
    </Link>
  );
}
