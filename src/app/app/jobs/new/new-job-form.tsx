"use client";

// The new-job form: title, description and the two score bars. Posts to `createJobAction` and shows its field errors.

import Link from "next/link";
import { useActionState, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { ThresholdSliders } from "@/components/jobs/threshold-sliders";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { JOB_THRESHOLD_DEFAULTS } from "@/lib/config";
import { SAMPLE_JOB_DESCRIPTION, samplePath } from "@/lib/samples";
import { formatScore } from "@/lib/score";
import { DESCRIPTION_MAX } from "@/lib/jobs/schemas";
import { createJobAction, type CreateJobState } from "./actions";

const initialState: CreateJobState = {
  values: {
    title: "",
    description: "",
    top_talent_threshold: JOB_THRESHOLD_DEFAULTS.topTalent,
    invite_threshold: JOB_THRESHOLD_DEFAULTS.invite,
  },
  fieldErrors: {},
  formError: null,
};

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="text-copy-13 text-error">
      {message}
    </p>
  );
}

/** Client form for creating a job. The two score bars live in state because the sliders are controlled; they are posted as hidden fields. */
export function NewJobForm() {
  const [state, formAction, pending] = useActionState(createJobAction, initialState);
  const [topTalent, setTopTalent] = useState(state.values.top_talent_threshold);
  const [invite, setInvite] = useState(state.values.invite_threshold);
  const { title: titleError, description: descriptionError } = state.fieldErrors;
  const thresholdError =
    state.fieldErrors.top_talent_threshold ?? state.fieldErrors.invite_threshold;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-8">
      {state.formError ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Job title</Label>
        <Input
          id="title"
          name="title"
          required
          autoComplete="off"
          placeholder="Senior backend engineer"
          defaultValue={state.values.title}
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? "title-error" : undefined}
          size="lg"
        />
        <FieldError id="title-error" message={titleError} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Job description</Label>
        <Textarea
          id="description"
          name="description"
          required
          rows={14}
          placeholder="Paste the full job description here."
          defaultValue={state.values.description}
          aria-invalid={descriptionError ? true : undefined}
          aria-describedby={
            descriptionError ? "description-error description-hint" : "description-hint"
          }
          size="lg"
          className="min-h-72"
        />
        <p id="description-hint" className="text-copy-13 text-muted-foreground">
          Up to {DESCRIPTION_MAX.toLocaleString("en-US")} characters.{" "}
          <a
            href={samplePath(SAMPLE_JOB_DESCRIPTION)}
            target="_blank"
            rel="noopener"
            className="focus-ring rounded-sm text-link underline underline-offset-4"
          >
            Use a sample job description
          </a>
        </p>
        <FieldError id="description-error" message={descriptionError} />
      </div>

      <div className="flex flex-col gap-3">
        <ThresholdSliders
          values={{ top_talent_threshold: topTalent, invite_threshold: invite }}
          onChange={(field, value) =>
            field === "top_talent_threshold" ? setTopTalent(value) : setInvite(value)
          }
          disabled={pending}
        />
        <input type="hidden" name="top_talent_threshold" value={formatScore(topTalent)} />
        <input type="hidden" name="invite_threshold" value={formatScore(invite)} />
        <FieldError id="threshold-error" message={thresholdError} />
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
        <Link href="/app" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Cancel
        </Link>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? (
            <>
              <LoaderCircle className="animate-spin" data-icon="inline-start" aria-hidden />
              Creating…
            </>
          ) : (
            "Create job"
          )}
        </Button>
      </div>
    </form>
  );
}
