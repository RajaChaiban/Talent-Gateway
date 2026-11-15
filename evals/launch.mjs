// Starts `npm run eval` and `npm run eval:compare`: loads evals/run.ts or
// evals/compare-run.ts through Vite's server-side module loader (the Vite
// that Vitest already ships, reached through `vitest/node`), which compiles
// the TypeScript and resolves the `@/` alias the same way the unit tests do.
// Packages load from node_modules as plain Node modules. No dev server is
// opened: middleware mode, no HMR, no web socket.
//
//   node evals/launch.mjs run --label baseline [--model <provider/model>] [--runs <n>] [--files <dir>] [--only <n,...>]
//   node evals/launch.mjs compare <a.json> <b.json>

import path from "node:path";
import { createViteServer } from "vitest/node";

const ENTRIES = { run: "/evals/run.ts", compare: "/evals/compare-run.ts" };

const root = path.resolve(import.meta.dirname, "..");
const [entry, ...argv] = process.argv.slice(2);

if (!Object.hasOwn(ENTRIES, entry ?? "")) {
  console.error(`Usage: node evals/launch.mjs <${Object.keys(ENTRIES).join("|")}> [arguments]`);
  process.exit(2);
}

const server = await createViteServer({
  root,
  configFile: false,
  logLevel: "warn",
  appType: "custom",
  resolve: { alias: { "@": path.join(root, "src") } },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const { main } = await server.ssrLoadModule(ENTRIES[entry]);
  process.exitCode = await main(argv, root);
} catch (error) {
  console.error(error);
  process.exitCode = 2;
} finally {
  await server.close();
}
