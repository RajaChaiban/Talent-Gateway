import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { requireSignedInUser } from "@/lib/auth/require-signed-in-user";
import { APP_NAME } from "@/lib/config";
import { NewJobForm } from "./new-job-form";

export const metadata: Metadata = {
  title: `New job · ${APP_NAME}`,
};

export default async function NewJobPage() {
  await requireSignedInUser("/app/jobs/new");

  return (
    <section
      aria-labelledby="new-job-heading"
      className="flex w-full flex-col gap-8"
    >
      <div className="flex flex-col gap-2">
        <Link
          href="/app"
          className="focus-ring inline-flex w-fit items-center gap-1.5 rounded-sm text-label-14 text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Jobs
        </Link>
        <h1 id="new-job-heading" className="text-heading-24">
          New job
        </h1>
      </div>
      <NewJobForm />
    </section>
  );
}
