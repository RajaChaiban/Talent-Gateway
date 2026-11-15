# BACKEND.md — server-side design

Everything that runs on the server for this app. **Today that is nothing:** the app is one static landing page. There are no route handlers, no server actions, no database, no sign-in, no model calls and no environment variables. Each section below is empty until the feature that fills it is merged.

**This document describes the code on `main`.** Two rules keep it that way:

- A change to a route, server action, environment variable, model call, error code or `src/lib` folder updates this document in the same pull request. `npm run docs:check` (section 10) fails CI when one of those is added, renamed or removed and this document does not follow.
- Work that is decided but not merged is written only inside a **planned block**: the text between a line holding `<!-- planned:start -->` and a line holding `<!-- planned:end -->`. Nothing in a planned block exists on `main`. When the pull request merges, its text moves out of the block in that same pull request. There is no planned block today.

The section numbers are fixed: `npm run docs:check` finds sections 2, 4, 5, 8 and 9 by number. Fill a section in; do not renumber or remove it.

## 1. Shape of the backend

None yet. The landing page (`/`) is prerendered at build time and reads no request data.

## 2. Project layout

Only the folders the check tracks (`src/lib` and `src/app/api`) are listed. `src/app/api` does not exist yet.

```
src/
  lib/
    jobs/                         pure helpers for the landing page's product preview (`helpers.ts`, `radar.ts`); no data access
```

## 3. Auth and access

None yet. Every page is public.

## 4. API contract

No route handlers and no server actions yet. Add one row per method and path when the first route is merged.

| Method | Path | Auth | Input | Does | Returns |
|---|---|---|---|---|---|

## 5. Model calls

None yet. When the first model call is added, its slug goes in an `AI_MODELS` object in `src/lib/config.ts`, and each key (`AI_MODELS.<key>`) and its model string is named here.

## 6. Speech-to-text

None yet.

## 7. Screening pipeline

None yet.

## 8. Environment variables

None yet. The app reads no environment variable and there is no `.env.example`.

| Name | Scope | Source |
|---|---|---|

## 9. Errors and limits

No error codes yet. When route handlers exist, each code of an exported `...ErrorCode` union or `...ERROR_CODES` list is listed here in backticks with its status.

## 10. Testing

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest (`npm run test`) | `scripts/check-backend-doc.test.ts`: the document check itself, against small fixture trees and against this repository |
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
