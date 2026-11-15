import { AI_MODELS } from "@/lib/config";
import { fakeRadarReply } from "./fake-model";
import { generateStructured } from "./generate";
import { contactDetails, quotesContactDetails, RADAR_INSTRUCTIONS, radarPrompt } from "./prompts";
import { radarResultsSchema, type RadarResults } from "./schemas";

/**
 * Internal to the screening pipeline: only src/lib/screening/analyze.ts may
 * import this (enforced by screening/boundary.test.ts). `otherResumeTexts` are
 * the job's other resumes; only a body excerpt of the first few is sent, with
 * contact details removed (prompts.ts `excerpt`). A note that still quotes
 * another candidate's email address or phone number is dropped.
 */
export async function runRadar(
  resumeText: string,
  otherResumeTexts: readonly string[],
  abortSignal?: AbortSignal,
): Promise<RadarResults> {
  const radar = await generateStructured({
    slug: AI_MODELS.radar,
    instructions: RADAR_INSTRUCTIONS,
    prompt: radarPrompt(resumeText, otherResumeTexts),
    schema: radarResultsSchema,
    fake: fakeRadarReply,
    abortSignal,
  });
  const others = otherResumeTexts.map(contactDetails);
  const details = {
    emails: others.flatMap((other) => other.emails),
    phones: others.flatMap((other) => other.phones),
  };
  const clean = (flag: RadarResults["copycat"]) =>
    quotesContactDetails(flag.note, details) ? { ...flag, note: "" } : flag;
  return {
    copycat: clean(radar.copycat),
    employment_gaps: clean(radar.employment_gaps),
    job_hopping: clean(radar.job_hopping),
    ai_written: clean(radar.ai_written),
  };
}
