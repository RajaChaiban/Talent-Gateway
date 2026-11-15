# BACKEND.md — server-side design

Everything that runs on the server for this app. Today that is sign-in with Supabase Auth, the protected `/app` area, the jobs list, creating a job, the job page with its threshold editor (`PATCH /api/jobs/[id]`) and its resume upload (`POST /api/resumes/sign`, `POST /api/resumes/[id]/complete`, `DELETE /api/resumes/[id]`), and the screening pipeline's route handlers (`POST /api/jobs/[id]/analyze`, `GET /api/jobs/[id]/progress`, `POST /api/resumes/[id]/analyze`, `POST /api/resumes/[id]/score-anyway`, section 7), which the job page's Analyze panel and "Score anyway" button call, and the invitation route (`POST /api/candidates/[id]/invite`, section 7), which the candidate detail's "Invite to interview" button calls. There are no workflows.

**This document describes the code on `main`.** Two rules keep it that way:

- A change to a route, server action, environment variable, model call, error code or `src/lib` folder updates this document in the same pull request. `npm run docs:check` (section 10) fails CI when one of those is added, renamed or removed and this document does not follow.
- Work that is decided but not merged is written only inside a **planned block**: the text between a line holding `<!-- planned:start -->` and a line holding `<!-- planned:end -->`. Nothing in a planned block exists on `main`. When the pull request merges, its text moves out of the block in that same pull request. There is no planned block today.

The section numbers are fixed: `npm run docs:check` finds sections 2, 4, 5, 8 and 9 by number. Fill a section in; do not renumber or remove it.

## 1. Shape of the backend

Next.js on Vercel, with Supabase (Postgres, Auth, Storage) as the system of record. The app holds the anon key only and acts as the signed-in recruiter, so row-level security in the database decides what every query returns.

| Route | Rendering | Reads |
|---|---|---|
| `/` | Static: prerendered at build time | Nothing per request |
| `/login` | Partial prerender: static card, the form streamed per request | The `next` query value |
| `/app` | Partial prerender: static header and frame, the account and the jobs list streamed per request | The session cookies, then `jobs` with a resume count per job |
| `/app/jobs/new` | Partial prerender: static frame, the form streamed per request | The session cookies |
| `/app/jobs/[id]` | Partial prerender: static header and frame, the job streamed per request (with a skeleton from `loading.tsx`); the server renders the header with the job's status badge and the description. The threshold editor, the resumes section, the Analyze panel and the candidates section (Ranked and Not ATS-ready tabs, with the invite panel in each candidate's detail) are client components that call the API routes below and refresh the page for new data | The session cookies, then one `jobs` row, the job's candidates each with its invitation (`sent_to`, `sent_at`, `approved_at`) embedded in the same query, the job's resumes (id, name, status, date and ATS columns, never the text) and the job's resumes as the selection rules see them (`loadWork`), for the count of resumes Analyze would send |
| `/api/jobs/[id]` | Dynamic route handler | The session cookies, then an update of one `jobs` row |
| `/api/resumes/sign` | Dynamic route handler | The session cookies, the job, the job's resume count; inserts one `resumes` row and creates a signed upload token |
| `/api/resumes/[id]/complete` | Dynamic route handler | The session cookies, one `resumes` row and its stored file; updates the row |
| `/api/resumes/[id]` | Dynamic route handler | The session cookies and one `resumes` row; deletes its stored file, then the row |
| `/api/jobs/[id]/analyze` | Dynamic route handler | The session cookies, one `jobs` row, the job's resumes and candidate ids; updates `resumes.status` and `jobs.status` |
| `/api/jobs/[id]/progress` | Dynamic route handler | The session cookies, one `jobs` row, the job's resumes and candidate ids; may update `jobs.status` |
| `/api/resumes/[id]/analyze`, `/api/resumes/[id]/score-anyway` | Dynamic route handler | The session cookies, one `resumes` row, its job, up to 8 other resumes' text; writes `resumes.ats_*` and `status`, one `candidates` row and `jobs.status`; up to two model calls |
| `/api/candidates/[id]/invite` | Dynamic route handler | The session cookies, one `candidates` row, its job's title and its `invitations` row; inserts or updates the invitation and updates `candidates.invite_status`; one call to the send function |
| `/auth/signed-out` | Dynamic route handler | The session cookies |

Data access lives in `src/lib/<feature>/queries.ts`. A query takes the caller's Supabase client instead of creating one, so the page decides whose access rules apply. `listJobs` reads the newest 100 jobs with `resumes(count)` in the same query, and leaves the description out because the list never shows it. The job page reads three things in parallel: `getJobPage` (`src/lib/jobs/queries.ts`: the job, then its candidates (each with its invitation, embedded through the unique `invitations.candidate_id`) and its resumes' ATS columns in parallel, turned by the pure helpers in `src/lib/jobs/helpers.ts` into the ranked candidates, best match first with Radar parsed (`radar.ts`), the set-aside and queued resumes, and the per-bucket counts), `listResumes` (`src/lib/resumes/queries.ts`; id, name, status and date, oldest first, never the text) for the resumes section, and `loadWork` (`src/lib/screening/queries.ts`) for the number of resumes that need work; an id that is not a UUID, or a job the recruiter cannot see, renders the `/app` not-found page. A failed database call throws `JobsDataError` (or `ResumesDataError` for the resumes queries), which the `/app` error boundary turns into a retryable message and a route handler turns into a 500 with a safe message.

Resume upload, on the job page. The recruiter drops or picks PDF and DOCX files; the browser checks each one (type by its declared type, or by its extension when the browser gives none; size; at most 20 per drop and 50 per job) and puts the accepted ones in a queue that runs three at a time. Each file then goes through three steps, and every step is safe to repeat:

1. **Sign.** `POST /api/resumes/sign` checks the job, the name, the type and the size, enforces the 50-per-job cap (counting again after the insert, so requests that arrive together cannot pass it), inserts a `pending` row and returns a signed upload token for `{job_id}/{resume_id}/{safe file name}` in the private `resumes` bucket. The browser chooses the resume id, so signing the same file again after a lost answer names the same row instead of making a second one.
2. **Upload.** The browser sends the file straight to Supabase Storage with that token (`src/lib/supabase/client.ts`, the anon key and the recruiter's session). The file never passes through a Vercel function on upload, so the 4.5 MB function body limit never applies and no function spends time relaying bytes. The bucket itself refuses any type other than PDF or DOCX and anything over 5 MB.
3. **Complete.** `POST /api/resumes/[id]/complete` is the only time the server touches the file: it downloads it with the recruiter's client, judges it by its bytes (a `%PDF-` header, or a zip holding `word/document.xml`), never by its name or declared type, and extracts its text: a PDF with `unpdf`, page by page; a DOCX by inflating its zip under caps (`zip-inflate.ts`) and handing only its XML parts to `mammoth`. The row becomes `extracted` with the text, or `failed` with a reason the recruiter can act on. Extraction is bounded: the 5 MB size, 40 PDF pages, 500 zip entries, 512 KB of DOCX markup and 8 MB inflated in all, and an 8-second deadline. A parser that never yields cannot be interrupted on the same thread; the caps are what bound it.

A failed step is retried with back-off when the failure is transient (a lost connection, 429, 500, 502, 503, 504, honouring `Retry-After`), up to five attempts; a refusal (a wrong type, a file too big, an unknown job, a full job) is final. Removing a resume deletes its stored file first and then its row, so a storage failure leaves a row the recruiter can still see and remove. Storage that answers with a 5xx, a timeout or a rate limit becomes 503 `storage_unavailable` with `Retry-After: 2`; any other storage error is a 500.

The threshold editor on the job page saves each slider when it is released (a run of arrow-key presses waits 500 ms and sends only its last value). Saves for one field go one at a time, last choice wins; a failed save puts the slider back to the stored value and says so beside it.

Writes go through server actions. `createJobAction` parses the form with `createJobSchema` (`src/lib/jobs/schemas.ts`) before it touches the database: the two thresholds arrive on the 0.0 to 10.0 scale and are stored as whole tenths (8.5 is saved as 85), and a value with more than one decimal is rejected, not rounded. When the save fails, the action logs the Postgres error code only and returns the typed text, so nothing the recruiter wrote is lost.

## 2. Project layout

Only the folders the check tracks (`src/lib` and `src/app/api`) are listed. The request proxy is `src/proxy.ts`. The JSON error shape (`http.ts`) and the same-origin check (`http-origin.ts`) sit directly in `src/lib`.

```
src/
  app/
    api/
      candidates/                 `[id]/invite/route.ts`: POST to invite a candidate to interview
      jobs/                       `[id]/route.ts`: PATCH a job's thresholds; `[id]/analyze/route.ts`: POST to start an analysis run; `[id]/progress/route.ts`: GET the run's counts and settle the job
      resumes/                    `sign/route.ts`: POST to reserve a row and get a signed upload token; `[id]/complete/route.ts`: POST to read the uploaded file's text; `[id]/route.ts`: DELETE a resume and its file; `[id]/analyze/route.ts`: POST to screen one resume; `[id]/score-anyway/route.ts`: POST to override the ATS gate and screen it
  lib/
    ai/                           the model calls: `scoreResume` and `runRadar`, their prompts and output schemas, the shared structured-output call (`generate.ts`), the model resolver and test stand-in (`model.ts`, `fake-model.ts`) and the rate-limit error (`errors.ts`)
    ats/                          the rule-based pre-screen: `checkAts` (`check-ats.ts`) and its text scan, heading finder, email finder, reasons and config check; `to-columns.ts` turns a result into `resumes` columns
    auth/                         sign-in input checks and error messages, the safe redirect path, the proxy rule (`route-access.ts`), the page guard (`require-signed-in-user.ts`), the route-handler guard (`require-user.ts`) and the one place that asks Supabase who is signed in (`verified-user.ts`)
    invitations/                  inviting a candidate: the orchestration with the exactly-once rules (`invite.ts`), its queries (`queries.ts`), the one send function, a stand-in outbox for now (`send.ts`), the pure email builder (`message.ts`), the status rules (`status.ts`), the body and id schemas (`schemas.ts`) and the route's responses (`api.ts`)
    jobs/                         job queries that take the caller's client (`queries.ts`), input schemas (`schemas.ts`), job and candidate row types with scores marked as stored tenths (`types.ts`), the API body on the 0 to 10 scale (`serialize.ts`), route-handler responses (`api.ts`), the threshold editor's save sequencer and commit scheduler, the job page's ranking, selection and count rules and the date and count labels (`helpers.ts`), and the safe read of the stored Radar results (`radar.ts`)
    resumes/                      resume upload: queries and storage calls that take the caller's client (`queries.ts`), the sign body schema (`schemas.ts`), file names, types and storage paths (`files.ts`, `bucket.ts`), the real-type check (`sniff.ts`), text extraction (`extract-text.ts`, `zip-inflate.ts`), the complete step (`complete.ts`), route-handler responses (`api.ts`), messages and row types, and the browser side: the drop check (`drop.ts`), the upload queue and its worker (`upload-queue.ts`, `upload-pipeline.ts`), the fetch and storage helpers (`client-api.ts`), the remove verdict (`removal.ts`) and the stored status label (`saved-status.ts`)
    screening/                    the screening pipeline for one resume and the only caller of the model calls (`analyze.ts`), its queries (`queries.ts`), the pure selection, progress and settle rules (`work.ts`), the file facts for the ATS check (`file-facts.ts`), the routes' responses and job settling (`api.ts`), and the browser side of a run: the fetch helpers (`analyze-client.ts`), the analyze queue (`analyze-queue.ts`) and a small throttle (`throttle.ts`)
    supabase/                     the server Supabase client (`server.ts`), the browser client used only for direct uploads to Storage (`client.ts`), the check of its two public variables (`public-env.ts`) and the database types generated from the hosted schema (`database.types.ts`)
```

## 3. Auth and access

Supabase Auth, email and password. Sign-ups are disabled on the Supabase project, so only the demo user can sign in. The session lives in cookies set by the server client.

- `/login` is the only page that signs people in. `/` is public. Everything under `/app` needs a signed-in user.
- Two checks protect `/app`. The proxy (`src/proxy.ts`, on `/app/**` and `/login`) refreshes the session and redirects page navigations: signed out on `/app` goes to `/login?next=...`, signed in on `/login` goes on to `next`. Then every `/app` page calls `requireSignedInUser()` itself, because the proxy is only a first check and a layout does not gate its pages.
- API routes (`/api/**`) are also in the proxy matcher, so a `fetch` from the app refreshes the session, but the proxy never redirects them. Each route handler calls `requireUser()`, which asks Supabase Auth and answers JSON instead of redirecting: 401 `unauthorized` when signed out, 503 `auth_unavailable` when Supabase Auth cannot answer. A handler that changes data then calls `requireSameOrigin()`, which refuses with 403 `forbidden` any request not sent by this app's own pages (`Sec-Fetch-Site: same-origin`, or an `Origin` equal to the request's own scheme and host), so another site cannot use the recruiter's cookies to change data.
- When Supabase rejects a session that the cookie still claims, the page redirects to `/auth/signed-out`, which clears the cookies so the proxy cannot bounce the browser back. When Supabase Auth cannot answer at all, the page shows a retryable error instead of signing the user out.
- Sign-out ends only this browser's session (`scope: "local"`), because the demo login is shared.
- Who is signed in is always asked from Supabase (`auth.getUser()`), never read from the unverified cookie.
- After sign-in the browser goes to the `next` path, which is accepted only when it is a path on this site; anything else becomes `/app`.
- A failed sign-in says "Email or password is incorrect", never which of the two was wrong.

## 4. API contract

One row per method and path.

| Method | Path | Auth | Input | Does | Returns |
|---|---|---|---|---|---|
| GET | `/auth/signed-out` | Public | Query `next` (optional) | Clears the Supabase session cookies with no network call. `maxDuration` 5 | 303 redirect to `/login?next=...` |
| PATCH | `/api/jobs/[id]` | Session, same origin | JSON `{ top_talent_threshold?, invite_threshold? }`, at least one, each a number from 0 to 10 with at most one decimal | Checks the user, then the origin, then the input, then updates the job's thresholds (stored as tenths). `maxDuration` 10 | 200 `{ data: job }` with scores on the 0 to 10 scale; 400, 401, 403, 404, 500 or 503 `{ error: { code, message } }` |
| POST | `/api/resumes/sign` | Session, same origin | JSON `{ resume_id?, job_id, file_name, content_type, size }`: `resume_id` a UUID the browser chose, `file_name` at most 255 characters after cleaning and ending in the type's extension, `content_type` PDF or DOCX, `size` at most 5 MB | Checks the user, the origin and the input; a known `resume_id` for the same job and name gets a fresh token for its row. Otherwise checks the job and the 50-per-job cap, creates a signed upload token and inserts a `pending` row. `maxDuration` 30 | 201 (new row) or 200 (same row again) `{ data: { resume_id, path, token } }`; 400, 401, 403, 404 (job), 409 `conflict` (job full, or the id is used for another file), 413, 415, 500 or 503 |
| POST | `/api/resumes/[id]/complete` | Session, same origin | Query `retry=1` (optional) to judge a failed file again | Downloads the stored file, checks its real type and extracts its text; sets `extracted_text` and `status` (`extracted` or `failed`). A resume whose text is stored, or a failed one without `retry`, is answered as stored without a download. `maxDuration` 30 | 200 `{ data: { resume_id, status, characters, message? } }` (`message` when failed); 400, 401, 403, 404, 409 `conflict` (the file is not in storage yet), 500 or 503 |
| DELETE | `/api/resumes/[id]` | Session, same origin | None | Deletes the stored file, then the row. `maxDuration` 30 | 200 `{ data: { resume_id, removed: true } }`; 400, 401, 403, 404, 500 or 503 |
| POST | `/api/jobs/[id]/analyze` | Session, same origin | None | Starts an analysis run: lists the job's resumes that need work (text, no candidate, and not checked, ATS-ready or overridden), oldest first; puts earlier analysis failures among them back to `extracted`; sets the job to `ANALYZING`, or `DONE` when there is nothing to do. Makes no model call and starts nothing: the browser calls the per-resume route for each id. `maxDuration` 30 | 200 `{ data: { resume_ids } }`; 400, 401, 403, 404, 500 or 503 |
| GET | `/api/jobs/[id]/progress` | Session | None | Counts the job's resumes from the rows and settles a job in `ANALYZING` that has nothing left (section 7). `maxDuration` 30 | 200 `{ data: { total, extracted, ats_failed, scored, failed, remaining, status } }`; 400, 401, 404, 500 or 503 |
| POST | `/api/resumes/[id]/analyze` | Session, same origin | None | Runs the screening pipeline for one resume (section 7), then settles its job. Repeating it is safe. `maxDuration` 60 | 200 `{ data: { resume_id, status } }`, `status` one of `scored`, `ats_failed`, `not_extracted`, `failed`; 400, 401, 403, 404, 500, or 503 (`model_busy` with `Retry-After`, or `auth_unavailable`) |
| POST | `/api/candidates/[id]/invite` | Session, same origin | JSON `{ email }`: a valid address, at most 254 characters after trimming | The recruiter's approval (section 7, "Invitations"): checks the user, the origin, the id, the address and the candidate, then records the invitation (`approved_by` the signed-in user, `sent_to` the address) and sends it once through the send function. A candidate already invited is answered as stored, with no send, whatever address is sent. `maxDuration` 30 | 200 `{ data: { candidate_id, invite_status, sent_to, sent_at } }`; 400, 401, 403, 404, 409 `conflict` (a send is in progress), 502 `email_failed` (the send failed; the status is now `FAILED`), 500 or 503 |
| POST | `/api/resumes/[id]/score-anyway` | Session, same origin | None | The recruiter's override of the ATS gate. Only for a resume the check set aside (`ats_status = 'NOT_ATS_READY'`) that has no candidate: sets `ats_override` in one guarded write, sets the job to `ANALYZING`, runs the pipeline, then settles the job. `maxDuration` 60 | 200 `{ data: { resume_id, ats_override: true, status } }`; 400, 401, 403, 404, 409 `conflict` (already scored, or not set aside; no write, no model call), 500, or 503 (`model_busy` or `auth_unavailable`) |

### Server actions

| Action | File | Auth | Input | Does | Returns |
|---|---|---|---|---|---|
| `signIn` | `src/app/login/actions.ts` | Public | Form fields `email`, `password`, `next` | Checks the input, signs in with Supabase Auth, then redirects to `next` | Field errors or one form error; redirects on success |
| `signOut` | `src/app/app/actions.ts` | Session | None | Ends this browser's session | Redirects to `/` |
| `createJobAction` | `src/app/app/jobs/new/actions.ts` | Session | Form fields `title`, `description`, `top_talent_threshold`, `invite_threshold` (0.0 to 10.0) | Checks the input and inserts the job | Field errors or one form error with the typed values kept; redirects to `/app/jobs/[id]` on success |

## 5. Model calls

Two calls, both through the AI SDK to Vercel AI Gateway. Only the screening pipeline (`analyzeResume`, section 7) calls them, in parallel, for a resume that passed or was overridden past the ATS gate.

| Key | Model | Function | Returns |
|---|---|---|---|
| `AI_MODELS.scoring` | `anthropic/claude-haiku-5.5` | `scoreResume` (`src/lib/ai/score-resume.ts`) | Candidate name, match score, summary, strengths, gaps |
| `AI_MODELS.radar` | `anthropic/claude-haiku-5.5` | `runRadar` (`src/lib/ai/run-radar.ts`) | Four risk flags, each with a one-line note: copied text, employment gaps, job hopping, AI-written padding |

- **Gateway and credentials.** A model is a plain `provider/model` string from `AI_MODELS` in `src/lib/config.ts`, which the AI SDK sends to AI Gateway. The gateway is authenticated by the project's OIDC token (`VERCEL_OIDC_TOKEN`, supplied by Vercel at run time and by `vercel env pull` locally), so the app holds no provider key. Changing a model or a provider is a one-line config change.
- **Structured output.** Both calls go through `generateStructured` (`src/lib/ai/generate.ts`): `generateText` with `Output.object({ schema })`, so the answer is parsed against a Zod schema (`src/lib/ai/schemas.ts`) and never read as free text. An answer that does not parse is retried once; a second failure fails that resume instead of guessing.
- **Limits (`SCREENING_AI_LIMITS`).** One call, with its parse retry and the SDK's one transport retry, shares a single 25 second abort budget. The job description is cut at 8,000 characters and the resume at 12,000 before sending, and Radar compares at most 8 other resumes as 600-character excerpts, so the cost of a call is bounded whatever was uploaded.
- **Rate limits.** A 429 from the gateway becomes `ModelBusyError` with the seconds to wait. It is retryable: the resume is not marked failed, and the route answers 503 `model_busy` with `Retry-After`.
- **Prompts.** The resume and the job description are sent as clearly delimited sections and the instructions tell the model to treat them as data, so text inside a resume cannot act as an instruction. Radar excerpts leave out the header lines of other resumes, so one candidate's contact details are not sent with another's.
- **Tests never call a model.** Unit tests use the AI SDK's mock model. For browser tests, `E2E_FAKE_MODEL=1` makes `resolveModel` return a local stand-in, and it is refused on any Vercel deployment (`standInAllowed`), so production can only ever use the real gateway model.

## 6. Workflows

None yet.

## 7. Screening pipeline

One resume at a time, through `analyzeResume` (`src/lib/screening/analyze.ts`), which `POST /api/resumes/[id]/analyze` and `POST /api/resumes/[id]/score-anyway` call. It is the only module that imports `scoreResume` and `runRadar`; `src/lib/screening/boundary.test.ts` fails if anything else does, so no caller can reach a model without the ATS gate running first. Everything runs with the recruiter's client, so row-level security applies.

1. **Load.** The resume and its job; an unknown id is a 404.
2. **Already scored.** A resume that has a candidate row answers `scored` with no model call and no write. This is what makes a repeated run cost nothing.
3. **No text.** A resume without extracted text (still uploading, or its upload failed) answers `not_extracted` and is not touched.
4. **ATS gate.** `checkAts` (below) runs on the text and the file facts (the type from the file name's extension; the upload already checked the real type), and the result is saved to `resumes.ats_status`, `ats_score` and `ats_reasons` before any model call. The gate is read back from the saved row: `NOT_ATS_READY` without `ats_override` answers `ats_failed` and makes **zero** model calls.
5. **Model calls.** `scoreResume` and `runRadar` run in parallel (Radar gets up to 8 of the job's other resumes with text, oldest first, as excerpts for the copycat check). When one fails the other is aborted.
6. **Save.** One `candidates` row: the name (the file name without its extension when the model gives none), the match score in tenths, summary, strengths, gaps, Radar results, the first email address in the resume text (lower case; null when there is none) and `invite_status = 'NONE'` whatever the score. Only a recruiter's click invites anyone. The insert is an upsert on `(job_id, resume_id)` that does nothing on conflict, and a clash on the unique `resume_id` is treated the same way, so two simultaneous calls for one resume make one candidate and both answer `scored`.

**Failures.** A model error (an answer that fails its schema twice, a gateway error) is logged once without resume text and marks the resume `status = 'failed'` with its text kept, which is how an analysis failure differs from an upload failure; the route still answers 200 with `status: "failed"`, so the browser's queue moves on, and the next run retries it. A resume that has a candidate is never left failed, whatever order two racing calls finish in. A **429 from the gateway** is not a failure: it throws `ModelBusyError`, nothing is written, and the route answers 503 `model_busy` with `Retry-After` so the browser tries that resume again later. A database failure is a 500.

**A run and the job's status.** `POST /api/jobs/[id]/analyze` lists the resumes that need work, puts earlier analysis failures among them back to `extracted`, and sets the job to `ANALYZING` (`DONE` when the list is empty). The browser then calls the per-resume route for each id, one request per resume, so each function stays short (at most two parallel model calls with a 25 second budget each, inside a 60 second `maxDuration`). After every per-resume call, and on every `GET /api/jobs/[id]/progress`, the job is settled from its rows (`settledStatus` in `work.ts`): a job in `ANALYZING` with nothing remaining becomes `DONE`, or `ERROR` when every resume with text failed. Because the status is derived from what is saved, a run the browser abandoned, a retried call or calls finishing out of order still end in the right state. "Score anyway" sets the job back to `ANALYZING` before it runs and settles it after.

Re-running a job whose resumes are all scored or set aside lists nothing, makes no model call and creates no row.

**The browser's side of a run (the Analyze panel).** The job page's Analyze panel (`src/app/app/jobs/[id]/analyze-panel.tsx`) calls `POST /api/jobs/[id]/analyze`, then hands the returned ids to the analyze queue (`src/lib/screening/analyze-queue.ts`, a pure module with no DOM or React). The queue keeps at most `ANALYZE_QUEUE_LIMITS.concurrency` (3) per-resume requests in flight; a 429, a 503 (`model_busy`) or a network failure is retried up to `maxAttempts` (5) times, waiting the `Retry-After` value when the server sends one and otherwise an exponential back-off from 1 second with jitter, never more than 30 seconds; any other error fails that resume without a retry, and `failed` from the route counts as failed. Leaving the page stops the queue and aborts the requests in flight. While it runs, the progress bar reads `GET /api/jobs/[id]/progress` at most every 500 ms and the page refreshes at most every 2 seconds, so new candidates appear as they are scored; the bar shows the server's counts, not the queue's tally. "Retry failed" sends the failed ones again. Opening a job still in `ANALYZING` (a run whose tab was closed) reads progress once, which settles the job if nothing remains. The "Not ATS-ready" tab lists each set-aside resume with its ATS score and reasons, and its "Score anyway" button calls `POST /api/resumes/[id]/score-anyway` (`score-anyway-client.ts` turns the answer into a message); an overridden resume that still has no score is listed under "Queued for scoring" on the Ranked tab.

**Invitations.** Nothing invites a candidate automatically: a score above the invite bar only highlights who to review. In the candidate detail on the job page, the invite panel (`src/app/app/jobs/[id]/invite-panel.tsx`, a client component) shows an email field filled in with the address read from the resume, which the recruiter can correct because the first address in a resume can be a referee's. Clicking "Invite to interview" calls `POST /api/candidates/[id]/invite` (`invite-client.ts` turns the answer into a message) and refreshes the page; the click is the approval. `inviteCandidate` (`src/lib/invitations/invite.ts`) inserts the `invitations` row (`approved_by`, `approved_at`, `sent_to`), sets `candidates.invite_status` to `APPROVED`, sends, then records `sent_at` and `message_id` with `SENT`, or `error` with `FAILED`. `candidates.email` is never changed; `sent_to` records the address used. The email must go out at most once:

- `unique (candidate_id)` makes the insert the lock: of two simultaneous clicks only one inserts, and the other does not send.
- A row with `sent_at` is never sent again; the route answers 200 with the stored state, ignoring the address in the body.
- "Try again" is accepted for `FAILED`, or for `APPROVED` older than 2 minutes (`INVITE_LIMITS.staleApprovalMs`), a send whose request died part-way; the route's 30-second `maxDuration` means no request can still be sending by then. The retry claims the same row in one guarded write (new approval, corrected address, error cleared), so two retries at once send once.
- `APPROVED` younger than 2 minutes is a send in progress: 409, no send.
- The invitation row is written before the candidate's status at each step, so the row decides what happens next.

All delivery goes through `sendInvitationEmail` (`src/lib/invitations/send.ts`), which takes the recipient, subject, text and the invitation id as an idempotency key. In this version it is a stand-in outbox: it delivers nothing and returns `outbox:<invitation id>`, so no test or demo can mail a real person, and the candidate detail shows the email that was produced, rebuilt by the same pure function (`message.ts`) from the candidate's name and the job title. A real provider replaces the body of that one function. The send runs inside the request; there is no workflow, and the 2-minute rule covers a request that died between approval and send.

**Pre-screen (`checkAts`, `src/lib/ats/check-ats.ts`).** A pure function over a resume's extracted text and its file facts. It calls no model and no network, so a resume it sets aside costs nothing. Every threshold and weight comes from `ATS_CONFIG` in `src/lib/config.ts`, which is validated before use (an invalid config throws an error naming the field).

| Check | Passes when |
|---|---|
| `readable_text` | The text has at least the configured number of readable characters (a scan or a broken file fails here) |
| `contact_info` | An email address is found |
| `standard_sections` | Enough of the standard section headings appear |
| `layout_noise` | The share of stray symbols in the text is under the limit |
| `file` | The file is a supported type and an acceptable size |

Every check always runs. The result is `ATS_READY` only when every required check passes and the weighted score reaches the pass score (6.0); otherwise it is `NOT_ATS_READY` with one plain-language reason per failed check. The score is stored in tenths like every other score.

## 8. Environment variables

Set in `.env.local` for local work (git-ignored) and in the Vercel project for deployments. There is no `.env.example`, because `.gitignore` excludes every `.env*` file; this table is the list.

| Name | Scope | Source |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser and server | The Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser and server | The Supabase anon key. Public by design: row-level security decides what it can read |
| `VERCEL_OIDC_TOKEN` | server | Issued by Vercel. Authenticates model calls to AI Gateway. Set automatically on deployments; `vercel env pull` writes a short-lived copy to `.env.local` |
| `E2E_FAKE_MODEL` | tests | `1` swaps the model for a local stand-in in browser tests. Ignored on every Vercel deployment |

## 9. Errors and limits

Every route handler error has the body `{ "error": { "code": ..., "message": ... } }` (`jsonError` in `src/lib/http.ts`). Messages are safe to show: a database error is logged by its Postgres code only (`logServerError`) and never sent.

| Code | Status | When |
|---|---|---|
| `invalid_input` | 400 | The id is not a UUID, the body is not JSON, or a field fails its schema; the message names the field |
| `unauthorized` | 401 | No valid session |
| `forbidden` | 403 | A state-changing request that did not come from this app's own pages |
| `not_found` | 404 | No job, resume or candidate with this id, or row-level security hides it |
| `conflict` | 409 | The job already holds 50 resumes; a resume id is already used for a different file; the file to complete is not in storage yet; "Score anyway" was asked for a resume that is already scored or was not set aside; or an invitation for the candidate is being sent right now |
| `payload_too_large` | 413 | The declared file size is over 5 MB |
| `unsupported_media_type` | 415 | The declared file type is not PDF or DOCX |
| `email_failed` | 502 | The send function failed for an invitation; the error is recorded on the invitation, the candidate is `FAILED`, and "Try again" reuses the same row |
| `server_error` | 500 | A database call failed, or storage refused a call for a reason other than being busy |
| `auth_unavailable` | 503 | Supabase Auth could not answer; try again |
| `storage_unavailable` | 503 | Supabase Storage could not be reached, timed out, was rate limited or answered with a 5xx; sent with `Retry-After: 2` |
| `model_busy` | 503 | AI Gateway rate-limited a model call; sent with `Retry-After` (the gateway's value, 1 to 60 seconds, 5 when it gives none). The resume is not marked failed |

A file the server could read but not accept (empty, not really a PDF or DOCX, a Word file named `.pdf` or the other way round, damaged, password-protected, over a size, page or markup cap, or past the 8-second read deadline) is not an error response: `complete` answers 200 with `status: "failed"` and a message, and the row is saved as `failed`.

## 10. Testing

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest (`npm run test`) | Files named `*.test.ts` beside the code they test: sign-in checks, the proxy rule and matcher, the page guard, the route-handler guard, the same-origin check, the signed-out route, `PATCH /api/jobs/[id]` (401, 403, 400, 404, 500 and success), the threshold editor's save sequencer, commit scheduler and fetch helper, the env check, the jobs queries against a stand-in client, the three resume routes (401, 503, 403, 400, 404, 409, 413, 415, 500, storage 503 and success, the per-job cap under concurrent requests, a repeated sign), the resumes queries, text extraction from generated PDF and DOCX fixtures (`test/fixtures.ts`) including oversized, mistyped, damaged and slow files, the real-type check, the zip reader's limits, the drop check, the upload queue (concurrency, back-off, retry, stop) and its worker, the browser fetch and storage helpers against stand-ins, the screening pipeline against an in-memory database that enforces the unique constraints (`test/fake-supabase.ts`) and the AI SDK's mock model (`test/screening-harness.ts`): a `NOT_ATS_READY` resume makes zero model calls, an overridden one is scored, a re-run makes no model call and no row, two simultaneous calls make one candidate, the candidate is saved as `NONE` with its email, failures racing a success, a 429 as `model_busy` without failing the resume, and the job settling to `DONE` or `ERROR`; the selection and progress rules (`work.ts`); the browser side of a run: the analyze queue (concurrency, back-off with `Retry-After`, retry, stop), its fetch helpers, the throttle, the Analyze panel's states rendered to markup and the settle-on-open rule, and the score-anyway messages; the job page's ranking, selection and count rules and the Radar parsing; the boundary check that only the pipeline imports the model calls; the four screening routes (401, 403, 400, 404, 409, 500, 503 and success); invitations against the in-memory database (`invitations` with its unique `candidate_id`): one row and one send for a first click, a second click and two or five simultaneous clicks, a corrected address kept in `sent_to` with `candidates.email` unchanged, `approved_by`, a failed send recorded and retried on the same row, two simultaneous retries sending once, a recent `APPROVED` as in progress and a stale one retried; the email builder, the address schema, the status rules, the stand-in outbox and the check that only `invite.ts` imports it; the invite route (401, 503, 403, 400, 404, 409, 502, 500 and success); its fetch helper and the invite panel's four states rendered to markup; the job page query embedding each candidate's invitation; and `scripts/check-backend-doc.test.ts` (the document check itself). No test calls the network |
| Document | `npm run docs:check` | This document names every route, server action, environment variable, `src/lib` and `src/app/api` folder, model and error code |
| Design | `npm run design:contrast` | Every color pair in `src/app/globals.css` meets WCAG AA in both themes |

CI (`.github/workflows/ci.yml`, on every pull request and on pushes to `main`) runs `npm ci`, `npm run lint`, `npm run docs:check`, `npm run typecheck`, `npm run test`, `npm run design:contrast` and `npm run build`.

### Document check (`npm run docs:check`)

`scripts/check-backend-doc.mjs` reads the source tree and this document, with no network and no dependencies, and exits non-zero with one line per problem (each with a "Fix:" hint). It fails when:

| | Source | Must be in this document |
|---|---|---|
| a | Every HTTP method exported by a `route.ts` under `src/app` | A row with that method and path in the section 4 table. A row for a route that does not exist also fails |
| b | Every function exported by a file that starts with `"use server"` | Its name, anywhere outside a planned block |
| c | Every variable in the `src/lib/env.ts` schema and in `.env.example` | Its name in section 8. A name in the section 8 table that nothing defines or reads also fails |
| d | Every folder directly under `src/lib` and `src/app/api` | A line in the section 2 tree. A tree line whose path does not exist also fails |
| e | Every key of `AI_MODELS` in `src/lib/config.ts` and its model string | `AI_MODELS.<key>` and the string in section 5. Skipped while there is no `AI_MODELS` object |
| f | Every member of an exported `...ErrorCode...` union or `...ERROR_CODES...` list under `src/` | The code in backticks in section 9 |
| g | A route's `maxDuration` | Equal to the number after `maxDuration` in its section 4 row, when the row states one |

**What it cannot do.** The check only proves that a thing is *named* in the right section. It does not read the prose, so a wrong description of a route still passes. Keeping the prose right is the job of the author and the reviewer of each pull request.
