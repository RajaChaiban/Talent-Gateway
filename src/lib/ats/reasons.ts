import type { AtsCheckId, AtsConfig } from "@/lib/config";

const BYTES_PER_MB = 1024 * 1024;
const MAX_DECIMALS = 4;

export type Measured = {
  readableChars: number;
  textMissing: boolean;
  sectionCount: number;
  ratio: number;
  typeMissing: boolean;
  supportedType: boolean;
  sizeKnown: boolean;
  sizeBytes: number;
  acceptableSize: boolean;
};

/**
 * Formats a value that is over a limit so it never reads as equal to the limit: more
 * decimals are added until the rounded number is larger, and null means "just over".
 */
function overLimit(value: number, limit: number): string | null {
  for (let decimals = 1; decimals <= MAX_DECIMALS; decimals += 1) {
    const text = value.toFixed(decimals);
    if (Number(text) > limit) return String(Number(text));
  }
  return null;
}

function trimmedNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(MAX_DECIMALS)));
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function typeList(config: AtsConfig): string {
  const labels = config.allowedContentTypes.map((type) => config.contentTypeLabels[type] ?? type);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

function noiseReason(ratio: number, config: AtsConfig): string {
  const limit = config.maxSymbolRatio * 100;
  const shown = overLimit(ratio * 100, limit);
  const limitText = `${trimmedNumber(limit)}%`;
  const tail =
    "which usually means a table or multi-column layout that did not read cleanly.";
  return shown === null
    ? `Just over ${limitText} of the characters are stray symbols rather than text, ${tail}`
    : `About ${shown}% of the characters are stray symbols rather than text (the limit is ${limitText}), ${tail}`;
}

function fileReason(m: Measured, config: AtsConfig): string {
  const problems: string[] = [];
  if (m.typeMissing) {
    problems.push("has no known file type");
  } else if (!m.supportedType) {
    problems.push(`is not a ${typeList(config)} document`);
  }
  if (!m.acceptableSize) {
    const limitMb = config.maxFileBytes / BYTES_PER_MB;
    const limitText = `${trimmedNumber(limitMb)} MB`;
    if (!m.sizeKnown) {
      problems.push("has an unknown size");
    } else {
      const shown = overLimit(m.sizeBytes / BYTES_PER_MB, limitMb);
      problems.push(
        shown === null
          ? `is just over the ${limitText} limit`
          : `is ${shown} MB, over the ${limitText} limit`,
      );
    }
  }
  return `This file ${problems.join(" and ")}.`;
}

export function reasonFor(id: AtsCheckId, m: Measured, config: AtsConfig): string {
  switch (id) {
    case "readable_text":
      if (m.textMissing) return "No text was provided for this resume, so it cannot be checked.";
      return m.readableChars === 0
        ? "No text could be read, so this looks like a scanned image or a broken file."
        : `Only ${plural(m.readableChars, "character")} of text could be read, so this looks like a scanned image or a broken file.`;
    case "contact_info":
      return "No email address was found, so there is no way to contact this candidate from the resume.";
    case "standard_sections":
      return `Only ${m.sectionCount} of the standard sections (${config.requiredSections.join(", ")}) appear as headings; at least ${config.minSections} are expected.`;
    case "layout_noise":
      return noiseReason(m.ratio, config);
    case "file":
      return fileReason(m, config);
  }
}
