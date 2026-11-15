import { jsonData, jsonError } from "@/lib/http";
import type { InviteOutcome } from "./invite";

const CANDIDATE_NOT_FOUND_MESSAGE = "Candidate not found";
const SEND_IN_PROGRESS_MESSAGE =
  "This invitation is already being sent. Reload the page in a moment to see the result.";
const EMAIL_FAILED_MESSAGE = "The invitation could not be sent. Try again.";

/** The invite route's answer for one outcome of `inviteCandidate`. */
export function inviteResponse(outcome: InviteOutcome): Response {
  switch (outcome.kind) {
    case "not_found":
      return jsonError("not_found", CANDIDATE_NOT_FOUND_MESSAGE, 404);
    case "in_progress":
      return jsonError("conflict", SEND_IN_PROGRESS_MESSAGE, 409);
    case "failed":
      return jsonError("email_failed", EMAIL_FAILED_MESSAGE, 502);
    case "sent":
    case "stored":
      return jsonData(outcome.state);
  }
}
