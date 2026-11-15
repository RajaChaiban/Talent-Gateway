# Spec: sample resumes and a sample job description

Status: agreed, being built on `feat/sample-resumes`.

## Why

A reviewer who signs in to the demo has no resumes at hand. Without files to upload they cannot see the product work. A small set of ready-made files, with a matching job description, lets them try it in a minute.

## What

- Seven sample resumes (PDF) and one job description (text) under `public/samples/`, plus one zip with all of them.
- A quiet link under the upload drop zone on the job page: "Need files to try it? Download sample resumes" (the zip).
- A quiet link under the description field on the new job form: "Use a sample job description" (opens the text file in a new tab; the form is not filled in for the reviewer).
- A "Try it" section in the README.

Every person, employer and school in the files is invented. Emails end in `@example.com` and phone numbers are `555-01xx`. The portrait in file 7 is a drawing made for the purpose, not a photograph.

## The files

Served from `/samples/`. The job is the Software Engineer description in `evals/jobs/software-engineer.txt`.

| File | What it shows |
|---|---|
| `sample-job-description.txt` | The Software Engineer job: React, Node.js, PostgreSQL, tests, CI/CD |
| `1-strong-match.pdf` | A strong match: ready, scored high |
| `2-good-match-other-stack.pdf` | A good match on another stack (Angular, Java): ready, scored in the middle |
| `3-vague-claims.pdf` | The right skills, vague claims: ready, scored lower than file 1 |
| `4-related-role.pdf` | A QA automation engineer: ready, scored low to middle |
| `5-unrelated-role.pdf` | A product manager: ready, scored low |
| `6-no-email-no-phone.pdf` | File 1 without its email and phone lines: set aside, no email and no phone number |
| `7-with-photo.pdf` | File 1's content under another invented name, laid out as a European CV with a portrait: set aside for the picture |
| `sample-resumes.zip` | The job description and the seven PDFs |

Each PDF is one page, a single column, with real selectable text. The text of files 1 to 5 comes from the evaluation set under `evals/`, so the scores a reviewer sees line up with what the evaluation measured. Files 1 and 3 are the same invented person, one with specific results and one with vague claims.

## Where the links are

- `src/app/app/jobs/[id]/resumes-section.tsx`: the helper line under the drop zone, a plain `<a href download>`.
- `src/app/app/jobs/new/new-job-form.tsx`: the helper line under the description field, `target="_blank"`.
- The file names are listed once, in `src/lib/samples.ts`, and a test holds that list to the files on disk.

## Signed-out access

The files are static and public on purpose. The proxy matcher (`src/proxy.ts`) covers only `/app/:path*`, `/login` and `/api/:path*`, so the proxy never runs for `/samples/*` and a signed-out visitor can download them. Nothing in them is real, so nothing private is exposed.

## Out of scope

- Downloading a resume a recruiter uploaded.
- Filling in the form or uploading the samples automatically.
- Any change to scoring, the ATS rules, uploads or the database.

## Acceptance

- The seven PDFs and the job description are in `public/samples/`, and the zip holds them.
- Files 1 to 5 each contain an email address and a phone number as text and no picture; file 6 has neither; file 7 has exactly one picture, an email and a phone number.
- Through the real `extractText` and `checkAts`: files 1 to 5 are `ATS_READY`; file 6 fails `contact_info` and `phone`; file 7 fails `picture`.
- Both links are keyboard focusable with a visible focus ring and fit at 390 px.
- `npm run lint`, `docs:check`, `typecheck`, `test`, `design:contrast` and `build` pass.
