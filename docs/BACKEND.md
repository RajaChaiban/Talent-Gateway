# BACKEND.md — server-side design

Everything that runs on the server for this app. Today that is sign-in with Supabase Auth, the protected `/app` area, the jobs list, creating a job, and the job page with its threshold editor and `PATCH /api/jobs/[id]`. There are no model calls, no workflows and no screening pipeline yet; those sections stay empty until the feature that fills them is merged.

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
| `/app/jobs/[id]` | Partial prerender: static header and frame, the job streamed per request; the threshold editor is a client component that saves through `PATCH /api/jobs/[id]` | The session cookies, then one `jobs` row and the job's resume count |
| `/api/jobs/[id]` | Dynamic route handler | The session cookies, then an update of one `jobs` row |
| `/auth/signed-out` | Dynamic route handler | The session cookies |

Data access lives in `src/lib/<feature>/queries.ts`. A query takes the caller's Supabase client instead of creating one, so the page decides whose access rules apply. `listJobs` reads the newest 100 jobs with `resumes(count)` in the same query, and leaves the description out because the list never shows it. The job page reads the job with `getJob` and its resume count with `countResumes` (a head-only count) in parallel; an id that is not a UUID, or a job the recruiter cannot see, renders the `/app` not-found page. A failed database call throws `JobsDataError`, which the `/app` error boundary turns into a retryable message and a route handler turns into a 500 with a safe message.

The threshold editor on the job page saves each slider when it is released (a run of arrow-key presses waits 500 ms and sends only its last value). Saves for one field go one at a time, last choice wins; a failed save puts the slider back to the stored value and says so beside it.

Writes go through server actions. `createJobAction` parses the form with `createJobSchema` (`src/lib/jobs/schemas.ts`) before it touches the database: the two thresholds arrive on the 0.0 to 10.0 scale and are stored as whole tenths (8.5 is saved as 85), and a value with more than one decimal is rejected, not rounded. When the save fails, the action logs the Postgres error code only and returns the typed text, so nothing the recruiter wrote is lost.

## 2. Project layout

Only the folders the check tracks (`src/lib` and `src/app/api`) are listed. The request proxy is `src/proxy.ts`. The JSON error shape (`http.ts`) and the same-origin check (`http-origin.ts`) sit directly in `src/lib`.

```
src/
  app/
    api/
      jobs/                       `[id]/route.ts`: PATCH a job's thresholds
  lib/
    auth/                         sign-in input checks and error messages, the safe redirect path, the proxy rule (`route-access.ts`), the page guard (`require-signed-in-user.ts`), the route-handler guard (`require-user.ts`) and the one place that asks Supabase who is signed in (`verified-user.ts`)
    jobs/                         job queries that take the caller's client (`queries.ts`, `resume-count.ts`), input schemas (`schemas.ts`), row types with scores marked as stored tenths (`types.ts`), the API body on the 0 to 10 scale (`serialize.ts`), route-handler responses (`api.ts`), the threshold editor's save sequencer and commit scheduler, and date and count labels (`helpers.ts`)
    supabase/                     the server Supabase client (`server.ts`), the check of its two public variables (`public-env.ts`) and the database types generated from the hosted schema (`database.types.ts`)
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

### Server actions

| Action | File | Auth | Input | Does | Returns |
|---|---|---|---|---|---|
| `signIn` | `src/app/login/actions.ts` | Public | Form fields `email`, `password`, `next` | Checks the input, signs in with Supabase Auth, then redirects to `next` | Field errors or one form error; redirects on success |
| `signOut` | `src/app/app/actions.ts` | Session | None | Ends this browser's session | Redirects to `/` |
| `createJobAction` | `src/app/app/jobs/new/actions.ts` | Session | Form fields `title`, `description`, `top_talent_threshold`, `invite_threshold` (0.0 to 10.0) | Checks the input and inserts the job | Field errors or one form error with the typed values kept; redirects to `/app/jobs/[id]` on success |

## 5. Model calls

None yet. When the first model call is added, its slug goes in an `AI_MODELS` object in `src/lib/config.ts`, and each key (`AI_MODELS.<key>`) and its model string is named here.

## 6. Workflows

None yet.

## 7. Screening pipeline

None yet.

## 8. Environment variables

Set in `.env.local` for local work (git-ignored) and in the Vercel project for deployments. There is no `.env.example`, because `.gitignore` excludes every `.env*` file; this table is the list.

| Name | Scope | Source |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser and server | The Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser and server | The Supabase anon key. Public by design: row-level security decides what it can read |

## 9. Errors and limits

Every route handler error has the body `{ "error": { "code": ..., "message": ... } }` (`jsonError` in `src/lib/http.ts`). Messages are safe to show: a database error is logged by its Postgres code only (`logServerError`) and never sent.

| Code | Status | When |
|---|---|---|
| `invalid_input` | 400 | The id is not a UUID, the body is not JSON, or a field fails its schema; the message names the field |
| `unauthorized` | 401 | No valid session |
| `forbidden` | 403 | A state-changing request that did not come from this app's own pages |
| `not_found` | 404 | No job with this id, or row-level security hides it |
| `server_error` | 500 | A database call failed |
| `auth_unavailable` | 503 | Supabase Auth could not answer; try again |

## 10. Testing

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest (`npm run test`) | Files named `*.test.ts` beside the code they test: sign-in checks, the proxy rule and matcher, the page guard, the route-handler guard, the same-origin check, the signed-out route, `PATCH /api/jobs/[id]` (401, 403, 400, 404, 500 and success), the threshold editor's save sequencer, commit scheduler and fetch helper, the env check, the jobs queries against a stand-in client, and `scripts/check-backend-doc.test.ts` (the document check itself). No test calls the network |
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
