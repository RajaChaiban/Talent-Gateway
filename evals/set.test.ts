import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkAts } from "@/lib/ats/check-ats";
import { findPhoneNumbers } from "@/lib/ats/phone";
import { WRITTEN_CASES, WRITTEN_COMPARISONS } from "./cases";
import { JOB_TYPE_CASES, JOB_TYPE_COMPARISONS } from "./job-types";
import { LOCAL_FILES_JOB } from "./local-files";

const RESUMES = path.join(import.meta.dirname, "resumes");
const JOBS = path.join(import.meta.dirname, "jobs");
const read = (dir: string, file: string) => readFileSync(path.join(dir, file), "utf8").replace(/\r\n/g, "\n");
const lines = (file: string) => read(RESUMES, file).split("\n");

/** Every resume file under evals/resumes/, subfolders included, as a path with forward slashes. */
const RESUME_FILES = readdirSync(RESUMES, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => path.relative(RESUMES, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
  .toSorted();

const ALL_CASES = [...WRITTEN_CASES, ...JOB_TYPE_CASES];

describe("the written set", () => {
  it("has unique case ids, and every comparison names two known cases", () => {
    const ids = ALL_CASES.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const comparison of [...WRITTEN_COMPARISONS, ...JOB_TYPE_COMPARISONS]) {
      expect(ids, comparison.id).toContain(comparison.higher);
      expect(ids, comparison.id).toContain(comparison.lower);
    }
  });

  it("uses every resume and job file, and nothing else (the local files use the Applied AI Engineer job)", () => {
    const used = new Set(ALL_CASES.map((item) => item.resume.file));
    expect(RESUME_FILES).toEqual([...used].toSorted());
    expect(readdirSync(JOBS).toSorted()).toEqual(
      [...new Set([...ALL_CASES.map((item) => item.job), LOCAL_FILES_JOB].map((job) => `${job}.txt`))].toSorted(),
    );
  });

  it.each(RESUME_FILES)("%s passes the ATS check, as a PDF with no picture would", (file) => {
    const text = read(RESUMES, file);
    const result = checkAts({ text, contentType: "application/pdf", sizeBytes: text.length, imageCount: 0 });
    expect(result.checks.filter((check) => !check.passed).map((check) => check.id)).toEqual([]);
    expect(result.status).toBe("ATS_READY");
  });

  it.each(RESUME_FILES)("%s gives invented contact details only", (file) => {
    const text = read(RESUMES, file);
    for (const email of text.match(/[\w.%+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? []) expect(email).toMatch(/@example\.com$/);
    const phones = findPhoneNumbers(text);
    expect(phones.length).toBeGreaterThan(0);
    for (const phone of phones) expect(phone).toMatch(/^\d{3}55501\d{2}$/);
    for (const url of text.match(/https?:\/\/\S+/g) ?? []) expect(url).toMatch(/^https:\/\/[\w.-]*example\.com\//);
  });
});

describe("the job types (test 8)", () => {
  const kindOf = (id: string) => JOB_TYPE_CASES.find((item) => item.id === id)?.resumeKind;

  it("scores five resumes, one of each kind, for each of five jobs, with the stated ranges", () => {
    expect(JOB_TYPE_CASES).toHaveLength(25);
    const jobs = [...new Set(JOB_TYPE_CASES.map((item) => item.job))];
    expect(jobs).toEqual(["software-engineer", "finance-manager", "registered-nurse", "marketing-manager", "account-executive"]);
    for (const job of jobs) {
      const own = JOB_TYPE_CASES.filter((item) => item.job === job);
      expect(own.map((item) => [item.resumeKind, item.range, item.sameRole ?? false])).toEqual([
        ["strong", { min: 80, max: 100 }, true],
        ["mid", { min: 50, max: 84 }, true],
        ["vague", { min: 50, max: 79 }, true],
        ["related", { min: 25, max: 69 }, false],
        ["unrelated", { min: 0, max: 30 }, false],
      ]);
      expect(own.every((item) => item.test === 8 && item.band === undefined && !item.stability)).toBe(true);
    }
  });

  it("orders each job's resumes: strong > mid, strong > vague by 1.0 or more, mid > related, related > unrelated", () => {
    expect(JOB_TYPE_COMPARISONS).toHaveLength(20);
    const pairs = JOB_TYPE_COMPARISONS.map((item) => [kindOf(item.higher), kindOf(item.lower), item.margin?.min ?? null]);
    for (let index = 0; index < pairs.length; index += 4) {
      expect(pairs.slice(index, index + 4)).toEqual([
        ["strong", "mid", null],
        ["strong", "vague", 10],
        ["mid", "related", null],
        ["related", "unrelated", null],
      ]);
    }
    for (const comparison of JOB_TYPE_COMPARISONS) {
      const job = (id: string) => JOB_TYPE_CASES.find((item) => item.id === id)?.job;
      expect(job(comparison.higher)).toBe(job(comparison.lower));
    }
  });

  it("gives each job its own strong, mid, vague and related resume, and another job's strong resume as unrelated", () => {
    for (const item of JOB_TYPE_CASES) {
      const file = item.resume.file;
      const ownFolder = file.startsWith(`job-types/${item.job}/`);
      if (item.resumeKind !== "unrelated") {
        expect(ownFolder || WRITTEN_CASES.some((other) => other.resume.file === file && other.job === item.job), item.id).toBe(true);
        continue;
      }
      expect(ownFolder, item.id).toBe(false);
      const strongElsewhere = JOB_TYPE_CASES.find(
        (other) => other.resumeKind === "strong" && other.job !== item.job && other.resume.file === file,
      );
      expect(strongElsewhere, item.id).toBeDefined();
    }
  });

  const newFiles = RESUME_FILES.filter((file) => file.startsWith("job-types/"));

  it.each(newFiles)("%s is 25 to 45 lines with the four standard headings", (file) => {
    const text = read(RESUMES, file).trimEnd();
    const count = text.split("\n").length;
    expect(count).toBeGreaterThanOrEqual(25);
    expect(count).toBeLessThanOrEqual(45);
    for (const heading of ["SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS"]) expect(text.split("\n")).toContain(heading);
  });

  it.each(JOB_TYPE_CASES.filter((item) => item.resumeKind === "vague").map((item) => item.id))(
    "%s is the strong resume's person, with no number in any bullet",
    (id) => {
      const vague = JOB_TYPE_CASES.find((item) => item.id === id);
      const strong = JOB_TYPE_CASES.find((item) => item.job === vague?.job && item.resumeKind === "strong");
      if (!vague || !strong) throw new Error(`no strong case for ${id}`);
      const name = lines(vague.resume.file)[0];
      expect(lines(strong.resume.file)[0].startsWith(name)).toBe(true);
      for (const line of lines(vague.resume.file).filter((item) => item.startsWith("- "))) expect(line).not.toMatch(/\d/);
    },
  );

  it.each(["registered-nurse.txt", "marketing-manager.txt", "account-executive.txt"])(
    "%s follows the job format, with 6 to 8 must-haves including a required qualification",
    (file) => {
      const text = read(JOBS, file).split("\n");
      for (const heading of ["About the role", "Must have", "Nice to have", "What you will do"]) expect(text).toContain(heading);
      const mustHaves = text.slice(text.indexOf("Must have") + 1, text.indexOf("Nice to have")).filter((line) => line.startsWith("- "));
      expect(mustHaves.length).toBeGreaterThanOrEqual(6);
      expect(mustHaves.length).toBeLessThanOrEqual(8);
      expect(mustHaves.join("\n")).toMatch(/license|degree/i);
    },
  );
});

describe("the stack-flexible job (test 6)", () => {
  const strict = read(JOBS, "software-engineer.txt").split("\n");
  const flexible = read(JOBS, "software-engineer-flexible.txt");

  it("is the same role at the same company", () => {
    expect(flexible.split("\n").slice(0, 2)).toEqual(strict.slice(0, 2));
  });

  it("says the stack does not matter and names none of the frameworks either resume uses", () => {
    expect(flexible).toContain("The specific stack does not matter");
    expect(flexible).not.toMatch(/React|Node\.js|PostgreSQL|TypeScript|Angular|Java|Spring|Oracle|Jest|JUnit/);
  });
});

describe("the one-factor pairs (test 4)", () => {
  const base = lines("pair-base.txt");

  /** The lines a variant adds to the base, when it only adds lines. */
  function added(file: string): string[] {
    const variant = lines(file);
    const extra: string[] = [];
    let index = 0;
    for (const line of variant) {
      if (line === base[index]) index += 1;
      else extra.push(line);
    }
    expect(index, `${file} keeps every base line in order`).toBe(base.length);
    return extra;
  }

  /** The [base, variant] line pairs that differ, when a variant only replaces lines. */
  function replaced(file: string): Array<[string, string]> {
    const variant = lines(file);
    expect(variant.length).toBe(base.length);
    return base.flatMap((line, index) => (line === variant[index] ? [] : [[line, variant[index]] as [string, string]]));
  }

  it("the frameworks variant swaps the frameworks the job names, and nothing else", () => {
    const changes = replaced("pair-a-other-frameworks.txt");
    expect(changes.length).toBeGreaterThan(0);
    for (const [before, after] of changes) {
      const normalise = (line: string) =>
        line.replace(/React|Node\.js|PostgreSQL|Jest|Angular|Java \(Spring Boot\)|Java, Spring Boot|Oracle|JUnit/g, "X");
      expect(normalise(after)).toBe(normalise(before));
      expect(after).not.toMatch(/React|Node\.js|PostgreSQL/);
    }
  });

  it("the degree variant adds one master's line", () => {
    expect(added("pair-b-masters.txt")).toEqual(["M.S. Computer Science (part-time), Front Range University, 2024"]);
  });

  it("the link variant adds one code repository line", () => {
    expect(added("pair-c-repo-link.txt")).toEqual(["Code repository: https://git.example.com/james-whitfield"]);
  });

  it("the projects variant adds one projects section", () => {
    const extra = added("pair-d-side-projects.txt");
    expect(extra[0]).toBe("PROJECTS");
    expect(extra.filter((line) => line.startsWith("- "))).toHaveLength(2);
    expect(extra.join("\n")).not.toMatch(/React|Node\.js|PostgreSQL|TypeScript/);
  });

  it("the vague variant replaces only the current role's bullets with vague claims", () => {
    const changes = replaced("pair-e-vague.txt");
    expect(changes).toHaveLength(5);
    for (const [before, after] of changes) {
      expect(before.startsWith("- ")).toBe(true);
      expect(after.startsWith("- ")).toBe(true);
      expect(after).not.toMatch(/\d/);
    }
    expect(changes.map(([, after]) => after)).toContain("- Used AI to improve productivity.");
  });
});
