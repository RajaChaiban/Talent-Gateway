import { z } from "zod";

const flag = z.object({ flagged: z.boolean(), note: z.string() });

export type RadarResults = Partial<Record<"copycat" | "employment_gaps" | "job_hopping" | "ai_written", z.infer<typeof flag>>>;

export const RADAR_FLAGS = [
  { key: "copycat", label: "Copycat" },
  { key: "employment_gaps", label: "Employment gaps" },
  { key: "job_hopping", label: "Job hopping" },
  { key: "ai_written", label: "AI-written" },
] as const;

export type RadarChip = { key: (typeof RADAR_FLAGS)[number]["key"]; label: string; note: string };

/**
 * The `radar_results` jsonb read safely. Each flag is checked on its own, so one
 * malformed flag does not hide the valid ones; an empty object, a missing flag or
 * anything that is not an object means "nothing flagged".
 */
export function parseRadarResults(value: unknown): RadarResults {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const stored = value as Record<string, unknown>;
  const radar: RadarResults = {};
  for (const { key } of RADAR_FLAGS) {
    const parsed = flag.safeParse(stored[key]);
    if (parsed.success) radar[key] = parsed.data;
  }
  return radar;
}

/** One chip per flag that is set, in a fixed order. */
export function radarChips(radar: RadarResults): RadarChip[] {
  return RADAR_FLAGS.flatMap(({ key, label }) => {
    const entry = radar[key];
    return entry?.flagged ? [{ key, label, note: entry.note }] : [];
  });
}
