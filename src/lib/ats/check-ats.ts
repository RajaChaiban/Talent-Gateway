import { ATS_CONFIG, type AtsCheckId, type AtsConfig } from "@/lib/config";
import { countEmails } from "./email";
import { findSections } from "./headings";
import { findPhoneNumbers } from "./phone";
import { reasonFor, type Measured } from "./reasons";
import { scanText } from "./text-scan";
import type { AtsInput, AtsResult, CheckResult } from "./types";
import { assertValidConfig } from "./validate-config";

const NON_ASCII = /[\u0080-￿]/;

/** NFC-normalises the text, so decomposed accents match precomposed ones; ASCII text is left as is. */
function normalise(text: string): string {
  return NON_ASCII.test(text) ? text.normalize("NFC") : text;
}

function isSupportedType(contentType: string, config: AtsConfig): boolean {
  const type = contentType.split(";", 1)[0].trim().toLowerCase();
  return config.allowedContentTypes.includes(type);
}

/**
 * Decides whether a resume is readable enough to send to the AI. Email, phone number and
 * no picture are required: a resume missing one is set aside whatever its score. Pure: no I/O, no clock,
 * and every threshold and weight comes from `config`, which is validated first (an invalid
 * config throws an error naming the field). Every check always runs.
 *
 * ATS_READY needs every required check to pass and the score to reach passScore. Input
 * that is not the declared type (a null text or content type from a database row) fails
 * the matching check with a reason instead of throwing.
 *
 * Text length counts visible code points, with a run of whitespace counting as one. An empty
 * text has no visible characters, so layout_noise passes and readable_text reports the problem.
 */
export function checkAts(input: AtsInput, config: AtsConfig = ATS_CONFIG): AtsResult {
  assertValidConfig(config);

  const textMissing = typeof input.text !== "string";
  const text = normalise(typeof input.text === "string" ? input.text : "");
  const scan = scanText(text);
  const emails = countEmails(text);
  const sections = findSections(text, config);
  const ratio = scan.visibleChars === 0 ? 0 : scan.noiseChars / scan.visibleChars;

  const typeMissing = typeof input.contentType !== "string";
  const supportedType =
    typeof input.contentType === "string" && isSupportedType(input.contentType, config);
  const sizeKnown =
    typeof input.sizeBytes === "number" && Number.isFinite(input.sizeBytes) && input.sizeBytes >= 0;
  const acceptableSize = sizeKnown && input.sizeBytes <= config.maxFileBytes;
  const phones = findPhoneNumbers(text).length;
  // Anything but a count (null from a row saved before pictures were counted) is "not counted".
  const imageCount =
    typeof input.imageCount === "number" && Number.isFinite(input.imageCount) && input.imageCount >= 0
      ? input.imageCount
      : 0;

  const measured: Measured = {
    readableChars: scan.readableChars,
    textMissing,
    sectionCount: sections.length,
    ratio,
    typeMissing,
    supportedType,
    sizeKnown,
    sizeBytes: input.sizeBytes,
    acceptableSize,
    imageCount,
  };

  const outcomes: Array<[AtsCheckId, boolean, number]> = [
    ["readable_text", !textMissing && scan.readableChars >= config.minTextChars, scan.readableChars],
    ["contact_info", emails > 0, emails],
    ["phone", phones > 0, phones],
    ["standard_sections", sections.length >= config.minSections, sections.length],
    ["layout_noise", ratio <= config.maxSymbolRatio, ratio],
    ["file", supportedType && acceptableSize, sizeKnown ? input.sizeBytes : 0],
    ["picture", imageCount <= config.maxImages, imageCount],
  ];
  const checks: CheckResult[] = outcomes.map(([id, passed, value]) => ({
    id,
    passed,
    weight: config.weights[id],
    required: config.required[id],
    value,
  }));

  const score = Math.round(checks.reduce((sum, c) => (c.passed ? sum + c.weight : sum), 0));
  const requiredPassed = checks.every((c) => c.passed || !c.required);

  return {
    status: requiredPassed && score >= config.passScore ? "ATS_READY" : "NOT_ATS_READY",
    score,
    reasons: checks.filter((c) => !c.passed).map((c) => reasonFor(c.id, measured, config)),
    checks,
  };
}
