import { Skeleton } from "@/components/ui/skeleton";

export default function JobLoading() {
  return (
    <div
      className="flex w-full flex-col gap-10"
      aria-busy="true"
      aria-label="Loading job"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-5 w-48" />
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  );
}
