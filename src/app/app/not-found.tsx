import { SearchX } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function RecruiterNotFound() {
  return (
    <section
      aria-labelledby="not-found-heading"
      className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-border surface-subtle px-6 py-16 text-center"
    >
      <SearchX className="mb-2 size-6 text-muted-foreground" aria-hidden />
      <h1 id="not-found-heading" className="text-heading-20">
        Page not found
      </h1>
      <p className="max-w-sm text-copy-14 text-muted-foreground">
        This page or job does not exist, or the link is out of date.
      </p>
      <Link
        href="/app"
        className={buttonVariants({ variant: "outline", size: "lg", className: "mt-4" })}
      >
        Back to jobs
      </Link>
    </section>
  );
}
