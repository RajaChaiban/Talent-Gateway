# Spec: invite a candidate to interview

Status: agreed, being built on `feat/invite`.

## Goal

A recruiter reviews a scored candidate on the job page and clicks **Invite to interview**. That click is the approval. One invitation email is produced for the candidate, and the candidate's status shows that it was sent.

Nothing invites a candidate automatically. A score above the invite bar only suggests who to look at.

## What the recruiter sees

In the candidate detail on `/app/jobs/[id]`, below the Radar section:

| Candidate state | What is shown |
|---|---|
| `NONE` | An email field, filled in with the address found in the resume (empty when none was found), and an **Invite to interview** button |
| `APPROVED` (send in progress) | "Sending…", field and button disabled |
| `SENT` | "Invitation sent to `<address>` on `<date>`", and the email that was sent (subject and text) |
| `FAILED` | "The invitation could not be sent", the email field, and a **Try again** button |

The recruiter can correct the address before sending. The address read from a resume is the first one found in its text, which can be a referee's or an old employer's, so the person approving is shown it and can change it.

The button is disabled until the field holds a valid email address. The ranked list row shows a small "Invited" badge once the status is `SENT`.

## Flow

1. The recruiter checks or corrects the address and clicks the button. The browser calls `POST /api/candidates/[id]/invite` with the address.
2. The route checks, in this order: signed in, same origin, a valid candidate id, a valid email address in the body, the candidate exists.
3. It inserts the `invitations` row (`candidate_id`, `approved_by` = the signed-in user's id, `sent_to` = the address the recruiter approved) and sets `candidates.invite_status` to `APPROVED`.
4. It sends the email through the one send function (see "Email").
5. On success it sets `invitations.sent_at`, `invitations.message_id` and `invite_status` = `SENT`. On failure it sets `invitations.error` and `invite_status` = `FAILED`.
6. The route returns the new status, and the page updates.

`candidates.email` is not changed by an invitation: it stays what was read from the resume. `invitations.sent_to` is the record of the address that was actually used.

## Sending exactly once

The email must not go out twice, whatever the recruiter or the network does.

- `invitations` has `unique (candidate_id)`. A second click finds the existing row instead of adding one.
- A row with `sent_at` set is never sent again. The route answers 200 with the stored status and makes no send call, even if the body carries a different address.
- "Try again" is accepted when the status is `FAILED`, or when it is `APPROVED` and the approval is more than 2 minutes old (a send that was interrupted before it finished). It reuses the same row and may carry a corrected address, which replaces `sent_to`.
- An `APPROVED` row younger than 2 minutes means a send is in progress: the route answers 409 and sends nothing.
- Two simultaneous clicks: the insert is the lock. The request that loses the unique-constraint race does not send.

## Email

All sending goes through one function, `sendInvitationEmail`, which takes the message and returns a message id or throws. The route knows nothing about how the email is delivered.

**In this version the function is a stand-in outbox.** It delivers nothing: it returns the message id `outbox:<invitation id>`, and the candidate detail shows the email that was produced. This lets the whole approval flow be built, tested and demonstrated without a mail account or a sending domain, and it means no test and no demo run can mail a real person.

A real provider (Resend, through its HTTP API) is the planned next step. It replaces the body of that one function and adds its API key, a from address on a verified domain, and an optional redirect-all-mail-to-one-inbox setting for demos. Nothing else in the feature changes. That work is out of scope here.

**The message**

- Subject: `Interview invitation: <job title>`
- Text: a greeting with the candidate's name, the job title, one line saying a recruiter reviewed their application and would like to interview them, and one line saying the recruiter will follow up to arrange a time. No score, no ranking, no link into the app.

The message is built by one pure function from the candidate's name and the job title. The page shows a sent invitation's email by calling the same function, so what is displayed is what was produced. No migration is needed for this: a job's title and a candidate's name cannot be edited after they are created.

## Data

No migration. The `invitations` table and the four `invite_status` values already exist (see [DATA_MODELING.md](../DATA_MODELING.md)).

| Table | Written by this feature |
|---|---|
| `invitations` | One row per invited candidate: who approved, when, the address used, `sent_at`, `message_id`, `error` |
| `candidates` | `invite_status`: `NONE` → `APPROVED` → `SENT` or `FAILED`; `FAILED` or a stale `APPROVED` → `APPROVED` on retry |

## Route

`POST /api/candidates/[id]/invite`

| | |
|---|---|
| Auth | Signed-in recruiter, same origin |
| Input | The candidate id in the path. JSON body `{ "email": "<address>" }` |
| `maxDuration` | 30 |
| 200 | `{ data: { candidate_id, invite_status, sent_to, sent_at } }` (also for a candidate already `SENT`) |
| 400 | `invalid_input`: the id or the email address is not valid |
| 401 / 503 | `unauthorized` / `auth_unavailable` |
| 403 | `forbidden`: cross-site request |
| 404 | `not_found`: no such candidate |
| 409 | `conflict`: a send is already in progress |
| 502 | `email_failed`: the send function failed; the status is now `FAILED` |
| 500 | `server_error`: a database failure, with a safe message |

## Out of scope

- Real delivery through a mail provider (planned next, behind the same function).
- Scheduling, calendar links, or any reply handling.
- Bulk invite. One click invites one candidate.
- Un-inviting or editing a sent invitation.
- A durable workflow. The send happens inside the request; the 2-minute rule above covers a request that died part-way.

## Decisions taken

- **Any signed-in recruiter can invite.** The demo has a single tenant: every signed-in user sees every job.
- **The address is editable before sending**, for the reason given under "What the recruiter sees".
- **The outbox email is rebuilt, not stored**, so no schema change is needed.
- **A stale `APPROVED` is retryable after 2 minutes.**

## Acceptance

1. Clicking the button for a `NONE` candidate creates exactly one `invitations` row and ends at `SENT`, with `message_id` starting `outbox:`.
2. Clicking again, or two clicks at once, sends nothing more and creates no second row.
3. The field starts with the address from the resume; a corrected address is the one stored in `sent_to`, and `candidates.email` is unchanged.
4. An empty or invalid address cannot be submitted: the button is disabled, and the route answers 400.
5. A send failure ends at `FAILED` with the error recorded, and "Try again" can then succeed using the same row.
6. An `APPROVED` row younger than 2 minutes answers 409; older than 2 minutes it can be retried.
7. Signed out returns 401, cross-site 403, an unknown candidate 404.
8. `approved_by` holds the id of the recruiter who clicked.
9. A `SENT` candidate shows the address, the date and the email text, and has no button.
10. No test sends real email. The send function is the only place a provider could be called.
11. `docs/BACKEND.md` lists the route and the `email_failed` error code; `npm run docs:check` passes.
