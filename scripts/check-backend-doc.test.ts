import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const REPO = path.resolve(import.meta.dirname, "..");
const SCRIPT = path.join(REPO, "scripts", "check-backend-doc.mjs");

type Tree = Record<string, string>;

const DOC = "docs/BACKEND.md";

/** A small backend and a document that names all of it: the check passes on this tree. */
const PASSING: Tree = {
  "src/app/api/jobs/route.ts": [
    "export async function GET() { return Response.json({ data: [] }); }",
    "export function POST() { return Response.json({ data: {} }, { status: 201 }); }",
  ].join("\n"),
  "src/app/api/jobs/[id]/route.ts": [
    "export const maxDuration = 30;",
    "export const PATCH = async () => Response.json({ data: {} });",
    "// export async function DELETE() {}",
  ].join("\n"),
  "src/app/(public)/auth/signed-out/route.ts": "export function GET() { return new Response(null, { status: 303 }); }",
  "src/app/api/jobs/route.test.ts": "export async function DELETE() {}",
  "src/app/login/actions.ts": [
    "// Sign-in form action.",
    '"use server";',
    "export async function signIn() {}",
    "export type SignInState = { email: string };",
  ].join("\n"),
  "src/app/login/helpers.ts": "export async function notAnAction() {}",
  "src/lib/env.ts": [
    'import { z } from "zod";',
    'import { publicEnvSchema } from "@/lib/supabase/public-env";',
    "const envSchema = publicEnvSchema.extend({",
    "  SERVICE_KEY: z.string().min(1),",
    "});",
    "export const parse = (source: unknown) => envSchema.parse(source);",
  ].join("\n"),
  "src/lib/supabase/public-env.ts": [
    'import { z } from "zod";',
    "export const publicEnvSchema = z.object({",
    "  NEXT_PUBLIC_API_URL: z.url(),",
    "});",
  ].join("\n"),
  "src/lib/ai/model.ts": 'export const flag = process.env.FAKE_MODEL === "1";',
  "src/lib/config.ts": [
    "export const AI_MODELS = {",
    "  /** scoreResume */",
    '  scoring: "acme/small-1",',
    '  summary: "acme/large-2",',
    "} as const;",
  ].join("\n"),
  "src/lib/http.ts": 'export type ErrorCode =\n  | "unauthorized"\n  | "not_found";\n',
  ".env.example": "NEXT_PUBLIC_API_URL=\nSERVICE_KEY=\nGATEWAY_TOKEN=\n",
  [DOC]: [
    "# Backend",
    "",
    "Planned text sits between `<!-- planned:start -->` and `<!-- planned:end -->`.",
    "",
    "## 1. Shape",
    "",
    "## 2. Project layout",
    "",
    "```",
    "src/",
    "  app/",
    "    login/                 sign-in page and the `signIn` action",
    "    api/",
    "      jobs/                jobs routes, wrapped over",
    "                           two lines",
    "  lib/",
    "    config.ts, env.ts      settings",
    "    ai/                    model helpers",
    "    supabase/              clients",
    "```",
    "",
    "<!-- planned:start -->",
    "Planned, not merged: `src/lib/invitations/` and `src/app/api/invitations/`.",
    "<!-- planned:end -->",
    "",
    "## 3. Auth",
    "",
    "## 4. API contract",
    "",
    "| Method | Path | Does |",
    "|---|---|---|",
    "| GET | `/api/jobs` | List jobs |",
    "| POST | `/api/jobs` | Create a job |",
    "| PATCH | `/api/jobs/:id` | Update a job. `maxDuration` 30 |",
    "| GET | `/auth/signed-out` | Clear cookies |",
    "",
    "<!-- planned:start -->",
    "| Method | Path | Does |",
    "|---|---|---|",
    "| POST | `/api/invitations/[id]/send` | Send an invitation. `maxDuration` 60 |",
    "<!-- planned:end -->",
    "",
    "Server actions: `signIn`.",
    "",
    "## 5. Model calls",
    "",
    "`AI_MODELS.scoring` is `acme/small-1`; `AI_MODELS.summary` is `acme/large-2`.",
    "",
    "## 6. Workflows",
    "",
    "## 7. Pipeline",
    "",
    "## 8. Environment variables",
    "",
    "| Name | Scope |",
    "|---|---|",
    "| `NEXT_PUBLIC_API_URL` | client |",
    "| `SERVICE_KEY` | server |",
    "| `GATEWAY_TOKEN` | server |",
    "| `FAKE_MODEL` | tests |",
    "",
    "<!-- planned:start -->",
    "| Name | Scope |",
    "|---|---|",
    "| `MAIL_KEY` | server |",
    "<!-- planned:end -->",
    "",
    "## 9. Errors and limits",
    "",
    "`unauthorized` is 401 and `not_found` is 404.",
    "",
    "## 10. Testing",
    "",
  ].join("\n"),
};

const created: string[] = [];

function makeTree(changes: Tree = {}, edit: (doc: string) => string = (doc) => doc): string {
  const root = mkdtempSync(path.join(tmpdir(), "backend-doc-check-"));
  created.push(root);
  const files = { ...PASSING, ...changes };
  files[DOC] = edit(files[DOC]);
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, ...file.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return root;
}

function run(args: string[]): { status: number | null; stdout: string; lines: string[] } {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  const lines = result.stderr.split("\n").filter((line) => line.trim() !== "");
  return { status: result.status, stdout: result.stdout, lines };
}

/** The problem lines of a tree: everything on stderr except the closing summary. */
function check(changes: Tree = {}, edit?: (doc: string) => string) {
  const result = run(["--root", makeTree(changes, edit)]);
  return { ...result, problems: result.lines.filter((line) => !line.startsWith("docs:check failed")) };
}

function expectOneProblem(result: ReturnType<typeof check>, ...parts: string[]) {
  expect(result.status).toBe(1);
  expect(result.problems).toHaveLength(1);
  for (const part of parts) expect(result.problems[0]).toContain(part);
  expect(result.problems[0]).toContain("Fix:");
  expect(result.lines.at(-1)).toContain("docs:check failed: 1 problem.");
}

afterAll(() => {
  for (const root of created) rmSync(root, { recursive: true, force: true });
});

// Each case starts a Node process; a loaded machine can take seconds to do that.
describe("check-backend-doc", { timeout: 60_000 }, () => {
  it("passes on a tree whose document names everything", () => {
    const result = check();
    expect(result.lines).toEqual([]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("docs:check passed: 4 route methods, 1 server actions, 3 environment variables");
  });

  it("passes on this repository", () => {
    const result = run([]);
    expect(result.lines).toEqual([]);
    expect(result.status).toBe(0);
  });

  describe("a. route handlers and the API contract table", () => {
    it("fails for an exported method the table does not list", () => {
      const result = check({
        "src/app/api/jobs/[id]/route.ts": `${PASSING["src/app/api/jobs/[id]/route.ts"]}\nexport async function GET() {}`,
      });
      expectOneProblem(result, "src/app/api/jobs/[id]/route.ts: GET /api/jobs/[id] is not in the API contract table.", "section 4");
    });

    it("fails for a new route file, with the path taken from its folders", () => {
      const result = check(
        { "src/app/api/resumes/[id]/analyze/route.ts": "export const POST = async () => new Response();" },
        (doc) => doc.replace("      jobs/ ", "      resumes/             resume routes\n      jobs/ "),
      );
      expectOneProblem(result, "src/app/api/resumes/[id]/analyze/route.ts: POST /api/resumes/[id]/analyze is not in the API contract table.");
    });

    it("fails for a row whose method and path no handler exports", () => {
      const result = check({}, (doc) => doc.replace("| GET | `/auth/signed-out`", "| DELETE | `/api/jobs/[id]` | Delete |\n| GET | `/auth/signed-out`"));
      expectOneProblem(result, "docs/BACKEND.md:35:", "lists DELETE /api/jobs/[id], but no route handler exports it", "planned block");
    });

    it("fails when a route that now exists is still listed only as planned", () => {
      const result = check(
        { "src/app/api/invitations/[id]/send/route.ts": "export async function POST() {}" },
        (doc) => doc.replace("      jobs/ ", "      invitations/         invitation routes\n      jobs/ "),
      );
      expectOneProblem(result, "POST /api/invitations/[id]/send exists", "still lists it inside a planned block", "move its row");
    });
  });

  describe("b. server actions", () => {
    it("fails for an exported action the document does not name", () => {
      const result = check({
        "src/app/app/actions.ts": '"use server";\n\nexport async function signOut() {}\nexport const saveThresholds = async () => {};',
      });
      expect(result.status).toBe(1);
      expect(result.problems).toEqual([
        expect.stringContaining("src/app/app/actions.ts: The server action saveThresholds is not named in docs/BACKEND.md."),
        expect.stringContaining("src/app/app/actions.ts: The server action signOut is not named in docs/BACKEND.md."),
      ]);
    });

    it("does not accept a name that appears only inside a planned block or a longer word", () => {
      const result = check({}, (doc) =>
        doc
          .replace("Server actions: `signIn`.", "The `signInSchema` checks the form.")
          .replace("the `signIn` action", "the form")
          .replace("Planned, not merged:", "Planned, not merged: `signIn`,"),
      );
      expectOneProblem(result, "src/app/login/actions.ts: The server action signIn is not named", "section 4");
    });
  });

  describe("c. environment variables and section 8", () => {
    it("fails for a schema variable section 8 does not name", () => {
      const result = check({
        "src/lib/env.ts": PASSING["src/lib/env.ts"].replace("  SERVICE_KEY:", "  MAIL_KEY: z.string().optional(),\n  SERVICE_KEY:"),
      });
      expectOneProblem(result, "src/lib/env.ts: The environment variable MAIL_KEY is in the env schema but not in docs/BACKEND.md section 8.");
    });

    it("fails for a variable of the public schema that env.ts extends", () => {
      const result = check({}, (doc) => doc.replace("| `NEXT_PUBLIC_API_URL` | client |\n", ""));
      expectOneProblem(result, "src/lib/supabase/public-env.ts: The environment variable NEXT_PUBLIC_API_URL is in the env schema");
    });

    it("fails for a .env.example variable section 8 does not name", () => {
      const result = check({ ".env.example": `${PASSING[".env.example"]}NEW_SECRET=\n` });
      expectOneProblem(result, ".env.example: The environment variable NEW_SECRET is in .env.example but not in docs/BACKEND.md section 8.");
    });

    it("fails for a variable section 8 names that nothing defines or reads", () => {
      const result = check({}, (doc) => doc.replace("| `FAKE_MODEL` | tests |", "| `FAKE_MODEL` | tests |\n| `OLD_MAIL_KEY` | server |"));
      expectOneProblem(result, "docs/BACKEND.md:", "Section 8 names the environment variable OLD_MAIL_KEY", "planned block");
    });
  });

  describe("d. folders and the project layout", () => {
    it("fails for a folder under src/lib the layout does not mention", () => {
      const result = check({ "src/lib/ranking/rank.ts": "export const x = 1;" });
      expectOneProblem(result, "src/lib/ranking: The folder src/lib/ranking/ is not in the project layout.", "section 2");
    });

    it("fails for a folder under src/app/api the layout does not mention", () => {
      const result = check({ "src/app/api/demo/notes.ts": "export const x = 1;" });
      expectOneProblem(result, "src/app/api/demo: The folder src/app/api/demo/ is not in the project layout.");
    });

    it("fails for a layout line whose path does not exist", () => {
      const result = check({}, (doc) => doc.replace("    supabase/ ", "    resumes/               text extraction\n    supabase/ "));
      expectOneProblem(result, "docs/BACKEND.md:19: The project layout lists src/lib/resumes, which does not exist.", "planned block");
    });
  });

  describe("e. AI_MODELS and the model-calls section", () => {
    it("fails for a key and a model string section 5 does not have", () => {
      const result = check({
        "src/lib/config.ts": PASSING["src/lib/config.ts"].replace("} as const;", '  radar: "acme/tiny-3",\n} as const;'),
      });
      expect(result.status).toBe(1);
      expect(result.problems).toEqual([
        expect.stringContaining("src/lib/config.ts: AI_MODELS.radar is not named in docs/BACKEND.md section 5."),
        expect.stringContaining('src/lib/config.ts: The model "acme/tiny-3" (AI_MODELS.radar) is not in docs/BACKEND.md section 5.'),
      ]);
    });

    it("passes when the app has no AI_MODELS object yet", () => {
      const result = check({ "src/lib/config.ts": 'export const APP_NAME = "Example";' });
      expect(result.lines).toEqual([]);
      expect(result.status).toBe(0);
    });

    it("fails when only the model string changed", () => {
      const result = check({ "src/lib/config.ts": PASSING["src/lib/config.ts"].replace("acme/large-2", "acme/large-3") });
      expectOneProblem(result, 'The model "acme/large-3" (AI_MODELS.summary) is not in docs/BACKEND.md section 5.');
    });
  });

  describe("f. error codes and the errors section", () => {
    it("fails for a code of the ErrorCode union section 9 does not have", () => {
      const result = check({ "src/lib/http.ts": 'export type ErrorCode = "unauthorized" | "not_found" | "model_busy";' });
      expectOneProblem(result, 'src/lib/http.ts: The error code "model_busy" is not in docs/BACKEND.md section 9.');
    });

    it("fails for a code of a feature-local list", () => {
      const result = check(
        { "src/lib/ranking/api.ts": 'export type RankErrorCode = "not_ready";\nexport const RANK_ERROR_CODES = ["not_ready", "upstream_error"] as const;' },
        (doc) => doc.replace("    supabase/ ", "    ranking/               ranking\n    supabase/ "),
      );
      expect(result.status).toBe(1);
      expect(result.problems).toEqual([
        expect.stringContaining('src/lib/ranking/api.ts: The error code "not_ready" is not in docs/BACKEND.md section 9.'),
        expect.stringContaining('src/lib/ranking/api.ts: The error code "upstream_error" is not in docs/BACKEND.md section 9.'),
      ]);
    });
  });

  describe("g. maxDuration", () => {
    it("fails when a route exports a different value than its row states", () => {
      const result = check({
        "src/app/api/jobs/[id]/route.ts": PASSING["src/app/api/jobs/[id]/route.ts"].replace("maxDuration = 30", "maxDuration = 60"),
      });
      expectOneProblem(result, "src/app/api/jobs/[id]/route.ts: PATCH /api/jobs/[id] exports maxDuration = 60, but docs/BACKEND.md:34 states 30.");
    });

    it("fails when a row states a value and the route exports none", () => {
      const result = check({}, (doc) => doc.replace("| List jobs |", "| List jobs. `maxDuration` 10 |"));
      expectOneProblem(result, "src/app/api/jobs/route.ts: GET /api/jobs exports no maxDuration, but docs/BACKEND.md:32 states 10.");
    });
  });

  describe("planned blocks and output", () => {
    it("fails for a planned block that is never closed", () => {
      const result = check({}, (doc) => `${doc}\n<!-- planned:start -->\nLater.\n`);
      expectOneProblem(result, "<!-- planned:start --> is never closed.");
    });

    it("fails for an end marker with no start", () => {
      const result = check({}, (doc) => `${doc}\n<!-- planned:end -->\n`);
      expectOneProblem(result, "<!-- planned:end --> has no <!-- planned:start --> before it.");
    });

    it("prints one line per problem, sorted by path, the same on every run", () => {
      const changes: Tree = {
        "src/lib/ranking/rank.ts": "export const x = 1;",
        "src/app/api/demo/seed/route.ts": "export async function POST() {}",
        ".env.example": `${PASSING[".env.example"]}NEW_SECRET=\n`,
      };
      const first = check(changes);
      const second = check(changes);
      expect(first.problems).toEqual(second.problems);
      expect(first.problems.map((line) => line.split(": ")[0])).toEqual([
        ".env.example",
        "src/app/api/demo",
        "src/app/api/demo/seed/route.ts",
        "src/lib/ranking",
      ]);
      expect(first.lines.at(-1)).toContain("docs:check failed: 4 problems.");
    });

    it("fails when the document is missing and rejects an unknown argument", () => {
      const root = makeTree();
      rmSync(path.join(root, "docs"), { recursive: true });
      const missing = run(["--root", root]);
      expect(missing.status).toBe(1);
      expect(missing.lines[0]).toContain("docs/BACKEND.md: the document does not exist.");
      expect(run(["--nope"]).status).toBe(2);
    });
  });
});
