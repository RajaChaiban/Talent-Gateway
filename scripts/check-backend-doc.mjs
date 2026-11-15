// Fails when the backend changes without docs/BACKEND.md.
//
//   npm run docs:check
//   node scripts/check-backend-doc.mjs --root <dir>
//
// It reads files only (no network, no imports of app code) and compares what
// the source tree defines with what the document NAMES:
//
//   a. route handlers            <-> the API contract table (section 4)
//   b. server actions             -> named anywhere in the document
//   c. environment variables     <-> section 8
//   d. src/lib and src/app/api   <-> the project layout tree (section 2)
//   e. AI_MODELS keys and slugs   -> section 5 (skipped until src/lib/config.ts has AI_MODELS)
//   f. error codes                -> section 9
//   g. maxDuration of a route     =  the value its table row states
//
// It cannot tell whether the prose about a thing is correct, only that the
// thing is named. Text between `<!-- planned:start -->` and
// `<!-- planned:end -->` describes work that is not merged: it never counts as
// documentation of something that exists, and what it names need not exist.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOC = "docs/BACKEND.md";
const PLANNED_START = "<!-- planned:start -->";
const PLANNED_END = "<!-- planned:end -->";
const PLANNED_HINT = `a planned block (${PLANNED_START} ... ${PLANNED_END})`;
const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const SOURCE_FILE = /\.(?:ts|tsx|mts|js|jsx|mjs)$/;
const TEST_FILE = /\.(?:test|spec)\.[a-z]+$/;
const SKIPPED_DIRS = new Set(["node_modules", ".next", ".git", ".claude"]);
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

function parseArgs(argv) {
  let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--root" && argv[i + 1]) {
      root = path.resolve(argv[i + 1]);
      i += 1;
    } else {
      console.error(`Unknown argument: ${argv[i]}\nUsage: node scripts/check-backend-doc.mjs [--root <dir>]`);
      process.exit(2);
    }
  }
  return { root };
}

const { root } = parseArgs(process.argv.slice(2));

const toPosix = (file) => file.split(path.sep).join("/");
const abs = (rel) => path.join(root, ...rel.split("/"));
const exists = (rel) => existsSync(abs(rel));
const read = (rel) => (exists(rel) ? readFileSync(abs(rel), "utf8").replace(/\r\n/g, "\n") : null);
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (text, word) => new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(word)}(?![A-Za-z0-9_])`).test(text);

/** Names of the entries of `rel`, sorted; empty when it is not a directory. */
function list(rel) {
  if (!exists(rel)) return [];
  return readdirSync(abs(rel), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

const subfolders = (rel) => list(rel).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

/** Every file under `rel`, as sorted repo-relative posix paths. */
function walk(rel) {
  const files = [];
  for (const entry of list(rel)) {
    const child = `${rel}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) files.push(...walk(child));
    } else {
      files.push(child);
    }
  }
  return files;
}

const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const problems = [];
function problem(file, line, message, fix) {
  problems.push({ file: toPosix(file), line: line ?? 0, text: `${message} Fix: ${fix}` });
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

/** Each line with its section number (0 before the first `## N.`) and whether it is planned or inside a code fence. */
function parseDoc(text) {
  const lines = [];
  let section = 0;
  let planned = false;
  let plannedSince = 0;
  let fenced = false;
  text.split("\n").forEach((raw, index) => {
    const number = index + 1;
    const trimmed = raw.trim();
    if (trimmed.startsWith("```")) fenced = !fenced;
    const heading = fenced ? null : /^## (\d+)\./.exec(raw);
    if (heading) section = Number(heading[1]);
    if (!fenced && trimmed === PLANNED_START) {
      if (planned) {
        problem(DOC, number, `${PLANNED_START} opens a planned block inside the one opened on line ${plannedSince}.`, `close the first block with ${PLANNED_END}.`);
      }
      planned = true;
      plannedSince = number;
    } else if (!fenced && trimmed === PLANNED_END) {
      if (!planned) {
        problem(DOC, number, `${PLANNED_END} has no ${PLANNED_START} before it.`, "add the start marker or remove this line.");
      }
      planned = false;
    } else {
      lines.push({ number, text: raw, section, planned, fenced: fenced || trimmed.startsWith("```") });
    }
  });
  if (planned) {
    problem(DOC, plannedSince, `${PLANNED_START} is never closed.`, `add ${PLANNED_END} after the planned text.`);
  }
  return lines;
}

/** The cells of a markdown table row, or null when the line is not one. */
function tableCells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;
  return trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());
}

const isSeparatorRow = (cells) => cells.every((cell) => /^:?-+:?$/.test(cell));

/** `/api/jobs/:id/` and `/api/jobs/[id]` are the same path. */
function normalisePath(routePath) {
  const cleaned = routePath
    .replace(/[?#].*$/, "")
    .split("/")
    .map((segment) => (segment.startsWith(":") ? `[${segment.slice(1)}]` : segment))
    .join("/");
  return cleaned.length > 1 ? cleaned.replace(/\/+$/, "") : cleaned;
}

// ---------------------------------------------------------------------------
// The source tree
// ---------------------------------------------------------------------------

/** `src/app/api/jobs/[id]/route.ts` -> `/api/jobs/[id]`; route groups and parallel-route slots add nothing. */
function routePathOf(file) {
  const segments = file
    .split("/")
    .slice(2, -1)
    .filter((segment) => !/^\(.*\)$/.test(segment) && !segment.startsWith("@"));
  return `/${segments.join("/")}`;
}

function exportedMethods(code) {
  const methods = new Set();
  const names = HTTP_METHODS.join("|");
  const declared = new RegExp(
    `^\\s*export\\s+(?:(?:async\\s+)?function\\s*\\*?\\s*(${names})\\b|(?:const|let|var)\\s+(${names})\\s*[=:])`,
    "gm",
  );
  for (const match of code.matchAll(declared)) methods.add(match[1] ?? match[2]);
  for (const match of code.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
    for (const item of match[1].split(",")) {
      const name = item.trim().split(/\s+as\s+/).pop();
      if (name && HTTP_METHODS.includes(name)) methods.add(name);
    }
  }
  return HTTP_METHODS.filter((method) => methods.has(method));
}

function readRoutes() {
  return walk("src/app")
    .filter((file) => /\/route\.(?:ts|tsx|js|jsx|mjs)$/.test(file))
    .map((file) => {
      const code = stripComments(read(file) ?? "");
      const duration = /^\s*export\s+const\s+maxDuration\s*=\s*(\d+)/m.exec(code);
      return {
        file,
        path: routePathOf(file),
        methods: exportedMethods(code),
        maxDuration: duration ? Number(duration[1]) : null,
      };
    });
}

const startsWithUseServer = (code) => /^\s*(?:(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)\s*)*["']use server["']/.test(code);

function readServerActions() {
  const actions = [];
  for (const file of walk("src")) {
    if (!SOURCE_FILE.test(file) || TEST_FILE.test(file)) continue;
    const code = read(file) ?? "";
    if (!startsWithUseServer(code)) continue;
    const exported = /^\s*export\s+(?:(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=)/gm;
    for (const match of stripComments(code).matchAll(exported)) {
      actions.push({ file, name: match[1] ?? match[2] });
    }
  }
  return actions;
}

/** A module specifier of `fromFile` as a repo file, or null when it is a package. */
function resolveImport(fromFile, specifier) {
  let base;
  if (specifier.startsWith("@/")) base = `src/${specifier.slice(2)}`;
  else if (specifier.startsWith(".")) base = path.posix.join(path.posix.dirname(fromFile), specifier);
  else return null;
  return [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}/index.ts`].find(
    (candidate) => SOURCE_FILE.test(candidate) && exists(candidate),
  ) ?? null;
}

/** Upper-case property keys (`NAME: z.string()`), which is how a Zod env schema names its variables. */
function envKeys(code) {
  return [...stripComments(code).matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*:/gm)].map((match) => match[1]);
}

/** Variables of the schema in src/lib/env.ts, following the local modules it imports (the public schema it extends). */
function readEnvSchema() {
  const file = "src/lib/env.ts";
  const code = read(file);
  const names = new Map();
  if (code === null) return names;
  for (const name of envKeys(code)) names.set(name, file);
  for (const match of code.matchAll(/from\s+["']([^"']+)["']/g)) {
    const imported = resolveImport(file, match[1]);
    if (!imported) continue;
    for (const name of envKeys(read(imported) ?? "")) if (!names.has(name)) names.set(name, imported);
  }
  return names;
}

function readEnvExample() {
  const text = read(".env.example") ?? "";
  return [...text.matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/gm)].map((match) => match[1]);
}

/** Source and config text in which an environment variable can be read: src, scripts, e2e, root config files. */
function readCodeText() {
  const self = toPosix(path.relative(root, fileURLToPath(import.meta.url)));
  const files = [
    ...walk("src"),
    ...walk("scripts"),
    ...walk("e2e"),
    ...list(".").filter((entry) => entry.isFile() && /\.config\.[a-z]+$|^package\.json$/.test(entry.name)).map((entry) => entry.name),
  ].filter((file) => (SOURCE_FILE.test(file) || file === "package.json") && !TEST_FILE.test(file) && file !== self);
  return files.map((file) => read(file) ?? "").join("\n");
}

function readAiModels() {
  const file = "src/lib/config.ts";
  const code = read(file);
  if (code === null) return { file, models: null };
  const block = /export\s+const\s+AI_MODELS\s*(?::[^=]+)?=\s*\{([\s\S]*?)\}/.exec(stripComments(code));
  if (!block) return { file, models: null };
  const models = [...block[1].matchAll(/([A-Za-z_$][\w$]*)\s*:\s*["'`]([^"'`]+)["'`]/g)].map((match) => ({
    key: match[1],
    slug: match[2],
  }));
  return { file, models };
}

/** String members of every exported `...ErrorCode...` union and `...ERROR_CODES...` list under src. */
function readErrorCodes() {
  const codes = [];
  for (const file of walk("src")) {
    if (!SOURCE_FILE.test(file) || TEST_FILE.test(file)) continue;
    const code = stripComments(read(file) ?? "");
    const lists = [
      ...code.matchAll(/export\s+type\s+\w*ErrorCode\w*\s*=([^;]+);/g),
      ...code.matchAll(/export\s+const\s+\w*ERROR_CODES\w*\s*=\s*\[([^\]]*)\]/g),
    ];
    for (const match of lists) {
      for (const literal of match[1].matchAll(/["']([^"']+)["']/g)) codes.push({ file, code: literal[1] });
    }
  }
  return codes;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const docText = read(DOC);
if (docText === null) {
  console.error(`${DOC}: the document does not exist. Fix: restore it, or pass --root <repo>.`);
  process.exit(1);
}
const doc = parseDoc(docText);
const present = doc.filter((line) => !line.planned);
const sectionLines = (number, lines = present) => lines.filter((line) => line.section === number);
const textOf = (lines) => lines.map((line) => line.text).join("\n");

for (const number of [2, 4, 5, 8, 9]) {
  if (sectionLines(number, doc).length === 0) {
    problem(DOC, 0, `Section ${number} ("## ${number}. ...") is missing.`, "keep the document's ten numbered sections.");
  }
}

// a. Route handlers <-> the API contract table.
function documentedRoutes() {
  const rows = [];
  for (const line of sectionLines(4, doc)) {
    const cells = tableCells(line.text);
    if (!cells || cells.length < 2 || isSeparatorRow(cells)) continue;
    const methods = cells[0].replace(/`/g, "").split(/[\s,/]+/).filter((word) => HTTP_METHODS.includes(word));
    const routePath = /`(\/[^`\s]*)`/.exec(cells[1]);
    if (methods.length === 0 || !routePath) continue;
    const stated = /`maxDuration`\s*(?:of|is|=|:)?\s*`?(\d+)/.exec(line.text);
    for (const method of methods) {
      rows.push({
        method,
        path: normalisePath(routePath[1]),
        line: line.number,
        planned: line.planned,
        maxDuration: stated ? Number(stated[1]) : null,
      });
    }
  }
  return rows;
}

const routes = readRoutes();
const rows = documentedRoutes();
const presentRows = rows.filter((row) => !row.planned);
const onDisk = new Set(routes.flatMap((route) => route.methods.map((method) => `${method} ${route.path}`)));

for (const route of routes) {
  for (const method of route.methods) {
    const key = `${method} ${route.path}`;
    if (presentRows.some((row) => `${row.method} ${row.path}` === key)) continue;
    const planned = rows.find((row) => row.planned && `${row.method} ${row.path}` === key);
    if (planned) {
      problem(route.file, null, `${key} exists, but ${DOC}:${planned.line} still lists it inside a planned block.`, "move its row into the API contract table in section 4.");
    } else {
      problem(route.file, null, `${key} is not in the API contract table.`, `add a row for it to ${DOC} section 4 (method, path, auth, input, what it does, what it returns).`);
    }
  }
}
for (const row of presentRows) {
  if (onDisk.has(`${row.method} ${row.path}`)) continue;
  problem(DOC, row.line, `The API contract table lists ${row.method} ${row.path}, but no route handler exports it.`, `remove the row from section 4, or move it into ${PLANNED_HINT} if it is not merged yet.`);
}

// g. maxDuration: the value a row states must be the value the route exports.
for (const row of presentRows) {
  if (row.maxDuration === null) continue;
  const route = routes.find((candidate) => candidate.path === row.path && candidate.methods.includes(row.method));
  if (!route || route.maxDuration === row.maxDuration) continue;
  const actual = route.maxDuration === null ? "exports no maxDuration" : `exports maxDuration = ${route.maxDuration}`;
  problem(route.file, null, `${row.method} ${row.path} ${actual}, but ${DOC}:${row.line} states ${row.maxDuration}.`, "correct the value in that row of section 4.");
}

// b. Server actions are named in the document.
const presentText = textOf(present);
for (const action of readServerActions()) {
  if (hasWord(presentText, action.name)) continue;
  problem(action.file, null, `The server action ${action.name} is not named in ${DOC}.`, 'add it to the "Server actions" table in section 4.');
}

// c. Environment variables <-> section 8.
const envSection = textOf(sectionLines(8));
const envSchema = readEnvSchema();
const envExample = readEnvExample();
for (const [name, file] of envSchema) {
  if (!hasWord(envSection, name)) {
    problem(file, null, `The environment variable ${name} is in the env schema but not in ${DOC} section 8.`, "add a row for it to the table in section 8.");
  }
}
for (const name of envExample) {
  if (!envSchema.has(name) && !hasWord(envSection, name)) {
    problem(".env.example", null, `The environment variable ${name} is in .env.example but not in ${DOC} section 8.`, "add a row for it to the table in section 8.");
  }
}

/** Names in the first column of the section 8 tables whose first header cell is "Name". */
function documentedEnvNames() {
  const names = [];
  let inNameTable = false;
  let previousWasRow = false;
  for (const line of sectionLines(8)) {
    const cells = tableCells(line.text);
    if (!cells) {
      previousWasRow = false;
      inNameTable = false;
      continue;
    }
    if (!previousWasRow) inNameTable = cells[0].replace(/[`*]/g, "").trim().toLowerCase() === "name";
    else if (inNameTable && !isSeparatorRow(cells)) {
      for (const match of cells[0].matchAll(/`([^`]+)`/g)) {
        if (ENV_NAME.test(match[1])) names.push({ name: match[1], line: line.number });
      }
    }
    previousWasRow = true;
  }
  return names;
}

const codeText = readCodeText();
for (const { name, line } of documentedEnvNames()) {
  if (envSchema.has(name) || envExample.includes(name) || hasWord(codeText, name)) continue;
  problem(DOC, line, `Section 8 names the environment variable ${name}, but src/lib/env.ts, .env.example and the code do not.`, `remove the row, or move it into ${PLANNED_HINT} if it is not merged yet.`);
}

// d. Folders under src/lib and src/app/api <-> the project layout tree.
/** The entries of the fenced tree(s) in section 2: two spaces of indent per level, the name before the description. */
function layoutEntries() {
  const entries = [];
  const stack = [];
  let lastIndent = 0;
  for (const line of sectionLines(2)) {
    if (!line.fenced || line.text.trim().startsWith("```")) {
      if (!line.fenced) stack.length = 0;
      continue;
    }
    if (line.text.trim() === "") continue;
    const indent = line.text.length - line.text.trimStart().length;
    if (stack.length > 0 && indent > lastIndent + 2) continue; // a wrapped description
    const label = line.text.trim().split(/\s{2,}/)[0];
    const level = Math.floor(indent / 2);
    stack.length = Math.min(stack.length, level);
    const parent = stack.join("/");
    const names = label.split(",").map((name) => name.trim()).filter(Boolean);
    for (const name of names) {
      const clean = name.replace(/\/+$/, "");
      entries.push({ path: parent ? `${parent}/${clean}` : clean, line: line.number });
    }
    stack.push(names[0].replace(/\/+$/, ""));
    lastIndent = indent;
  }
  return entries;
}

const layout = layoutEntries();
const layoutText = textOf(sectionLines(2));
for (const parent of ["src/app/api", "src/lib"]) {
  for (const name of subfolders(parent)) {
    const folder = `${parent}/${name}`;
    const listed = layout.some((entry) => entry.path === folder || entry.path.startsWith(`${folder}/`));
    if (listed || layoutText.includes(`${folder}/`)) continue;
    problem(folder, null, `The folder ${folder}/ is not in the project layout.`, `add it under ${parent.replace(/^src\//, "")}/ in the tree in ${DOC} section 2, with one line on what it holds.`);
  }
}
for (const entry of layout) {
  if (/[*<>{}…]/.test(entry.path) || exists(entry.path)) continue;
  problem(DOC, entry.line, `The project layout lists ${entry.path}, which does not exist.`, `remove or rename the line in section 2, or move it into ${PLANNED_HINT} if it is not merged yet.`);
}

// e. AI_MODELS keys and slugs are in the model-calls section.
const modelSection = textOf(sectionLines(5));
const ai = readAiModels();
// No AI_MODELS object means the app makes no model call yet, so there is nothing to name.
if (ai.models !== null) {
  for (const { key, slug } of ai.models) {
    if (!modelSection.includes(`AI_MODELS.${key}`)) {
      problem(ai.file, null, `AI_MODELS.${key} is not named in ${DOC} section 5.`, `name \`AI_MODELS.${key}\` in the model-calls table in section 5.`);
    }
    if (!modelSection.includes(slug)) {
      problem(ai.file, null, `The model "${slug}" (AI_MODELS.${key}) is not in ${DOC} section 5.`, "write the model string in section 5.");
    }
  }
}

// f. Error codes are in the errors section.
const errorSection = textOf(sectionLines(9));
const seenCodes = new Set();
for (const { file, code } of readErrorCodes()) {
  if (seenCodes.has(code)) continue;
  seenCodes.add(code);
  if (errorSection.includes(`\`${code}\``)) continue;
  problem(file, null, `The error code "${code}" is not in ${DOC} section 9.`, `add \`${code}\` with its status to the error-code table in section 9.`);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

problems.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0)));
for (const item of problems) {
  console.error(`${item.file}${item.line ? `:${item.line}` : ""}: ${item.text}`);
}
if (problems.length > 0) {
  console.error(`docs:check failed: ${problems.length} problem${problems.length === 1 ? "" : "s"}. ${DOC} must change in the same pull request as the backend.`);
  process.exit(1);
}
const methodCount = routes.reduce((count, route) => count + route.methods.length, 0);
console.log(
  `docs:check passed: ${methodCount} route methods, ${readServerActions().length} server actions, ${new Set([...envSchema.keys(), ...envExample]).size} environment variables, ${subfolders("src/lib").length + subfolders("src/app/api").length} folders, ${ai.models?.length ?? 0} models and ${seenCodes.size} error codes are named in ${DOC}.`,
);
