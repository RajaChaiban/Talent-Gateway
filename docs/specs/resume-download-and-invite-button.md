# Spec: download a resume, and an invite button on each candidate row

Status: agreed, being built.

## Why

Two gaps found while trying the job page:

- A recruiter could upload a resume but never get the file back, so there was no way to read the original next to its score.
- "Invite to interview" lived only inside the expanded candidate detail. The owner looked for it on the ranked list and could not find it.

## What the recruiter sees

**Download**

| Where | What is shown |
|---|---|
| Resumes section, each stored row | A **Download** button next to **Remove**, same style and size. Not shown for a row whose upload never finished (status `pending`) |
| Candidate detail | The line "Resume file: `<name>`" is a link that downloads the file |
| Not ATS-ready tab, each set-aside resume | A **Download** button next to **Score anyway** |

Each control's accessible name is "Download `<file name>`". The browser saves the file under the name it was uploaded with.

**Invite button on the row**

| Candidate's `invite_status` | Row header shows |
|---|---|
| `NONE`, `APPROVED` | An **Invite to interview** button |
| `FAILED` | A **Try again** button |
| `SENT` | The existing "Invited" badge and no button |

The button sits beside the expand trigger, on the right on desktop, and wraps under the name at 390 px with no horizontal scroll.

Clicking it sends nothing. It opens that candidate's detail (if it is closed), scrolls the "Candidate email" field into view and moves focus to it. The recruiter checks the address and then clicks the panel's own **Invite to interview** (or **Try again**) button, which stays the only approval.

## Flow: download

1. The link points at `GET /api/resumes/[id]/file`.
2. The route checks, in this order: signed in (401), a valid resume id (400), the row exists for this recruiter (404). The row is read with the recruiter's own client, so row-level security decides who may download. It is a read, so there is no same-origin check.
3. It asks Storage for a signed link to the stored file in the private `resumes` bucket, valid for 60 seconds, with the `download` option set to the row's `file_name`.
4. It answers 303 to that link with `Cache-Control: no-store`. The bytes come from Storage; they never pass through a function.

A missing object is a 404. Storage that is down or rate limited is a 503 with `Retry-After`; any other storage error is a 500. These are the same mappings the other resume routes use.

## Which rows have a file

`extracted` and `failed` are only written after the server read the file back from Storage, so both have a file. A `pending` row is an upload that may never have arrived, so it shows no link. The rule is one function, `hasStoredFile` in `src/lib/resumes/saved-status.ts`.

## Where the code is

- `src/app/api/resumes/[id]/file/route.ts` and its tests.
- `createSignedDownload` in `src/lib/resumes/queries.ts`, which takes the caller's client like its neighbours.
- `src/app/app/jobs/[id]/candidate-row.tsx`: the header is a row of two siblings, the expand trigger and the invite button, because a button cannot sit inside another.
- The open row is the `?candidate=` query parameter, kept by `candidates-section.tsx`. A "focus the invite field" request travels from there through the ranked list, the row and the detail to the invite panel, where a ref callback on the email field scrolls it into view, focuses it and clears the request. No effect is used.

## Out of scope

- The invite route and email sending.
- Scoring and the ATS rules.
- Environment variables and deployments.

## Acceptance

- A signed-in recruiter can download any stored resume from the three places above; a `pending` row shows no link.
- The route answers 401 signed out, 400 for a bad id, 404 for an unknown id or a missing object, 303 to the signed link with `no-store`, and maps storage failures to 503 or 500.
- Every ranked row not yet invited shows the invite button; clicking it opens the detail and focuses the email field without sending anything.
- `npm run lint`, `docs:check`, `typecheck`, `test`, `design:contrast` and `build` pass.
