// Loading skeleton shown while a job page is being fetched.

import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder blocks in the job page's order: heading, description, thresholds, resumes, Analyze and candidates. */
export default function JobLoading() {
  return (
    <div className="flex w-full flex-col" aria-busy="true" aria-label="Loading job">
      <div className="flex flex-col gap-6">
        <Skeleton className="h-5 w-14" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-80 max-w-full" />
          <Skeleton className="h-5 w-40" />
        </div>
      </div>
      <Skeleton className="mt-7 h-36 w-full rounded-lg" />
      <Skeleton className="mt-5 h-40 w-full rounded-lg" />
      <div className="mt-8 flex items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-5 w-48 max-w-full" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <Skeleton className="mt-4 h-40 w-full rounded-lg" />
      <Skeleton className="mt-8 h-24 w-full rounded-lg" />
      <Skeleton className="mt-9 h-8 w-40" />
      <div className="mt-4 flex flex-col gap-3">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    </div>
  );
}
