import { asStored, type StoredScore } from "./score";

/** The product's display name. Read it from here; never write the name into a component. */
export const APP_NAME = "Talent Gateway";
/** The one-line product description used for the page metadata and the landing page. */
export const APP_DESCRIPTION =
  "Intelligent resume screening and candidate ranking for modern hiring teams.";

/** What a resume file may be. The `resumes` Storage bucket enforces the same type list and size. */
export const UPLOAD_LIMITS = {
  allowedMimeTypes: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  maxBytes: 5 * 1024 * 1024,
} as const;

/**
 * Limits for uploading and reading resumes, shared by the browser queue, the sign and complete routes and the text readers.
 * Each cap keeps one untrusted file from costing unbounded time or memory.
 */
export const RESUME_LIMITS = {
  maxFilesPerDrop: 20,
  maxPerJob: 50,
  uploadConcurrency: 3,
  extractTimeoutMs: 8_000,
  /** A PDF with more pages than this is refused before any text is read. */
  maxPdfPages: 40,
  /** A DOCX whose zip lists more entries than this is refused before inflation. */
  maxDocxEntries: 500,
  /**
   * The XML parts of a DOCX (word/document.xml, styles, relationships: everything the Word
   * parser can read) may inflate to this much together. A resume's XML is tens to a few
   * hundred KB. Measured at the cap with the densest markup: 0.4 to 0.5 s and 86 to 107 MB
   * of extra memory (60 KB: 0.1 s and 12 MB). Without the cap 1 MB cost about 1 to 1.5 s
   * and 173 MB, 3 MB 2.7 to 4 s and 340 to 408 MB.
   */
  maxDocxMarkupBytes: 512 * 1024,
  /** Every entry of a DOCX together, pictures included (they are checked, never parsed). */
  maxDocxUncompressedBytes: 8 * 1024 * 1024,
  maxFileNameLength: 100,
  /** A request that takes longer is abandoned and counted as a lost connection, so a hung one cannot hold a queue slot. */
  requestTimeoutMs: { api: 60_000, upload: 120_000 },
  /** A signed upload token lasts two hours; past this age the file is signed again before its upload is retried. */
  signedUploadMaxAgeMs: 90 * 60_000,
  retry: { maxAttempts: 5, baseMs: 1_000, capMs: 30_000, maxRetryAfterMs: 60_000 },
} as const;

/** Score bands stored in tenths (0 to 100), representing 0.0 to 10.0 */
const SCORE_BANDS = {
  /** Top talent: >= 8.0 (green), Consider: 5.0 - 7.9 (amber), Low match: < 5.0 (red) */
  trafficLight: { green: asStored(80), amber: asStored(50) },
} as const;

/** A new job starts with top talent at 8.0 and invite bar at 7.0 */
export const JOB_THRESHOLD_DEFAULTS = {
  topTalent: asStored(80),
  invite: asStored(70),
} as const;

/** The ids of the seven ATS checks. Each has a weight and a required flag in `ATS_CONFIG`. */
export type AtsCheckId =
  | "readable_text"
  | "contact_info"
  | "phone"
  | "standard_sections"
  | "layout_noise"
  | "file"
  | "picture";

/** The rules the ATS check judges a resume by. They are data, so a rule is tuned here without touching the check's code. */
export interface AtsConfig {
  /** Fewer characters than this after collapsing whitespace fails readable_text. */
  readonly minTextChars: number;
  /** Section names that count towards standard_sections; each needs an entry in sectionHeadings. */
  readonly requiredSections: readonly string[];
  /** Fewer distinct required sections than this fails standard_sections. */
  readonly minSections: number;
  /**
   * Heading variants per section: lower case, letters and spaces only, "and" for "&",
   * accents written as precomposed letters. A heading joining two known variants with
   * "&", "/", "and", "et", "y" or "und" counts for both sections.
   */
  readonly sectionHeadings: Readonly<Record<string, readonly string[]>>;
  /** A heading line is at most this many characters, decoration included. */
  readonly maxHeadingChars: number;
  /** A larger share of visible characters that are structural noise rather than text fails layout_noise. */
  readonly maxSymbolRatio: number;
  /** Accepted content types, lower case. */
  readonly allowedContentTypes: readonly string[];
  /** Recruiter-facing name of each accepted content type, used in reasons. */
  readonly contentTypeLabels: Readonly<Record<string, string>>;
  /** A larger file fails the file check. */
  readonly maxFileBytes: number;
  /** More pictures than this in the file fails the picture check; an uncounted file passes. */
  readonly maxImages: number;
  /** Points each passed check adds to the score; the weights are not negative and sum to 100. */
  readonly weights: Readonly<Record<AtsCheckId, number>>;
  /** Checks that must pass for ATS_READY whatever the score. */
  readonly required: Readonly<Record<AtsCheckId, boolean>>;
  /** Minimum score for ATS_READY, from 0 to 100. */
  readonly passScore: number;
}

function deepFreeze<T extends object>(value: T): T {
  for (const child of Object.values(value)) {
    if (typeof child === "object" && child !== null) deepFreeze(child);
  }
  return Object.freeze(value);
}

/**
 * The ATS check's settings, frozen so nothing can change them at run time.
 * The weights add up to 100 and a resume is ATS_READY from 60 (6.0 on the 0 to 10 scale) with every required check passed.
 */
export const ATS_CONFIG: AtsConfig = deepFreeze({
  minTextChars: 300,
  requiredSections: ["experience", "education", "skills"],
  minSections: 2,
  sectionHeadings: {
    experience: [
      "experience",
      "work experience",
      "professional experience",
      "relevant experience",
      "employment",
      "employment history",
      "work history",
      "career history",
      "professional background",
      "professional history",
      "expérience",
      "expérience professionnelle",
      "experience professionnelle",
      "expériences professionnelles",
      "parcours professionnel",
      "experiencia",
      "experiencia profesional",
      "experiencia laboral",
      "berufserfahrung",
      "berufliche erfahrung",
      "arbeitserfahrung",
      "beruflicher werdegang",
    ],
    education: [
      "education",
      "academic background",
      "academic qualifications",
      "education and training",
      "education and qualifications",
      "educational background",
      "qualifications",
      "formation",
      "formations",
      "éducation",
      "formation et diplômes",
      "études",
      "educación",
      "educacion",
      "formación",
      "formacion",
      "formación académica",
      "estudios",
      "ausbildung",
      "bildung",
      "bildungsweg",
      "akademische ausbildung",
    ],
    skills: [
      "skills",
      "technical skills",
      "key skills",
      "core skills",
      "core competencies",
      "skills and expertise",
      "skills and tools",
      "professional skills",
      "competencies",
      "compétences",
      "competences",
      "compétences clés",
      "compétences techniques",
      "habilidades",
      "competencias",
      "habilidades técnicas",
      "habilidades y competencias",
      "conocimientos",
      "kenntnisse",
      "fähigkeiten",
      "fahigkeiten",
      "kenntnisse und fähigkeiten",
      "fachkenntnisse",
      "edv kenntnisse",
    ],
  },
  maxHeadingChars: 50,
  maxSymbolRatio: 0.15,
  allowedContentTypes: [...UPLOAD_LIMITS.allowedMimeTypes],
  contentTypeLabels: {
    "application/pdf": "PDF",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word (DOCX)",
  },
  maxFileBytes: UPLOAD_LIMITS.maxBytes,
  maxImages: 0,
  weights: {
    readable_text: 15,
    file: 5,
    contact_info: 15,
    phone: 10,
    picture: 10,
    standard_sections: 25,
    layout_noise: 20,
  },
  required: {
    readable_text: true,
    file: true,
    contact_info: true,
    phone: true,
    picture: true,
    standard_sections: false,
    layout_noise: false,
  },
  /** Stored tenths: 6.0 on the 0 to 10 scale. Ready needs this and every required check passing. */
  passScore: 60,
});

/** The colour band of a match score: green is top talent, amber is worth a look, red is a low match. */
export type TrafficLight = "green" | "amber" | "red";

/** The band a stored score falls in, using the cut-offs in `SCORE_BANDS` (8.0 and 5.0). */
export function trafficLight(score: StoredScore): TrafficLight {
  if (score >= SCORE_BANDS.trafficLight.green) return "green";
  if (score >= SCORE_BANDS.trafficLight.amber) return "amber";
  return "red";
}

/**
 * Vercel AI Gateway model slugs ("provider/model"). Authenticated by the
 * project OIDC token (VERCEL_OIDC_TOKEN); the app holds no provider keys.
 *
 * DECISION: the slug is plain config, not code. Swapping a model or a provider
 * is a one-line change here, and every call goes through the gateway, so
 * spend and failures are visible in one place.
 */
export const AI_MODELS = {
  /** scoreResume: match score, summary, strengths, gaps. */
  scoring: "anthropic/claude-haiku-5.5",
  /** runRadar: copycat, employment gaps, job hopping, AI-written. */
  radar: "anthropic/claude-haiku-5.5",
} as const;

/**
 * Limits for the screening model calls. Everything sent to a model is capped,
 * and one model call (both parse attempts and the SDK's own retry included)
 * shares one abort budget that stays well under the analyze routes' 60 s
 * `maxDuration`.
 */
export const SCREENING_AI_LIMITS = {
  /** Abort budget for one scoreResume or runRadar call, all attempts included. */
  callTimeoutMs: 25_000,
  /** Transport retries the AI SDK makes for a retryable error (5xx, 429) inside the budget. */
  maxRetries: 1,
  /** Attempts when the model's answer fails its schema: the first try plus one retry. */
  parseAttempts: 2,
  /** Characters of the job description sent to the model; the rest is cut. */
  jobDescriptionMaxChars: 8_000,
  /** Characters of the resume sent to the model; the rest is cut. */
  resumeMaxChars: 12_000,
  /** At most this many of the job's other resumes are compared for copycat text. */
  radarOthersMax: 8,
  /** Each other resume is sent as an excerpt of its body of at most this many characters. */
  radarExcerptChars: 600,
  /** Lines at the top of another resume (name, title, contact details) left out of its excerpt. */
  radarSkipHeaderLines: 3,
  /** Strengths and gaps: at most this many items, each at most listItemMaxChars. */
  listMaxItems: 5,
  listItemMaxChars: 200,
  summaryMaxChars: 600,
  radarNoteMaxChars: 200,
  fullNameMaxChars: 120,
  /** The model lists one item per must-have of the job description: at least 1, at most mustHavesMax. */
  mustHavesMax: 12,
  mustHaveMaxChars: 120,
} as const;

/**
 * How a match score is added up from the parts the scoring model returns
 * (`totalScore` in src/lib/ai/total-score.ts). Every number is on the 0 to 10
 * scale. The model classifies and gives part-scores; the code adds them up.
 *
 * total = start + (skills + evidence + proofOfWork + education) x start / 5,
 * so a resume whose most recent title is the job's role starts at 5.0 and can
 * reach 10.0, and one that starts lower earns the additions in proportion.
 */
export const SCORE_WEIGHTS = {
  /** The start score by role match: exactly `same`, or the model's value clamped to the range. */
  start: {
    same: 5,
    related: { min: 2.5, max: 4 },
    unrelated: { min: 0, max: 1.5 },
  },
  /** The skills part when every must-have is shown. */
  skillsMax: 3,
  /** The share of a must-have's skills points, by its status. */
  mustHaveStatus: { shown: 1, equivalent: 0.5, listed: 0.25, missing: 0 },
  evidenceMax: 1,
  proofOfWorkMax: 0.6,
  educationMax: 0.4,
} as const;

/** Inviting a candidate to interview. */
export const INVITE_LIMITS = {
  /**
   * An invitation approved this long ago that is neither sent nor failed is
   * taken as a send that died part-way, and "Try again" may claim it.
   *
   * DECISION: the send runs inside the request (`maxDuration` 30 s), so after
   * 2 minutes no request can still be sending. A durable workflow would resume
   * the send by itself; this rule trades that for no extra infrastructure, at
   * the cost of a recruiter waiting up to 2 minutes and clicking again.
   */
  staleApprovalMs: 2 * 60_000,
  /** The one request to the mail provider is abandoned after this long, well inside the route's 30 s. */
  sendTimeoutMs: 10_000,
} as const;

/** The browser's Analyze queue. */
export const ANALYZE_QUEUE_LIMITS = {
  /** Per-resume analyze calls in flight at once. */
  concurrency: 3,
  /** Attempts per resume when the server answers 429 or 503 (or the network fails). */
  maxAttempts: 5,
  /** First back-off wait without a Retry-After header; doubles each attempt. */
  backoffBaseMs: 1_000,
  /** Longest single wait, Retry-After included. */
  backoffMaxMs: 30_000,
  /** At most one page refresh (new candidates) per this interval while running. */
  refreshThrottleMs: 2_000,
  /** At most one progress request per this interval while running. */
  progressThrottleMs: 500,
} as const;
