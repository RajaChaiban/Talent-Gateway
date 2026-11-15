import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `analyzeResume` is the only way to reach the model calls, so the ATS gate
 * always runs first. These checks keep it that way with allow-lists of who may
 * import each piece of the AI layer, and of who may call the AI SDK's
 * generation functions at all. Test files are left out: they mock these
 * modules. Imports are found in every form: `from`, side-effect `import`,
 * `import()` (quoted or template literal), `require()`, with or without a
 * `.js` / `.ts` suffix.
 *
 * The one deliberate exception is the model evaluation (`npm run eval`,
 * outside `src/`): `evals/model-call.ts` calls `scoreResume` directly, after
 * the runner has run the ATS check on every local file itself. It is the only
 * file under `evals/` that may reach the AI layer, and only these modules.
 */

const SRC = join(__dirname, "..", "..");
const SELF = "lib/screening/boundary.test.ts";
/** The Supabase key that bypasses row-level security; the app never holds it. */
const SERVICE_KEY_ENV_NAME = "SUPABASE_SERVICE_ROLE_KEY";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [path] : [];
  });
}

const all = sourceFiles(SRC).map((path) => ({
  file: relative(SRC, path).split(sep).join("/"),
  text: readFileSync(path, "utf8"),
}));
const code = all.filter(({ file }) => !/\.test\.tsx?$/.test(file));

const EVALS = join(SRC, "..", "evals");
const evalCode = sourceFiles(EVALS)
  .map((path) => ({
    file: `evals/${relative(EVALS, path).split(sep).join("/")}`,
    text: readFileSync(path, "utf8"),
  }))
  .filter(({ file }) => !/\.test\.tsx?$/.test(file));
const EVAL_MODEL_CALL = "evals/model-call.ts";
const EVAL_AI_IMPORTS = ["@/lib/ai/errors", "@/lib/ai/model", "@/lib/ai/prompts", "@/lib/ai/score-resume"];

const SPECIFIER = [
  /\bfrom\s*["'`]([^"'`]+)["'`]/g,
  /\bimport\s*["'`]([^"'`]+)["'`]/g,
  /\bimport\s*\(\s*["'`]([^"'`$]+)["'`]?/g,
  /\brequire\s*\(\s*["'`]([^"'`$]+)["'`]?/g,
];

/** Every module specifier in `text`, with a .js/.ts/.tsx suffix removed. */
function specifiers(text: string): string[] {
  return SPECIFIER.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[1])).map(
    (specifier) => specifier.replace(/\.(js|ts|tsx|mjs|cjs)$/, ""),
  );
}

function importersOf(module: RegExp): string[] {
  return code
    .filter(({ text }) => specifiers(text).some((specifier) => module.test(specifier)))
    .map(({ file }) => file)
    .toSorted();
}

const GENERATION = ["generateText", "generateObject", "streamText", "streamObject"];

/** Files that take a generation function from the "ai" package (named, namespace or dynamic import). */
function generationCallers(files: ReadonlyArray<{ file: string; text: string }> = code): string[] {
  return files
    .filter(({ text }) => {
      const named = [...text.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']ai["']/g)].some(
        (match) => match[1].split(",").some((name) => GENERATION.includes(name.trim().split(/\s+as\s+/)[0])),
      );
      const whole =
        /import\s*\*\s*as\s+\w+\s*from\s*["']ai["']/.test(text) ||
        /\b(?:import|require)\s*\(\s*["'`]ai["'`]\s*\)/.test(text);
      return named || whole;
    })
    .map(({ file }) => file)
    .toSorted();
}

describe("screening boundary", () => {
  it("finds imports in every form", () => {
    expect(
      specifiers(
        [
          'import { a } from "@/lib/ai/score-resume";',
          'import "./run-radar.js";',
          "const m = await import(`@/lib/ai/generate`);",
          'const r = require("../ai/model.ts");',
          "export * from './fake-model'",
        ].join("\n"),
      ).toSorted(),
    ).toEqual(["../ai/model", "./fake-model", "./run-radar", "@/lib/ai/generate", "@/lib/ai/score-resume"]);
  });

  it("only the pipeline imports scoreResume and runRadar", () => {
    expect(importersOf(/(^|\/)score-resume$/)).toEqual(["lib/screening/analyze.ts"]);
    expect(importersOf(/(^|\/)run-radar$/)).toEqual(["lib/screening/analyze.ts"]);
  });

  it("only scoreResume and runRadar use the structured-call helper", () => {
    expect(importersOf(/(^|\/)ai\/generate$|^\.\/generate$/)).toEqual([
      "lib/ai/run-radar.ts",
      "lib/ai/score-resume.ts",
    ]);
  });

  it("only the AI layer imports model.ts, and only model.ts builds the stand-in model", () => {
    expect(importersOf(/(^|\/)ai\/model$|^\.\/model$/)).toEqual([
      "lib/ai/fake-model.ts",
      "lib/ai/generate.ts",
    ]);
    expect(importersOf(/(^|\/)fake-model$/)).toEqual([
      "lib/ai/model.ts",
      "lib/ai/run-radar.ts",
      "lib/ai/score-resume.ts",
    ]);
  });

  it("only generate.ts takes a generation function from the AI SDK", () => {
    expect(generationCallers()).toEqual(["lib/ai/generate.ts"]);
  });

  it("only the stand-in loads ai/test, and only by dynamic import", () => {
    const users = code.filter(({ text }) => specifiers(text).includes("ai/test"));
    expect(users.map(({ file }) => file)).toEqual(["lib/ai/fake-model.ts"]);
    expect(users[0].text).not.toMatch(/\bfrom\s*["']ai\/test["']/);
  });

  it("in evals/, only model-call.ts reaches the AI layer, for the scoring call only, with no generation function", () => {
    expect(evalCode.length).toBeGreaterThan(5);
    const aiLayer = (specifier: string) => /(^|\/)lib\/ai\//.test(specifier);
    const importers = evalCode.filter(({ text }) => specifiers(text).some(aiLayer)).map(({ file }) => file);
    expect(importers).toEqual([EVAL_MODEL_CALL]);
    const modelCall = evalCode.find(({ file }) => file === EVAL_MODEL_CALL);
    expect(specifiers(modelCall?.text ?? "").filter(aiLayer).toSorted()).toEqual(EVAL_AI_IMPORTS);
    expect(generationCallers(evalCode)).toEqual([]);
    expect(evalCode.filter(({ text }) => specifiers(text).includes("ai/test")).map(({ file }) => file)).toEqual([]);
  });

  it("nothing under src/app imports from the AI layer", () => {
    const app = code.filter(({ file }) => file.startsWith("app/"));
    expect(app.length).toBeGreaterThan(10);
    for (const { file, text } of app) {
      expect(specifiers(text).filter((specifier) => /(^|\/)lib\/ai\//.test(specifier)), file).toEqual([]);
    }
  });

  it("the pipeline and the recruiter routes never use the service-role client", () => {
    const scoped = all.filter(
      ({ file }) =>
        file !== SELF &&
        (file.startsWith("app/") || file.startsWith("lib/screening/") || file.startsWith("lib/ai/")),
    );
    expect(scoped.length).toBeGreaterThan(10);
    for (const { file, text } of scoped) {
      expect(text, file).not.toMatch(/supabase\/service/);
      expect(text, file).not.toContain(SERVICE_KEY_ENV_NAME);
    }
  });
});
