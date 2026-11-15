import { BriefcaseBusiness } from "lucide-react";
import { requireSignedInUser } from "@/lib/auth/require-signed-in-user";

/**
 * The signed-in home. It holds no data yet: jobs arrive with the jobs feature.
 *
 * DECISION: the page checks the user itself. The layout above it is only
 * chrome, and a layout does not gate its child pages.
 */
export default async function JobsPage() {
  await requireSignedInUser("/app");

  return (
    <section aria-labelledby="jobs-heading" className="flex flex-1 flex-col gap-6">
      <h1 id="jobs-heading" className="text-heading-24">
        Jobs
      </h1>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-border surface-subtle px-6 py-16 text-center">
        <BriefcaseBusiness className="mb-2 size-6 text-muted-foreground" aria-hidden />
        <h2 className="text-heading-20">No jobs yet</h2>
        <p className="max-w-sm text-copy-14 text-muted-foreground">
          Jobs you create will appear here, each with its ranked candidates.
        </p>
      </div>
    </section>
  );
}
