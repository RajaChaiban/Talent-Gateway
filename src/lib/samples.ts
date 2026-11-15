/** Where the sample files are served from: static files under `public/samples/`. */
export const SAMPLES_PATH = "/samples";

/** The job description the sample resumes are written for. */
export const SAMPLE_JOB_DESCRIPTION = "sample-job-description.txt";

/** All the sample files in one download. */
export const SAMPLE_ZIP = "sample-resumes.zip";

/** The sample resumes and what each one shows, in the order a reviewer should try them. */
export const SAMPLE_RESUMES = [
  { file: "1-strong-match.pdf", shows: "A strong match: ready, scored high" },
  { file: "2-good-match-other-stack.pdf", shows: "A good match on another stack: ready, scored in the middle" },
  { file: "3-vague-claims.pdf", shows: "Right skills but vague claims: ready, scored lower" },
  { file: "4-related-role.pdf", shows: "A related role (QA automation): ready, scored low to middle" },
  { file: "5-unrelated-role.pdf", shows: "An unrelated role (product manager): ready, scored low" },
  { file: "6-no-email-no-phone.pdf", shows: "No email and no phone: set aside as Not ATS-ready" },
  { file: "7-with-photo.pdf", shows: "A portrait in the CV: set aside as Not ATS-ready" },
] as const;

export function samplePath(file: string): string {
  return `${SAMPLES_PATH}/${file}`;
}
