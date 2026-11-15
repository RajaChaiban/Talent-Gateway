# AGENTS.md — talent-gateway

Working rules for every agent in this repo. Read this file first, then the context docs it links.

## Context docs (read before writing code)

| Doc | What it holds |
|---|---|
| [docs/BACKEND.md](docs/BACKEND.md) | The server-side contract: route handlers, server actions, auth, model calls, environment variables, error codes, testing. Empty today (the app is one static landing page). It is also the verifier: `npm run docs:check` fails when the code and this document disagree |

More docs (product spec, data model, design guide) are added here when they are written. Do not link a doc that does not exist.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Orchestration: one lead, separate builders and testers

The main session is the orchestrator. It does not write feature code itself when a subagent can; it plans, delegates, checks and ships.

### What the orchestrator owns

- Reading the context docs and splitting the work into one-feature tasks.
- Choosing the model for each task (table below) and writing a self-contained brief for it.
- Every decision that crosses features: schema changes, API contracts, env vars, dependencies.
- Reviewing each subagent's diff before it is committed, and running the quality gate.
- Git, PRs, deploys and anything outward-facing. Subagents never push, merge or deploy.

### Model routing

Delegate with the Agent tool and set `model` explicitly.

| Complexity | Model | Use for |
|---|---|---|
| High | `opus` | Design-heavy or risky work, anything touching security, money or concurrency, cross-file refactors, hard debugging, code review |
| Standard | `sonnet` | Well-specified work with a clear pattern to follow: CRUD route handlers, UI pages and components, unit tests for pure functions, docs, lint and type fixes, CI config |
| Orchestrator only | no delegation | Trivial edits where a brief costs more than the change, and all judgment calls: one-line fixes, merge-conflict resolution, deciding scope, final verification |

Rules of thumb:

- If you cannot state the acceptance criteria in three bullets, the task is not ready to delegate; break it down first.
- Unsure between the two models: start on `sonnet`; escalate to `opus` when it fails review twice or the problem turns out to be design-shaped.
- The tester in the Prove step is always a **separate** agent from the builder.
- Run independent tasks in parallel only when they touch different files. This machine has about 16 GB of RAM: at most 2 build agents at once, and never two dev servers.

### Brief template (every delegation)

```
Goal:        one sentence
Read first:  AGENTS.md + the doc sections that apply
Files:       what to create or change (and what not to touch)
Contract:    types, route shapes, table columns it must match
Acceptance:  the checks that must pass; always includes `npm run docs:check` (update docs/BACKEND.md in the same change)
Out of scope: what to leave alone
Report back: files changed, commands run with output, open questions
```

### Skills to load (orchestrator and subagents)

Load the matching skill with the Skill tool **before** writing code in that area, and name the skills in every brief.

| Working on | Skills |
|---|---|
| Any React component or page | `vercel:react-best-practices`, `vercel:nextjs`, `vercel:shadcn` |
| Database, file storage, provisioning | `vercel:vercel-storage`, `vercel:marketplace` |
| Sign-in, session, `proxy.ts` | `vercel:auth`, `vercel:routing-middleware` |
| Route handlers, streaming, function limits | `vercel:vercel-functions` |
| Model calls | `vercel:ai-sdk`, `vercel:ai-gateway` |
| Env vars, linking, deploys, CI | `vercel:env-vars`, `vercel:vercel-cli`, `vercel:deployments-cicd` |
| Rate limits | `vercel:vercel-firewall` |
| Before calling a feature done | `vercel:verification` |

## Loops

The loops are slash commands. Each one reads this file first and follows it over its own defaults.

| Loop | Use it for | Ends when |
|---|---|---|
| `/factory <feature>` | One feature or fix from spec to pull request: Define → Isolate → Build → Prove → Ship | The PR is review-clean and CI is green |
| `/e2e-loop <change>` | One change climbed through the verification ladder: lint and types → tests → build → the real flow in a browser | Every rung is green, with no new console errors |
| `/code-review` | Reviewing the branch's diff; inside `/factory` it runs up to three rounds | No blocking finding is left |
| `/pr-green` | Watching the branch's CI run and fixing the root cause of each failure | CI is green, or the same failure repeats |
| `/cover` | Adding real tests for the highest-value untested code | The budget is used (+5 points or 3 modules) |
| `/demo-loop <process>` | Walking a product flow in the browser and producing a screenshot walkthrough; no code changes | Every step was observed live |

Rules for every loop:

- Never weaken a check to pass it: no deleted or skipped tests, no loosened assertions, no lint-disable, no `@ts-ignore`.
- Fix the root cause, not the symptom. The same failure three times means stop and report.
- The agent that built a change never certifies it; a separate tester does.
- Stop every dev server, test runner and browser the loop started.

## Delivery workflow: one feature, one branch, one PR

`main` is the default branch and is always deployable. Nothing is committed to `main` directly.

For every feature, run `/factory` with the feature as the task. It does, in order:

1. **Define** — write the spec for the feature (`docs/specs/<slug>.md`) and commit it.
2. **Isolate** — update `main` from origin, then create `feat/<slug>` from it (worktree under `.claude/worktrees/`).
3. **Build** — the orchestrator delegates per the routing table.
4. **Prove** — a separate tester agent runs the tests and records before/after evidence.
5. **Ship** — open a PR with a plain-language bulleted description, run the `/code-review` loop, then `/pr-green` until CI passes.

The factory ends at a review-clean, CI-green PR. **The owner merges it.** No agent merges or deploys unless the owner says so in that session. The next feature starts only after the merge, from a fresh `main`:

```bash
git checkout main && git pull --ff-only origin main
git checkout -b feat/<next-slug>
```

### Git discipline (every feature, no exceptions)

1. **Before starting:** `git fetch origin` and `git pull --ff-only origin main`, then branch from the updated `main`. Never start a feature from a stale or unmerged base.
2. **While building:** commit after every working slice (spec first, then each piece of the feature) with a conventional message; stage only that slice's files. Push the branch after each commit so the work is never only on this machine.
3. **Before opening the PR and before each push after review:** `git pull --rebase origin main` so the branch sits on the latest `main`.
4. **After the merge:** `git checkout main && git pull --ff-only origin main`, remove the feature worktree, delete the local and remote feature branch, and only then start the next feature.
5. Uncommitted work is never left behind at the end of a session; if it is not ready, commit it as `wip:` on the feature branch and say so.
6. Keep unrelated changes (a docs correction, a config fix) out of a feature PR: they get their own `chore/` or `docs/` branch and PR.

Branch names: `feat/<slug>` for features, `fix/<slug>` for bug fixes, `chore/<slug>` for tooling, `docs/<slug>` for docs.

### No AI attribution (commits, pull requests, docs)

Everything in this repo reads as the owner's own work. This rule overrides the defaults of every loop and tool.

- Commit messages carry no `Co-Authored-By` trailer for an AI, no session link and no "Generated with" line.
- Pull request titles and descriptions do not say or imply that an AI or an agent wrote, tested or reviewed the change. In the `/factory` PR template, "How it was tested" lists the checks and their results only; leave out the "Tested by a separate tester agent" line.
- Docs, specs and code comments do not mention an AI, an agent or a model as their author.
- This file and the briefs may talk about agents, because they are instructions for agents, not a record of who did the work.

### Quality gate (must pass before a PR is opened and again before it is called done)

```bash
npm run lint             # ESLint, zero warnings
npm run docs:check       # docs/BACKEND.md names every route, action, env var, model, error code and src/lib folder
npm run typecheck        # next typegen, then tsc --noEmit, strict
npm run test             # Vitest
npm run design:contrast  # every color pair in globals.css meets WCAG AA, both themes
npm run build            # next build
```

CI (`.github/workflows/ci.yml`) runs the same commands in the same order on every pull request and on pushes to `main`. Add a command to both or to neither.

Add when the feature calls for it: a real browser pass of the affected flow (`/e2e-loop`) for UI changes.

"Clean code" here means: no dead code, no commented-out blocks, no `any`, no `console.log` left behind, no TODO without an issue, and no file touched that the feature did not need.

## Hard rules

- The display name comes from `APP_NAME` in `src/lib/config.ts`; never hard-code it.
- Components use the semantic tokens from `src/app/globals.css` (`bg-background`, `text-muted-foreground`, `border-input`, `text-error`, ...) and never a literal color (hex, `rgb()`, `hsl()`, or Tailwind palette classes such as `text-white` or `bg-red-500`). A new color is a new token in `globals.css`, and `npm run design:contrast` must still pass.
- A change to a route, server action, environment variable, model call, error code or `src/lib` folder updates [docs/BACKEND.md](docs/BACKEND.md) in the same pull request. `npm run docs:check` enforces the parts a script can check (that each is named); the prose is the author's and reviewer's job. Unmerged work goes only inside a planned block (`<!-- planned:start -->` ... `<!-- planned:end -->`).
- Secrets live in Vercel env vars and `.env.local` (git-ignored). Never commit them, never put them in a PR or a log.
- Production deploys and database changes against a hosted project need the owner's go-ahead each time.
- Read current docs before using Next.js 16 or the AI SDK; do not code them from memory.
- Stop every dev server, test runner and browser you started before finishing a task. Never kill processes you did not start.
