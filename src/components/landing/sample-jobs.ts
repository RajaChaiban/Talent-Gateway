import { asStored, type StoredScore } from "@/lib/score";

/** One example job for the landing page preview: its ranked candidates and the unreadable file that was set aside. */
export type SampleJob = {
  /** Short label for the tab. */
  tab: string;
  title: string;
  /** Includes the unreadable file, so it is always the number of ranked rows plus one. */
  applicants: number;
  /** Ranked best first. Scores are stored values out of 100. */
  candidates: readonly (readonly [name: string, score: StoredScore])[];
  unreadable: string;
  summary: string;
  strengths: number;
  radar: string;
};

/** Invented sample data: these people and roles do not exist. */
export const sampleJobs: readonly SampleJob[] = [
  {
    tab: "Frontend",
    title: "Senior Frontend Engineer",
    applicants: 5,
    candidates: [
      ["Amara Okafor", asStored(91)],
      ["Daniel Reyes", asStored(83)],
      ["Mei Lin", asStored(68)],
      ["Tomas Berg", asStored(44)],
    ],
    unreadable: "Only 38 characters detected: scanned image or corrupted PDF",
    summary:
      "Strong systems architecture experience with modern web stacks, distributed systems, and performance tuning.",
    strengths: 3,
    radar: "Clean profile",
  },
  {
    tab: "Design",
    title: "Product Designer",
    applicants: 5,
    candidates: [
      ["Noor Haddad", asStored(88)],
      ["Lucas Ferreira", asStored(76)],
      ["Priya Raman", asStored(59)],
      ["Jonas Eklund", asStored(37)],
    ],
    unreadable: "No text layer found: the portfolio was exported as flattened images",
    summary:
      "Shipped two design systems end to end, with measurable gains in accessibility and cross-team consistency.",
    strengths: 4,
    radar: "Clean profile",
  },
  {
    tab: "Data",
    title: "Data Engineer",
    applicants: 5,
    candidates: [
      ["Sofia Marchetti", asStored(82)],
      ["Kwame Mensah", asStored(79)],
      ["Hana Sato", asStored(63)],
      ["Oliver Grant", asStored(41)],
    ],
    unreadable: "Password-protected PDF: the text could not be extracted",
    summary:
      "Built streaming pipelines at scale and owns data quality checks, though warehouse cost tuning is thin.",
    strengths: 3,
    radar: "Job-hopping flagged",
  },
  {
    tab: "Success",
    title: "Customer Success Manager",
    applicants: 5,
    candidates: [
      ["Elena Petrova", asStored(86)],
      ["Marcus Bell", asStored(71)],
      ["Aisha Khan", asStored(55)],
      ["Ravi Nair", asStored(33)],
    ],
    unreadable: "Only 12 characters detected: the file looks empty",
    summary:
      "Grew a mid-market book of business and cut churn through structured onboarding and renewal planning.",
    strengths: 2,
    radar: "Employment gap flagged",
  },
];
