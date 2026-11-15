"use client";

// Error boundary for every page under /app: shows a message and a retry button when a page fails to load.

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The recruiter area's error screen. `retry` asks Next.js to render the failed page again. */
export default function RecruiterError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <section
      aria-labelledby="error-heading"
      className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-border surface-subtle px-6 py-16 text-center"
    >
      <h1 id="error-heading" className="text-heading-20">
        This page could not load
      </h1>
      <p className="max-w-sm text-copy-14 text-muted-foreground">
        Sign-in or the database did not answer in time. You are still signed in;
        try again in a moment.
      </p>
      <Button variant="outline" onClick={() => retry()} className="mt-4">
        <RotateCw data-icon="inline-start" aria-hidden />
        Try again
      </Button>
    </section>
  );
}
