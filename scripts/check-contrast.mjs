// Prints the WCAG 2.x contrast ratio of every color pair the design guide
// promises (docs/DESIGN.md, "Contrast") for both themes, read straight from
// the tokens in src/app/globals.css. Exits 1 if any pair is below its minimum.
//
//   npm run design:contrast
//
// Plain Node, no dependencies. Tokens must resolve to opaque #rrggbb values.

import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

/** Text needs 4.5:1; control boundaries and focus rings need 3:1. */
const TEXT = 4.5;
const UI = 3;

const PAIRS = [
  // [foreground token, background token, minimum, what it is]
  ["foreground", "background", TEXT, "body text"],
  ["foreground", "background-subtle", TEXT, "body text on the subtle page"],
  ["card-foreground", "card", TEXT, "text on a card"],
  ["muted-foreground", "background", TEXT, "muted text"],
  ["muted-foreground", "background-subtle", TEXT, "muted text on the subtle page"],
  ["muted-foreground", "card", TEXT, "muted text on a card"],
  ["muted-foreground", "muted", TEXT, "muted text on a muted fill"],
  ["primary-foreground", "primary", TEXT, "primary button label / default badge"],
  ["primary-foreground", "primary-hover", TEXT, "primary button label, hovered"],
  ["secondary-foreground", "background", TEXT, "outline / ghost button label at rest"],
  ["secondary-foreground", "secondary", TEXT, "secondary button label / secondary badge"],
  ["secondary-foreground", "secondary-hover", TEXT, "button label, hovered"],
  ["secondary-foreground", "secondary-active", TEXT, "button label, pressed or expanded"],
  ["disabled-foreground", "disabled", TEXT, "disabled / pending label"],
  ["disabled-foreground", "background", TEXT, "disabled ghost / link label"],
  ["link", "background", TEXT, "accent as link text"],
  ["link", "card", TEXT, "accent as link text on a card"],
  ["error", "card", TEXT, "error text on a card"],
  ["error", "error-subtle", TEXT, "error alert text"],
  ["error", "background", TEXT, "field error / save error text"],
  ["destructive-foreground", "destructive", TEXT, "destructive button label"],
  ["destructive-foreground", "destructive-hover", TEXT, "destructive button label, hovered"],
  ["success", "success-subtle", TEXT, "success text on its fill"],
  ["warning", "warning-subtle", TEXT, "warning text on its fill"],
  ["success", "card", TEXT, "success text on a card"],
  ["warning", "card", TEXT, "warning text on a card"],
  ["status-green", "background", TEXT, "green status text"],
  ["status-amber", "background", TEXT, "amber status text"],
  ["status-red", "background", TEXT, "red status text"],
  ["input", "background", UI, "input border"],
  ["input", "card", UI, "input border on a card"],
  ["input", "background-subtle", UI, "input border on the subtle page"],
  ["input-hover", "background", UI, "input border, hovered"],
  ["input-hover", "card", UI, "input border on a card, hovered"],
  ["input-hover", "background-subtle", UI, "input border on the subtle page, hovered"],
  ["error", "card", UI, "invalid input border on a card"],
  ["error", "background", UI, "invalid input border"],
  ["slider-track", "card", UI, "slider track on its panel"],
  ["slider-range", "card", UI, "slider filled range on its panel"],
  ["slider-thumb-border", "card", UI, "slider thumb edge on its panel"],
  ["slider-thumb", "slider-track", UI, "slider thumb against the track"],
  ["status-green", "card", UI, "green status dot on a card"],
  ["status-amber", "card", UI, "amber status dot on a card"],
  ["status-red", "card", UI, "red status dot on a card"],
  ["status-green", "background-subtle", UI, "green status dot on the subtle page"],
  ["status-amber", "background-subtle", UI, "amber status dot on the subtle page"],
  ["status-red", "background-subtle", UI, "red status dot on the subtle page"],
  ["ring", "background", UI, "focus ring"],
  ["ring", "card", UI, "focus ring on a card"],
  ["ring", "background-subtle", UI, "focus ring on the subtle page"],
];

/** Collects `--name: value;` declarations from a block of CSS. */
function declarations(block) {
  const out = {};
  for (const [, name, value] of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
}

/** The body of the first `{ ... }` after `start`, with nested braces balanced. */
function blockAfter(start) {
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") depth -= 1;
    if (depth === 0) return css.slice(open + 1, i);
  }
  throw new Error("Unbalanced braces in globals.css");
}

const darkAt = css.search(/^@media \(prefers-color-scheme: dark\)\s*\{/m);
if (darkAt === -1) throw new Error("No dark-theme block found in globals.css");

// Every top-level `:root { }` outside the dark media query is the light theme;
// the dark theme is the light theme with the media query's overrides on top.
const light = {};
for (const match of css.matchAll(/^:root\s*\{/gm)) {
  Object.assign(light, declarations(blockAfter(match.index)));
}
const dark = { ...light, ...declarations(blockAfter(darkAt)) };

function resolve(theme, name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`Circular token --${name}`);
  seen.add(name);
  const value = theme[name];
  if (value === undefined) throw new Error(`Unknown token --${name}`);
  const ref = value.match(/^var\(--([a-z0-9-]+)\)$/);
  if (ref) return resolve(theme, ref[1], seen);
  if (!/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`--${name} is "${value}"; the check needs an opaque #rrggbb value`);
  }
  return value;
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

let failures = 0;
for (const [label, theme] of [
  ["Light", light],
  ["Dark", dark],
]) {
  console.log(`\n${label} theme`);
  console.log("  ratio  min  pair");
  for (const [fg, bg, min, what] of PAIRS) {
    const value = ratio(resolve(theme, fg), resolve(theme, bg));
    const ok = value >= min;
    if (!ok) failures += 1;
    console.log(
      `  ${value.toFixed(2).padStart(5)}  ${min.toFixed(1)}  ${ok ? "pass" : "FAIL"}  ${fg} on ${bg} (${what})`,
    );
  }
}

if (failures > 0) {
  console.error(`\n${failures} pair(s) below the WCAG AA minimum.`);
  process.exit(1);
}
console.log(`\nAll ${PAIRS.length * 2} pairs meet WCAG AA.`);
