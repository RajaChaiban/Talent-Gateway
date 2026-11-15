"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { LocalDate } from "@/components/jobs/local-date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invitationMessage } from "@/lib/invitations/message";
import { inviteEmailSchema } from "@/lib/invitations/schemas";
import { isStaleApproval } from "@/lib/invitations/status";
import type { RankedCandidate } from "@/lib/jobs/types";
import { requestInvite } from "./invite-client";

type InvitePhase = "ready" | "sending" | "sent" | "failed";

/**
 * Which of the four states the panel shows. A request of this page in flight
 * is "sending"; so is an APPROVED invitation, unless it is old enough to be a
 * send that died part-way, which can be retried like a failed one.
 */
export function invitePhase(
  candidate: Pick<RankedCandidate, "invite_status" | "invitation">,
  requesting: boolean,
  now: Date,
): InvitePhase {
  if (requesting) return "sending";
  const { invite_status, invitation } = candidate;
  if (invite_status === "SENT" && invitation?.sent_at) return "sent";
  if (invite_status === "FAILED") return "failed";
  if (invite_status === "APPROVED") {
    return invitation && !isStaleApproval(invitation.approved_at, now) ? "sending" : "failed";
  }
  return "ready";
}

type ViewProps = {
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  phase: InvitePhase;
  email: string;
  sentTo: string | null;
  sentAt: string | null;
  /** The last request's error, shown until the next attempt. */
  error: string | null;
  onEmailChange: (value: string) => void;
  onSubmit: () => void;
};

const STATUS_TEXT: Record<InvitePhase, string> = {
  ready: "",
  sending: "Sending…",
  sent: "",
  failed: "The invitation could not be sent.",
};

/** The panel's markup for one state, without any state of its own. */
export function InvitePanelView({
  candidateId,
  candidateName,
  jobTitle,
  phase,
  email,
  sentTo,
  sentAt,
  error,
  onEmailChange,
  onSubmit,
}: ViewProps) {
  const fieldId = `invite-email-${candidateId}`;
  const hintId = `${fieldId}-hint`;
  const sending = phase === "sending";
  const valid = inviteEmailSchema.safeParse(email).success;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (valid && !sending) onSubmit();
  }

  const message = invitationMessage(candidateName, jobTitle);
  const announcement =
    phase === "sent" ? `Invitation sent to ${sentTo ?? "the candidate"}.` : STATUS_TEXT[phase];

  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {phase === "sent" ? (
        <>
          <p className="text-copy-14">
            Invitation sent to <span className="font-medium break-all">{sentTo}</span>
            {sentAt ? (
              <>
                {" "}
                on <LocalDate iso={sentAt} />
              </>
            ) : null}
            .
          </p>
          <div className="flex flex-col gap-2 rounded-md border border-border bg-background-subtle px-3 py-2">
            <p className="text-copy-14">
              <span className="text-muted-foreground">Subject:</span> {message.subject}
            </p>
            <p className="text-copy-14 whitespace-pre-line">{message.text}</p>
          </div>
        </>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fieldId}>Candidate email</Label>
            <Input
              id={fieldId}
              type="email"
              name="email"
              autoComplete="off"
              spellCheck={false}
              value={email}
              disabled={sending}
              aria-describedby={hintId}
              aria-invalid={email.trim() !== "" && !valid ? true : undefined}
              onChange={(event) => onEmailChange(event.target.value)}
              className="sm:max-w-sm"
            />
            <p id={hintId} className="text-copy-13 text-muted-foreground">
              The first address found in the resume. Check it before sending.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={sending || !valid}>
              {sending ? <LoaderCircle className="animate-spin" data-icon="inline-start" aria-hidden /> : null}
              {sending ? "Sending…" : phase === "failed" ? "Try again" : "Invite to interview"}
            </Button>
            {phase === "failed" ? (
              <span className="text-copy-13 text-error">{STATUS_TEXT.failed}</span>
            ) : null}
          </div>
          {error ? (
            <p
              role="alert"
              className="rounded-md border border-error-border bg-error-subtle px-3 py-2 text-copy-14 text-error"
            >
              {error}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}

/**
 * "Invite to interview" for one ranked candidate. The click is the approval:
 * the recruiter checks or corrects the address read from the resume, and the
 * route sends the invitation once. After an answer the page reloads its data,
 * so the panel shows the status as stored.
 */
export function InvitePanel({
  candidate,
  jobTitle,
}: {
  candidate: RankedCandidate;
  jobTitle: string;
}) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [email, setEmail] = useState(candidate.invitation?.sent_to ?? candidate.email ?? "");
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openedAt] = useState(() => new Date());

  async function invite() {
    setRequesting(true);
    setError(null);
    const outcome = await requestInvite(candidate.id, email);
    setRequesting(false);
    if (!outcome.ok) setError(outcome.message);
    if (outcome.ok || outcome.refresh) startTransition(() => router.refresh());
  }

  return (
    <InvitePanelView
      candidateId={candidate.id}
      candidateName={candidate.full_name}
      jobTitle={jobTitle}
      phase={invitePhase(candidate, requesting || (refreshing && error === null), openedAt)}
      email={email}
      sentTo={candidate.invitation?.sent_to ?? null}
      sentAt={candidate.invitation?.sent_at ?? null}
      error={error}
      onEmailChange={setEmail}
      onSubmit={invite}
    />
  );
}
