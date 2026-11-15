import type { AtsCheckId, AtsConfig } from "@/lib/config";

export const CHECK_IDS: readonly AtsCheckId[] = [
  "readable_text",
  "contact_info",
  "phone",
  "standard_sections",
  "layout_noise",
  "file",
  "picture",
];

const WEIGHT_TOTAL = 100;
const WEIGHT_TOLERANCE = 1e-9;

const validated = new WeakSet<AtsConfig>();

function fail(field: string, rule: string): never {
  throw new Error(`Invalid ATS config: ${field} ${rule}.`);
}

function checkNumber(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(field, "must be a finite number");
  }
  if (value < min || value > max) {
    return fail(field, `must be between ${min} and ${max}`);
  }
  return value;
}

/**
 * Throws an error naming the first invalid field. Runs once per config object: a config
 * that has passed is remembered by identity, so the default config is checked on first use only.
 */
export function assertValidConfig(config: AtsConfig): void {
  if (validated.has(config)) return;

  checkNumber(config.minTextChars, "minTextChars", 0, Number.MAX_SAFE_INTEGER);
  checkNumber(config.minSections, "minSections", 0, Number.MAX_SAFE_INTEGER);
  checkNumber(config.maxHeadingChars, "maxHeadingChars", 1, Number.MAX_SAFE_INTEGER);
  checkNumber(config.maxSymbolRatio, "maxSymbolRatio", 0, 1);
  checkNumber(config.maxFileBytes, "maxFileBytes", 0, Number.MAX_SAFE_INTEGER);
  checkNumber(config.maxImages, "maxImages", 0, Number.MAX_SAFE_INTEGER);
  if (!Number.isInteger(config.maxImages)) fail("maxImages", "must be a whole number");
  checkNumber(config.passScore, "passScore", 0, 100);

  if (!Array.isArray(config.requiredSections)) fail("requiredSections", "must be a list");
  if (!Array.isArray(config.allowedContentTypes)) fail("allowedContentTypes", "must be a list");
  if (typeof config.sectionHeadings !== "object" || config.sectionHeadings === null) {
    fail("sectionHeadings", "must be an object");
  }
  if (typeof config.contentTypeLabels !== "object" || config.contentTypeLabels === null) {
    fail("contentTypeLabels", "must be an object");
  }
  if (typeof config.weights !== "object" || config.weights === null) {
    fail("weights", "must be an object");
  }
  if (typeof config.required !== "object" || config.required === null) {
    fail("required", "must be an object");
  }

  let total = 0;
  for (const id of CHECK_IDS) {
    total += checkNumber(config.weights[id], `weights.${id}`, 0, WEIGHT_TOTAL);
    if (typeof config.required[id] !== "boolean") fail(`required.${id}`, "must be true or false");
  }
  if (Math.abs(total - WEIGHT_TOTAL) > WEIGHT_TOLERANCE) {
    fail("weights", `must add up to ${WEIGHT_TOTAL}, but add up to ${total}`);
  }

  validated.add(config);
}
