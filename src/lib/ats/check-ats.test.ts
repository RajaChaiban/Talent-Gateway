import { describe, expect, it } from "vitest";
import { ATS_CONFIG, type AtsCheckId, type AtsConfig } from "@/lib/config";
import type { Database } from "@/lib/supabase/database.types";
import { checkAts } from "./check-ats";
import {
  ASCII_TABLE_RESUME,
  CLEAN_RESUME,
  RICH_CLEAN_RESUME,
  SCANNED_RESUME,
  TWO_COLUMN_TABLE_RESUME,
} from "./test-fixtures";
import { toAtsColumns } from "./to-columns";
import type { AtsInput, AtsResult } from "./types";

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MB = 1024 * 1024;

const CHECK_ORDER: AtsCheckId[] = [
  "readable_text",
  "contact_info",
  "phone",
  "standard_sections",
  "layout_noise",
  "file",
  "picture",
];

/** Text with an email, two headings and `chars` characters once whitespace is collapsed. */
function textOfLength(chars: number): string {
  const head = "ada@example.com\nExperience\nEducation\n";
  return head + "x".repeat(chars - head.length);
}

function input(overrides: Partial<AtsInput> = {}): AtsInput {
  return { text: CLEAN_RESUME, contentType: PDF, sizeBytes: 200_000, imageCount: 0, ...overrides };
}

function failed(result: AtsResult): AtsCheckId[] {
  return result.checks.filter((c) => !c.passed).map((c) => c.id);
}

function value(result: AtsResult, id: AtsCheckId): number {
  const found = result.checks.find((c) => c.id === id);
  if (!found) throw new Error(`missing check ${id}`);
  return found.value;
}

/** An input that fails exactly the named checks and passes the rest. */
function inputFailing(ids: readonly AtsCheckId[]): AtsInput {
  const has = (id: AtsCheckId) => ids.includes(id);
  const short = has("readable_text");
  const lines = [
    has("contact_info") ? "ada at example dot com" : "ada@example.com",
    has("phone") ? "Phone on request" : "+44 20 7946 0000",
    has("standard_sections") ? "Roles\nStudies" : "Experience\nEducation\nSkills",
    "x".repeat(short ? 20 : 400),
  ];
  if (has("layout_noise")) lines.push("▒".repeat(short ? 40 : 300));
  return input({
    text: lines.join("\n"),
    contentType: has("file") ? "image/png" : PDF,
    imageCount: has("picture") ? 2 : 0,
  });
}

const failing: Record<AtsCheckId, AtsInput> = {
  readable_text: inputFailing(["readable_text"]),
  contact_info: inputFailing(["contact_info"]),
  phone: inputFailing(["phone"]),
  standard_sections: inputFailing(["standard_sections"]),
  layout_noise: inputFailing(["layout_noise"]),
  file: inputFailing(["file"]),
  picture: inputFailing(["picture"]),
};

describe("all checks pass", () => {
  it("accepts a clean resume with a perfect score and no reasons", () => {
    const result = checkAts(input());
    expect(result.status).toBe("ATS_READY");
    expect(result.score).toBe(100);
    expect(result.reasons).toEqual([]);
    expect(failed(result)).toEqual([]);
  });

  it("reports all seven checks in a fixed order", () => {
    expect(checkAts(input()).checks.map((c) => c.id)).toEqual(CHECK_ORDER);
    expect(checkAts(input({ text: "" })).checks.map((c) => c.id)).toEqual(CHECK_ORDER);
  });

  it("accepts a DOCX file", () => {
    expect(checkAts(input({ contentType: DOCX })).score).toBe(100);
  });
});

describe("default weights and required checks", () => {
  it("weights add up to 100, the pass mark is 60, and text, email, phone, file and picture are required", () => {
    expect(ATS_CONFIG.weights).toEqual({
      readable_text: 15,
      file: 5,
      contact_info: 15,
      phone: 10,
      picture: 10,
      standard_sections: 25,
      layout_noise: 20,
    });
    expect(Object.values(ATS_CONFIG.weights).reduce((x, y) => x + y, 0)).toBe(100);
    expect(ATS_CONFIG.passScore).toBe(60);
    expect(ATS_CONFIG.maxImages).toBe(0);
    expect(CHECK_ORDER.filter((id) => ATS_CONFIG.required[id])).toEqual([
      "readable_text",
      "contact_info",
      "phone",
      "file",
      "picture",
    ]);
  });

  it("exposes weight and required on every check", () => {
    for (const c of checkAts(input()).checks) {
      expect(c.weight).toBe(ATS_CONFIG.weights[c.id]);
      expect(c.required).toBe(ATS_CONFIG.required[c.id]);
    }
  });

  it.each([
    ["readable_text", 85, "NOT_ATS_READY"],
    ["file", 95, "NOT_ATS_READY"],
    ["contact_info", 85, "NOT_ATS_READY"],
    ["phone", 90, "NOT_ATS_READY"],
    ["picture", 90, "NOT_ATS_READY"],
    ["standard_sections", 75, "ATS_READY"],
    ["layout_noise", 80, "ATS_READY"],
  ] as const)("failing only %s gives %i and %s", (id, score, status) => {
    const result = checkAts(failing[id]);
    expect(failed(result)).toEqual([id]);
    expect(result.score).toBe(score);
    expect(result.status).toBe(status);
    expect(result.reasons).toHaveLength(1);
  });

  it.each([
    [["readable_text", "contact_info"], 70, "NOT_ATS_READY"],
    [["readable_text", "standard_sections"], 60, "NOT_ATS_READY"],
    [["readable_text", "layout_noise"], 65, "NOT_ATS_READY"],
    [["readable_text", "file"], 80, "NOT_ATS_READY"],
    [["contact_info", "standard_sections"], 60, "NOT_ATS_READY"],
    [["contact_info", "layout_noise"], 65, "NOT_ATS_READY"],
    [["standard_sections", "layout_noise"], 55, "NOT_ATS_READY"],
    [["contact_info", "file"], 80, "NOT_ATS_READY"],
    [["standard_sections", "file"], 70, "NOT_ATS_READY"],
    [["layout_noise", "file"], 75, "NOT_ATS_READY"],
    [["contact_info", "phone"], 75, "NOT_ATS_READY"],
    [["phone", "picture"], 80, "NOT_ATS_READY"],
  ] as const)("failing the pair %j gives %i and %s", (ids, score, status) => {
    const result = checkAts(inputFailing(ids));
    expect(failed(result)).toEqual(CHECK_ORDER.filter((id) => (ids as readonly string[]).includes(id)));
    expect(result.score).toBe(score);
    expect(result.status).toBe(status);
    expect(result.reasons).toHaveLength(2);
  });

  it("a required check failing alone is not ready even with a high score, and lists only its own reason", () => {
    const result = checkAts(failing.file);
    expect(result.score).toBeGreaterThanOrEqual(ATS_CONFIG.passScore);
    expect(result.status).toBe("NOT_ATS_READY");
    expect(result.reasons).toEqual(["This file is not a PDF or Word (DOCX) document."]);
  });

  it("all checks failing scores 0", () => {
    const result = checkAts({ text: "▒", contentType: "image/png", sizeBytes: 10 * MB, imageCount: 3 });
    expect(failed(result)).toEqual(CHECK_ORDER);
    expect(result.score).toBe(0);
    expect(result.status).toBe("NOT_ATS_READY");
    expect(result.reasons).toHaveLength(7);
  });
});

describe("readable_text boundary", () => {
  it("fails at 299 characters and passes at 300", () => {
    const short = checkAts(input({ text: textOfLength(299) }));
    const exact = checkAts(input({ text: textOfLength(300) }));
    expect(value(short, "readable_text")).toBe(299);
    expect(failed(short)).toContain("readable_text");
    expect(value(exact, "readable_text")).toBe(300);
    expect(failed(exact)).not.toContain("readable_text");
  });

  it("collapses runs of whitespace before counting", () => {
    const spaced = `${textOfLength(299)}${" \n\t ".repeat(50)}`;
    expect(value(checkAts(input({ text: spaced })), "readable_text")).toBe(299);
    expect(value(checkAts(input({ text: `   ${textOfLength(300)}   ` })), "readable_text")).toBe(300);
  });

  it("names the measured length in the reason", () => {
    const reason = checkAts(input({ text: textOfLength(120) })).reasons[0];
    expect(reason).toBe(
      "Only 120 characters of text could be read, so this looks like a scanned image or a broken file.",
    );
  });

  it("says no text for empty text and handles one character", () => {
    expect(checkAts(input({ text: "" })).reasons[0]).toMatch(/^No text could be read/);
    expect(checkAts(input({ text: "a" })).reasons[0]).toMatch(/^Only 1 character of text/);
  });
});

describe("contact_info", () => {
  const found = (text: string) => value(checkAts(input({ text })), "contact_info");

  it.each([
    "jo@example.com",
    "jo.smith@example.com",
    "jo+jobs@example.com",
    "jo_smith-99@mail.eu.example.co.uk",
    "j@a.io",
    "first.last@sub.domain.example.photography",
    "josé@exämple.fr",
    "Contact: jo@example.com.",
    "(jo@example.com)",
    "<jo@example.com>",
    "mailto:jo@example.com",
    "jo@my-company.example.org, 555-0100",
    "JO@EXAMPLE.COM",
  ])("finds an address in %j", (text) => {
    expect(found(text)).toBeGreaterThan(0);
  });

  it.each([
    "name at example dot com",
    "@handle",
    "follow me @handle on social",
    "user@localhost",
    "user@",
    "user@.com",
    "user@example",
    "user@example.c",
    "user@-example.com",
    "user@example..com",
    "user@example.123",
    "",
  ])("does not find an address in %j", (text) => {
    expect(found(text)).toBe(0);
  });

  it("counts several addresses", () => {
    expect(found("a@example.com and b@example.org")).toBe(2);
  });

  it("rejects an over-long local part window and domain", () => {
    expect(found(`${"a".repeat(30)}@${"b".repeat(64)}.com`)).toBe(0);
    expect(found(`a@${"b.".repeat(200)}com`)).toBe(0);
  });
});

describe("required contact details", () => {
  const withoutPhone = CLEAN_RESUME.replace("+44 20 7946 0000", "Phone on request");
  const withoutEmail = CLEAN_RESUME.replace("priya.natarajan@example.com", "email on request");

  it("sets aside a resume with no email address, whatever its score", () => {
    const result = checkAts(input({ text: withoutEmail }));
    expect(failed(result)).toEqual(["contact_info"]);
    expect(result.score).toBeGreaterThanOrEqual(ATS_CONFIG.passScore);
    expect(result.status).toBe("NOT_ATS_READY");
    expect(result.reasons).toEqual([
      "No email address was found in the text, so there is no way to email this candidate from the resume.",
    ]);
  });

  it("sets aside a resume with no phone number, naming it in the reason", () => {
    const result = checkAts(input({ text: withoutPhone }));
    expect(failed(result)).toEqual(["phone"]);
    expect(result.score).toBe(90);
    expect(result.status).toBe("NOT_ATS_READY");
    expect(result.reasons).toEqual([
      "No phone number was found in the text, so there is no way to call this candidate from the resume.",
    ]);
  });

  it("does not take date ranges for a phone number, even stacked on consecutive lines", () => {
    // CLEAN_RESUME without its phone still has "2020 - present", "2016 - 2020" and "2012 - 2016".
    expect(value(checkAts(input({ text: withoutPhone })), "phone")).toBe(0);
    const stacked = `${withoutPhone}\nAcme (2019 - 2022)\n2017 - 2019\n2015 - 2017`;
    expect(value(checkAts(input({ text: stacked })), "phone")).toBe(0);
    expect(checkAts(input({ text: stacked })).status).toBe("NOT_ATS_READY");
  });

  it.each(["+1 555 010 0177", "(555) 010-0142", "+49 30 5550 0142", "555.010.0142 (mobile)"])(
    "finds the phone number %j",
    (phone) => {
      const result = checkAts(input({ text: `${withoutPhone}\n${phone}` }));
      expect(value(result, "phone")).toBe(1);
      expect(result.status).toBe("ATS_READY");
    },
  );
});

describe("picture", () => {
  it("passes a file with no pictures, and one whose pictures were not counted", () => {
    expect(failed(checkAts(input({ imageCount: 0 })))).toEqual([]);
    const uncounted = checkAts(input({ imageCount: null }));
    expect(failed(uncounted)).toEqual([]);
    expect(uncounted.status).toBe("ATS_READY");
    expect(value(uncounted, "picture")).toBe(0);
  });

  it("sets aside a file holding one picture, with a singular reason", () => {
    const result = checkAts(input({ imageCount: 1 }));
    expect(failed(result)).toEqual(["picture"]);
    expect(value(result, "picture")).toBe(1);
    expect(result.status).toBe("NOT_ATS_READY");
    expect(result.reasons).toEqual([
      "The file contains 1 picture. A photo or graphic cannot be read by an applicant tracking system.",
    ]);
  });

  it("gives the number of pictures in the reason", () => {
    expect(checkAts(input({ imageCount: 2 })).reasons).toEqual([
      "The file contains 2 pictures. A photo or graphic cannot be read by an applicant tracking system.",
    ]);
  });

  it("follows the configured limit", () => {
    const config: AtsConfig = { ...ATS_CONFIG, maxImages: 2 };
    expect(failed(checkAts(input({ imageCount: 2 }), config))).toEqual([]);
    expect(failed(checkAts(input({ imageCount: 3 }), config))).toEqual(["picture"]);
  });
});

describe("standard_sections", () => {
  const sections = (text: string) => value(checkAts(input({ text })), "standard_sections");

  it("fails with one section, passes with exactly two", () => {
    const one = checkAts(input({ text: "Experience\nnothing else" }));
    const two = checkAts(input({ text: "Experience\nSkills\nnothing else" }));
    expect(value(one, "standard_sections")).toBe(1);
    expect(failed(one)).toContain("standard_sections");
    expect(value(two, "standard_sections")).toBe(2);
    expect(failed(two)).not.toContain("standard_sections");
  });

  it.each([
    "Experience",
    "EXPERIENCE",
    "experience",
    "Work Experience",
    "Professional Experience",
    "Employment History",
    "Technical Skills",
    "Academic Background",
    "Education:",
    "SKILLS:",
    "  Skills  ",
    "• Skills",
    "- Education",
    "1. Experience",
    "2) Education",
    "Skills & Expertise",
    "Skills and Tools",
    "Education and Training",
    "Core Competencies",
    "Work History",
  ])("recognises %j as a heading", (line) => {
    expect(sections(line)).toBe(1);
  });

  it.each([
    "I have strong experience in sales and a degree in education.",
    "Experience in Python and SQL",
    "Skills: Python, SQL, Excel",
    "Experience 2019 - 2024",
    "Skills 2024",
    "Education was important to me",
    "The skills section follows",
    "Experience. Education.",
    "Work Experience at a very long heading line that goes on and on",
    "│ EXPERIENCE │",
    "Skillset",
    "",
  ])("does not treat %j as a heading", (line) => {
    expect(sections(line)).toBe(0);
  });

  it("counts a section once however many headings match", () => {
    expect(sections("Experience\nWork Experience\nProfessional Experience")).toBe(1);
  });

  it("matches headings on any kind of line break", () => {
    expect(sections("Experience\r\nEducation\rSkills")).toBe(3);
  });

  it("treats U+0085, U+2028 and U+2029 as line separators", () => {
    expect(sections("Experience\u0085Education\u2028Skills\u2029other")).toBe(3);
  });

  it("names the count and the expected sections in the reason", () => {
    const reason = checkAts(input({ text: "Experience\nonly one" })).reasons.find((r) =>
      r.startsWith("Only 1 of the standard"),
    );
    expect(reason).toBe(
      "Only 1 of the standard sections (experience, education, skills) appear as headings; at least 2 are expected.",
    );
  });

  it.each([
    "## Skills",
    "# Experience",
    "### Education",
    "**Skills**",
    "__Education__",
    "**Work Experience**",
    "Skills —",
    "Skills -",
    "— Skills —",
    "Experience.",
    "Education:",
    "Skills ::",
    "* * Skills",
    "S K I L L S",
    "E X P E R I E N C E",
    "W O R K  E X P E R I E N C E",
    "E D U C A T I O N :",
    "> Skills",
    "3) Skills:",
    "   \t Skills",
    "SKILLS ·",
  ])("recognises the decorated heading %j", (line) => {
    expect(sections(line)).toBe(1);
  });

  it.each([
    ["Professional Experience & Education", 2],
    ["Professional Experience and Education", 2],
    ["Education / Skills", 2],
    ["Education/Skills", 2],
    ["Skills & Experience", 2],
    ["Experience, Education", 0],
    ["Education and Skills and Experience", 3],
    ["**Education & Skills**", 2],
    ["Formation et Compétences", 2],
    ["Educación y Habilidades", 2],
    ["Ausbildung und Berufserfahrung", 2],
    ["Skills and Expertise", 1],
    ["Education and Training", 1],
  ])("reads the combined heading %j as %i sections", (line, count) => {
    expect(sections(line)).toBe(count);
  });

  it.each([
    "Skills: Python, SQL",
    "Skills 2024",
    "Experience: 5 years",
    "Python Java",
    "Skills Python",
    "Experience with Education",
    "Experience & Python",
    "Skills & Hobbies",
    "Skills / Hobbies / Education",
    "S K",
    "I want skills and education in my next role.",
    "Education was a priority and skills followed",
    "- Led the experience team",
    "E X P E R I E N C E 2020",
  ])("does not treat %j as a heading", (line) => {
    expect(sections(line)).toBe(0);
  });

  it("honours the heading length limit", () => {
    const long = "Professional Experience";
    expect(sections(long)).toBe(1);
    const tight: AtsConfig = { ...ATS_CONFIG, maxHeadingChars: 10 };
    expect(checkAts(input({ text: long }), tight).checks[2].value).toBe(0);
  });
});

describe("emails glued to following text", () => {
  const found = (text: string) => value(checkAts(input({ text })), "contact_info");

  it.each([
    "jane@example.com07700 900123",
    "jane@example.com2019",
    "jane@example.comLinkedIn",
    "07700 900123jane@example.com",
    "jane@example.com|jane.doe",
    "Email:jane@example.com\u00A0Phone",
    "jane@example.org-Leeds",
    "a.b@c.d.example.net555",
    "user@xn--80ak6aa92e.com",
    "user@example.xn--p1ai",
    "user@example.xn--vermgensberatung-pwb",
    "user@münchen.example.de",
    "jose\u0301@example.com",
  ])("finds the address in %j", (text) => {
    expect(found(text)).toBe(1);
  });

  it.each([
    "user@localhost",
    "user@localhost2019",
    "@handle",
    "name at example dot com",
    "user@example.c1",
    "user@example.1",
    "user@-example.com",
    "user@example-.com",
    "user@example..com",
    "user@.example.com",
    "user@example",
    "user@",
    "mail@",
  ])("still rejects %j", (text) => {
    expect(found(text)).toBe(0);
  });
});

describe("text normalisation", () => {
  const sections = (text: string) => value(checkAts(input({ text })), "standard_sections");

  it("matches decomposed accents against precomposed variants", () => {
    expect(sections("Expe\u0301rience professionnelle\nCompe\u0301tences")).toBe(2);
    expect(sections("Educacio\u0301n\nHabilidades")).toBe(2);
    expect(sections("Fa\u0308higkeiten\nAusbildung")).toBe(2);
  });

  it("matches headings containing zero-width characters and soft hyphens", () => {
    expect(sections("\u200BExperience\n\uFEFFEducation")).toBe(2);
    expect(sections("Exper\u200Bience\nEdu\u00ADcation\nSk\u2060ills")).toBe(3);
    expect(sections("\u200B\u200B  Skills \u200C\nExper\u200Dience")).toBe(2);
  });

  it("does not count zero-width characters as readable text", () => {
    const result = checkAts(input({ text: "\u200B".repeat(1000) + "a".repeat(10) }));
    expect(value(result, "readable_text")).toBe(10);
  });
});

describe("layout_noise boundary", () => {
  function noiseResult(noise: number, text: number): AtsResult {
    return checkAts(input({ text: "▒".repeat(noise) + "a".repeat(text - noise) }));
  }

  it("passes at exactly 15% and fails just over", () => {
    const exact = noiseResult(30, 200);
    const over = noiseResult(31, 200);
    expect(value(exact, "layout_noise")).toBe(0.15);
    expect(failed(exact)).not.toContain("layout_noise");
    expect(value(over, "layout_noise")).toBeCloseTo(0.155, 5);
    expect(failed(over)).toContain("layout_noise");
  });

  it("ignores whitespace in the denominator", () => {
    const text = `${"▒".repeat(30)} \n\t ${"a".repeat(170)}${"   \n".repeat(500)}`;
    expect(value(checkAts(input({ text })), "layout_noise")).toBe(0.15);
  });

  function ratioOf(text: string): number {
    return value(checkAts(input({ text })), "layout_noise");
  }

  it("counts box drawing, block characters, replacement characters, private-use icons and symbols as noise", () => {
    for (const noise of ["│", "─", "▒", "█", "\uFFFD", "\uE000", "✦", "★", "|", "^", "`", "¦"]) {
      expect(ratioOf(`${noise}aaaaaaaaa`)).toBeCloseTo(0.1, 5);
    }
  });

  it("ignores control characters entirely", () => {
    for (const control of ["\u0001", "\u007F", "\u0000", "\u0008"]) {
      const result = checkAts(input({ text: `${control}aaaaaaaaa` }));
      expect(value(result, "layout_noise")).toBe(0);
      expect(value(result, "readable_text")).toBe(9);
    }
  });

  it("counts runs of three or more rule characters as noise, but not a lone one or two", () => {
    for (const rule of ["-", "=", "_", "*", "~", "+", "."]) {
      expect(ratioOf(`aaaaaaa ${rule}${rule}${rule}`)).toBeCloseTo(3 / 10, 5);
      expect(ratioOf(`aaaaaaaa ${rule}${rule}`)).toBe(0);
      expect(ratioOf(`aaaaaaaaa ${rule}`)).toBe(0);
    }
    expect(ratioOf("aaaa " + "-".repeat(6))).toBeCloseTo(0.6, 5);
    expect(ratioOf("a-a-a-a-a-a-a-a")).toBe(0);
    expect(ratioOf("- - - - - -")).toBe(0);
  });

  it("does not count ordinary resume text containing symbols", () => {
    for (const text of [
      "C++ C# F# .NET Node.js",
      "+44 20 7946 0000 (555) 010-9999",
      "https://www.example.com/a_b-c/d.html?x=1&y=2#top",
      "jane.doe+jobs@mail.example.co.uk",
      "- a markdown bullet, * another, + a third",
      "Raised revenue 38% & cut costs by $1.2m / £900k.",
      "e.g. Python, i.e. R; Mr. Smith's \"quote\" (aside) [note] {set}",
      "Skills: SQL -- Python -- R",
    ]) {
      expect(ratioOf(text)).toBeLessThan(0.1);
    }
    expect(ratioOf("C++ C# F# .NET Node.js")).toBe(0);
    expect(ratioOf("+44 20 7946 0000 (555) 010-9999")).toBe(0);
    expect(ratioOf("https://www.example.com/a_b-c/d.html?x=1&y=2#top")).toBe(0);
    expect(ratioOf("jane.doe+jobs@mail.example.co.uk")).toBe(0);
    expect(ratioOf("- a markdown bullet, * another, + a third")).toBe(0);
  });

  it("counts ASCII table drawing as noise", () => {
    expect(ratioOf("+-------+-------+")).toBeGreaterThan(0.15);
    expect(ratioOf("| cell | cell | cell |")).toBeGreaterThan(0.15);
    expect(ratioOf("=====")).toBe(1);
    expect(ratioOf("_____")).toBe(1);
    expect(ratioOf("aaaaaaaaaa\n----------\naaaaaaaaaa")).toBeCloseTo(1 / 3, 5);
  });

  it("treats bullets, dashes, quotes, currency signs and ordinary symbols as text", () => {
    const ordinary =
      "•·●○◦▪■►➢ – — ‘ ’ “ ” « » $ € £ ¥ ₹ ₩ ¢ ( ) [ ] { } / \\ + = < > ~ % & * # @ _ ! ? . , ; : ' \" … ‐ ‑ ‒ ¡ ¿ § ¶ © ® ™ ° ± × ÷ ≥ ≤ →";
    expect(ratioOf(ordinary)).toBe(0);
  });

  it("treats combining marks and joiners as text", () => {
    expect(value(checkAts(input({ text: "é مَ\u200D\u200C" })), "layout_noise")).toBe(0);
  });

  it("is zero for empty and whitespace-only text without dividing by zero", () => {
    for (const text of ["", " ", "\n\t \u00A0 \u3000\f"]) {
      const result = checkAts(input({ text }));
      expect(value(result, "layout_noise")).toBe(0);
      expect(failed(result)).not.toContain("layout_noise");
      expect(failed(result)).toContain("readable_text");
    }
  });

  it("names the percentage in the reason", () => {
    const reason = noiseResult(100, 200).reasons.find((r) => r.startsWith("About"));
    expect(reason).toMatch(/^About 50% of the characters are stray symbols/);
  });
});

describe("file check", () => {
  it("accepts exactly 5 MB and rejects one byte over", () => {
    const exact = checkAts(input({ sizeBytes: 5 * MB }));
    const over = checkAts(input({ sizeBytes: 5 * MB + 1 }));
    expect(failed(exact)).toEqual([]);
    expect(failed(over)).toEqual(["file"]);
    expect(over.reasons[0]).toBe("This file is just over the 5 MB limit.");
    expect(checkAts(input({ sizeBytes: 6 * MB })).reasons[0]).toBe("This file is 6 MB, over the 5 MB limit.");
    expect(checkAts(input({ sizeBytes: 5.4 * MB })).reasons[0]).toBe("This file is 5.4 MB, over the 5 MB limit.");
    expect(checkAts(input({ sizeBytes: 5 * MB + 20_000 })).reasons[0]).toBe("This file is 5.02 MB, over the 5 MB limit.");
  });

  it("accepts a zero-byte size check on its own merits and rejects invalid sizes", () => {
    expect(failed(checkAts(input({ sizeBytes: 0 })))).toEqual([]);
    for (const sizeBytes of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(failed(checkAts(input({ sizeBytes })))).toEqual(["file"]);
    }
    expect(checkAts(input({ sizeBytes: Number.NaN })).reasons[0]).toBe(
      "This file has an unknown size.",
    );
  });

  it("rejects other types and says so", () => {
    for (const contentType of ["image/png", "text/plain", "application/msword", "", "pdf"]) {
      const result = checkAts(input({ contentType }));
      expect(failed(result)).toEqual(["file"]);
      expect(result.reasons[0]).toBe("This file is not a PDF or Word (DOCX) document.");
    }
  });

  it("ignores case, padding and parameters in the content type", () => {
    for (const contentType of ["Application/PDF", " application/pdf ", "application/pdf; charset=binary"]) {
      expect(failed(checkAts(input({ contentType })))).toEqual([]);
    }
  });

  it("reports both problems in one sentence", () => {
    const reason = checkAts(input({ contentType: "image/png", sizeBytes: 12 * MB })).reasons[0];
    expect(reason).toBe(
      "This file is not a PDF or Word (DOCX) document and is 12 MB, over the 5 MB limit.",
    );
  });
});

describe("reasons", () => {
  it("come one per failed check in the fixed order", () => {
    const result = checkAts({ text: "▒▒▒", contentType: "image/png", sizeBytes: 1, imageCount: 1 });
    expect(result.reasons).toHaveLength(7);
    expect(result.reasons[0]).toMatch(/^Only 3 characters of text/);
    expect(result.reasons[1]).toMatch(/^No email address/);
    expect(result.reasons[2]).toMatch(/^No phone number/);
    expect(result.reasons[3]).toMatch(/^Only 0 of the standard sections/);
    expect(result.reasons[4]).toMatch(/^About 100% of the characters/);
    expect(result.reasons[5]).toMatch(/^This file is not a PDF/);
    expect(result.reasons[6]).toMatch(/^The file contains 1 picture\./);
  });

  it("are plain sentences", () => {
    for (const reason of checkAts({ text: "▒", contentType: "x", sizeBytes: 9 * MB, imageCount: 4 }).reasons) {
      expect(reason).toMatch(/^[A-Z].*\.$/);
    }
  });
});

describe("international text", () => {
  const french = `Camille Lefèvre
camille.lefevre@exemple.fr

Expérience
Responsable logistique chez Entrepôts du Nord (2018 – 2024). Réduction des coûts de 12 % grâce à l'optimisation des tournées; gestion d'une équipe de 15 personnes « très motivées ».
Compétences : planification, négociation, tableaux de bord.
`.repeat(2);

  const arabic = `ليلى الحسن
layla@example.com
${"مهندسة برمجيات ذات خبرة في تطوير الأنظمة وتحليل البيانات وإدارة الفرق التقنية. ".repeat(6)}
`;

  const japanese = `山田 花子
hanako@example.jp
${"ソフトウェアエンジニアとして八年間、決済システムの設計と開発に従事しました。チームの育成も担当しました。".repeat(7)}
`;

  const hindi = `${"अनुभवी वित्त विश्लेषक जिन्होंने बजट और पूर्वानुमान पर काम किया है। ".repeat(8)}`;

  it.each([
    ["French", french],
    ["Arabic", arabic],
    ["Japanese", japanese],
    ["Hindi", hindi],
    ["Cyrillic", "Анна Иванова ".repeat(40)],
    ["Greek", "Μαρία Παπαδοπούλου ".repeat(30)],
    ["Korean", "한국어로 작성된 이력서입니다 ".repeat(30)],
  ])("does not treat %s as layout noise", (_name, text) => {
    const result = checkAts(input({ text }));
    expect(value(result, "layout_noise")).toBe(0);
    expect(value(result, "readable_text")).toBeGreaterThanOrEqual(300);
    expect(failed(result)).not.toContain("layout_noise");
  });

  it("finds an email next to non-Latin text", () => {
    expect(value(checkAts(input({ text: arabic })), "contact_info")).toBe(1);
    expect(value(checkAts(input({ text: japanese })), "contact_info")).toBe(1);
  });

  it.each([
    ["French", "Expérience professionnelle\nFormation\nCompétences", 3],
    ["French, unaccented", "Experience professionnelle\nFormation\nCompetences", 3],
    ["Spanish", "Experiencia\nEducación\nHabilidades", 3],
    ["Spanish, alternatives", "Experiencia profesional\nFormación\nCompetencias", 3],
    ["German", "Berufserfahrung\nAusbildung\nKenntnisse", 3],
    ["German, alternative", "Berufserfahrung\nAusbildung\nFähigkeiten", 3],
    ["French in capitals", "EXPÉRIENCE PROFESSIONNELLE\nFORMATION\nCOMPÉTENCES", 3],
  ])("recognises %s headings by default", (_name, text, count) => {
    expect(value(checkAts(input({ text })), "standard_sections")).toBe(count);
  });

  it("recognises other languages only when configured", () => {
    const text = "Erfarenhet\nUtbildning";
    expect(value(checkAts(input({ text })), "standard_sections")).toBe(0);
    const config: AtsConfig = {
      ...ATS_CONFIG,
      sectionHeadings: {
        ...ATS_CONFIG.sectionHeadings,
        experience: ["erfarenhet"],
        education: ["utbildning"],
      },
    };
    expect(value(checkAts(input({ text }), config), "standard_sections")).toBe(2);
  });
});

describe("empty and whitespace-only text", () => {
  it.each(["", " ", "\n\n\n", " \t\r\n \u00A0 \u3000"])("fails readably for %j", (text) => {
    const result = checkAts(input({ text }));
    expect(result.status).toBe("NOT_ATS_READY");
    expect(failed(result)).toEqual(["readable_text", "contact_info", "phone", "standard_sections"]);
    expect(value(result, "readable_text")).toBe(0);
    expect(Number.isFinite(value(result, "layout_noise"))).toBe(true);
  });
});

describe("config override", () => {
  it("a changed threshold changes the outcome", () => {
    const text = textOfLength(299);
    expect(failed(checkAts(input({ text })))).toContain("readable_text");
    expect(failed(checkAts(input({ text }), { ...ATS_CONFIG, minTextChars: 299 }))).not.toContain(
      "readable_text",
    );
    expect(checkAts(input({ sizeBytes: 3 * MB }), { ...ATS_CONFIG, maxFileBytes: 2 * MB }).status).toBe(
      "NOT_ATS_READY",
    );
    expect(
      failed(checkAts(input({ text: CLEAN_RESUME + "▒".repeat(400) }), { ...ATS_CONFIG, maxSymbolRatio: 0.9 })),
    ).toEqual([]);
    expect(failed(checkAts(input(), { ...ATS_CONFIG, minSections: 4 }))).toEqual(["standard_sections"]);
    expect(failed(checkAts(input(), { ...ATS_CONFIG, allowedContentTypes: [DOCX] }))).toEqual(["file"]);
  });

  it("changed weights and pass mark change the score and status", () => {
    const weights = { ...ATS_CONFIG.weights, standard_sections: 34, layout_noise: 11 };
    const result = checkAts(failing.standard_sections, { ...ATS_CONFIG, weights });
    expect(result.score).toBe(
      weights.readable_text +
        weights.contact_info +
        weights.phone +
        weights.layout_noise +
        weights.file +
        weights.picture,
    );
    expect(result.score).toBe(66);
    expect(result.status).toBe("ATS_READY");
    expect(checkAts(input(), { ...ATS_CONFIG, passScore: 100 }).status).toBe("ATS_READY");
    expect(checkAts(failing.standard_sections, { ...ATS_CONFIG, passScore: 80 }).status).toBe(
      "NOT_ATS_READY",
    );
  });

  it("with no required checks the status falls back to the score alone", () => {
    const none = {
      contact_info: false,
      phone: false,
      standard_sections: false,
      layout_noise: false,
      readable_text: false,
      file: false,
      picture: false,
    };
    const config = { ...ATS_CONFIG, required: none };
    expect(checkAts(failing.file, config).status).toBe("ATS_READY");
    expect(checkAts(failing.readable_text, config).status).toBe("ATS_READY");
    expect(checkAts(failing.contact_info, config).status).toBe("ATS_READY");
    expect(checkAts(failing.picture, config).status).toBe("ATS_READY");
    expect(checkAts(inputFailing(["standard_sections", "layout_noise"]), config).status).toBe(
      "NOT_ATS_READY",
    );
  });

  it("marking another check required changes the outcome", () => {
    const config = { ...ATS_CONFIG, required: { ...ATS_CONFIG.required, standard_sections: true } };
    expect(checkAts(failing.standard_sections).status).toBe("ATS_READY");
    const result = checkAts(failing.standard_sections, config);
    expect(result.score).toBe(75);
    expect(result.status).toBe("NOT_ATS_READY");
    expect(result.checks.find((c) => c.id === "standard_sections")?.required).toBe(true);
  });

  it("a required check that is unmarked no longer blocks a passing score", () => {
    const config = { ...ATS_CONFIG, required: { ...ATS_CONFIG.required, file: false } };
    expect(checkAts(failing.file, config).status).toBe("ATS_READY");
  });

  it("derives the file-type wording from the configured types", () => {
    const config: AtsConfig = {
      ...ATS_CONFIG,
      allowedContentTypes: ["text/plain", "application/pdf", "text/markdown"],
      contentTypeLabels: { "text/plain": "plain text", "application/pdf": "PDF" },
    };
    const result = checkAts(input({ contentType: "image/png" }), config);
    expect(result.reasons[0]).toBe(
      "This file is not a plain text, PDF or text/markdown document.",
    );
    const single: AtsConfig = { ...ATS_CONFIG, allowedContentTypes: ["application/pdf"] };
    expect(checkAts(input({ contentType: DOCX }), single).reasons[0]).toBe(
      "This file is not a PDF document.",
    );
  });

  it("derives the size limit wording from the configured limit", () => {
    const config: AtsConfig = { ...ATS_CONFIG, maxFileBytes: 2 * MB };
    expect(checkAts(input({ sizeBytes: 3 * MB }), config).reasons[0]).toBe(
      "This file is 3 MB, over the 2 MB limit.",
    );
  });

  it("does not mutate the default config", () => {
    const before = JSON.stringify(ATS_CONFIG);
    checkAts(input());
    checkAts(input(), { ...ATS_CONFIG, minTextChars: 1 });
    expect(JSON.stringify(ATS_CONFIG)).toBe(before);
  });
});

describe("determinism", () => {
  it("gives the same output for the same input", () => {
    const first = checkAts(input({ text: TWO_COLUMN_TABLE_RESUME }));
    for (let i = 0; i < 5; i += 1) {
      expect(checkAts(input({ text: TWO_COLUMN_TABLE_RESUME }))).toEqual(first);
    }
  });

  it("does not change its input", () => {
    const given = input();
    const copy = { ...given };
    checkAts(given);
    expect(given).toEqual(copy);
  });
});

describe("sample resumes", () => {
  it("a clean resume passes everything", () => {
    const result = checkAts({ text: CLEAN_RESUME, contentType: PDF, sizeBytes: 180_000, imageCount: 0 });
    expect(result.status).toBe("ATS_READY");
    expect(result.score).toBe(100);
    expect(value(result, "standard_sections")).toBe(3);
    expect(value(result, "contact_info")).toBe(1);
  });

  it("a two-column table export is not ATS-ready, with the noise and sections reasons", () => {
    const result = checkAts({ text: TWO_COLUMN_TABLE_RESUME, contentType: DOCX, sizeBytes: 90_000, imageCount: 0 });
    expect(value(result, "readable_text")).toBeGreaterThanOrEqual(300);
    expect(value(result, "contact_info")).toBe(1);
    expect(value(result, "layout_noise")).toBeGreaterThan(0.15);
    expect(failed(result)).toEqual(["standard_sections", "layout_noise"]);
    expect(result.score).toBe(55);
    expect(result.status).toBe("NOT_ATS_READY");
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons[0]).toMatch(/^Only \d of the standard sections/);
    expect(result.reasons[1]).toMatch(/table or multi-column layout/);
  });

  it("a pipe-and-dash ASCII table export fails layout noise", () => {
    const result = checkAts({ text: ASCII_TABLE_RESUME, contentType: PDF, sizeBytes: 60_000, imageCount: 0 });
    expect(value(result, "readable_text")).toBeGreaterThanOrEqual(300);
    expect(value(result, "contact_info")).toBe(1);
    expect(value(result, "layout_noise")).toBeGreaterThan(0.15);
    expect(failed(result)).toContain("layout_noise");
    expect(result.reasons.some((r) => r.includes("table or multi-column layout"))).toBe(true);
  });

  it("a clean resume full of C++, C#, URLs, phone numbers, percentages, ampersands and dotted leaders passes", () => {
    const result = checkAts({ text: RICH_CLEAN_RESUME, contentType: PDF, sizeBytes: 120_000, imageCount: 0 });
    expect(failed(result)).toEqual([]);
    expect(value(result, "layout_noise")).toBeLessThan(0.1);
    expect(value(result, "standard_sections")).toBe(3);
    expect(result.status).toBe("ATS_READY");
    expect(result.score).toBe(100);
  });

  it("a scanned resume with almost no text is not ATS-ready", () => {
    const result = checkAts({ text: SCANNED_RESUME, contentType: PDF, sizeBytes: 3 * MB, imageCount: 1 });
    expect(result.status).toBe("NOT_ATS_READY");
    expect(failed(result)).toEqual(["readable_text", "contact_info", "phone", "standard_sections", "picture"]);
    expect(result.reasons[0]).toBe(
      "Only 9 characters of text could be read, so this looks like a scanned image or a broken file.",
    );
  });
});

describe("performance and hostile input", () => {
  const MEGABYTE = 1024 * 1024;
  const QUARTER = MEGABYTE / 4;
  const CEILING_MS = 750;
  const SCALING_FACTOR = 12;

  function median(text: string): number {
    const runs: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const start = performance.now();
      checkAts({ text, contentType: PDF, sizeBytes: text.length, imageCount: 0 });
      runs.push(performance.now() - start);
    }
    runs.sort((a, b) => a - b);
    return runs[2];
  }

  const shapes: Array<[string, (bytes: number) => string]> = [
    ["a realistic resume repeated", (n) => CLEAN_RESUME.repeat(Math.ceil(n / CLEAN_RESUME.length))],
    ["one long word", (n) => "a".repeat(n)],
    ["only at signs", (n) => "@".repeat(n)],
    ["a@ repeated", (n) => "a@".repeat(n / 2)],
    ["near-miss emails", (n) => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@b.".repeat(Math.ceil(n / 42))],
    ["long local part and long domain", (n) => `${"a".repeat(n / 2)}@${"b.".repeat(n / 4)}`],
    ["dots and hyphens", (n) => "a-.".repeat(n / 3)],
    ["whitespace only", (n) => " \n\t".repeat(n / 3)],
    ["all symbols", (n) => "▒".repeat(n)],
    ["pipes and rules", (n) => "|---".repeat(n / 4)],
    ["colons and bullets", (n) => "• Skills: ".repeat(n / 10)],
    ["many short heading lines", (n) => "Skills\n".repeat(n / 7)],
    ["many distinct short lines", (n) => Array.from({ length: n / 9 }, (_, i) => `Line${i}`).join("\n")],
    ["one huge line with a heading prefix", (n) => `1. ${" ".repeat(n)}Skills`],
    ["decomposed accents", (n) => "e\u0301".repeat(n / 2)],
    ["non-Latin", (n) => "ソフトウェア".repeat(n / 6)],
  ];

  it.each(shapes)("handles 1 MB of %s under the ceiling and scales linearly", (_name, make) => {
    const small = make(QUARTER);
    const large = make(MEGABYTE);
    expect(large.length).toBeGreaterThanOrEqual(MEGABYTE - 50);
    const smallMs = median(small);
    const largeMs = median(large);
    expect(largeMs).toBeLessThan(CEILING_MS);
    expect(largeMs / Math.max(smallMs, 2)).toBeLessThan(SCALING_FACTOR);
  });
});

describe("config safety", () => {
  it("the default config is frozen all the way down", () => {
    expect(Object.isFrozen(ATS_CONFIG)).toBe(true);
    expect(Object.isFrozen(ATS_CONFIG.weights)).toBe(true);
    expect(Object.isFrozen(ATS_CONFIG.required)).toBe(true);
    expect(Object.isFrozen(ATS_CONFIG.requiredSections)).toBe(true);
    expect(Object.isFrozen(ATS_CONFIG.sectionHeadings)).toBe(true);
    expect(Object.isFrozen(ATS_CONFIG.sectionHeadings.skills)).toBe(true);
    expect(Object.isFrozen(ATS_CONFIG.allowedContentTypes)).toBe(true);
  });

  it("mutating the default config throws, and is a type error", () => {
    expect(() => {
      // @ts-expect-error minTextChars is read-only
      ATS_CONFIG.minTextChars = 1;
    }).toThrow(TypeError);
    expect(() => {
      // @ts-expect-error weights are read-only
      ATS_CONFIG.weights.file = 1;
    }).toThrow(TypeError);
    expect(() => {
      // @ts-expect-error lists are read-only
      ATS_CONFIG.requiredSections.push("projects");
    }).toThrow(TypeError);
    expect(ATS_CONFIG.minTextChars).toBe(300);
  });

  function withWeights(weights: Partial<Record<AtsCheckId, number>>): AtsConfig {
    return { ...ATS_CONFIG, weights: { ...ATS_CONFIG.weights, ...weights } };
  }

  it("rejects weights that do not add up to 100, naming the problem", () => {
    expect(() => checkAts(input(), withWeights({ file: 14 }))).toThrow(
      "Invalid ATS config: weights must add up to 100, but add up to 109.",
    );
    expect(() => checkAts(input(), withWeights({ standard_sections: 15 }))).toThrow(/add up to 90/);
    expect(() => checkAts(input(), withWeights({ picture: 0 }))).toThrow(/add up to 90/);
  });

  it("rejects a negative, NaN, infinite or missing weight, naming the field", () => {
    expect(() => checkAts(input(), withWeights({ file: -5, layout_noise: 41 }))).toThrow(
      "Invalid ATS config: weights.file must be between 0 and 100.",
    );
    expect(() => checkAts(input(), withWeights({ file: Number.NaN }))).toThrow(
      "Invalid ATS config: weights.file must be a finite number.",
    );
    expect(() => checkAts(input(), withWeights({ file: Number.POSITIVE_INFINITY }))).toThrow(
      /weights\.file must be a finite number/,
    );
    const rest = Object.fromEntries(Object.entries(ATS_CONFIG.weights).filter(([id]) => id !== "contact_info"));
    const missing = { ...ATS_CONFIG, weights: rest } as unknown as AtsConfig;
    expect(() => checkAts(input(), missing)).toThrow(
      "Invalid ATS config: weights.contact_info must be a finite number.",
    );
  });

  it("rejects a missing or non-boolean required flag", () => {
    const rest = Object.fromEntries(Object.entries(ATS_CONFIG.required).filter(([id]) => id !== "file"));
    const missing = { ...ATS_CONFIG, required: rest } as unknown as AtsConfig;
    expect(() => checkAts(input(), missing)).toThrow(
      "Invalid ATS config: required.file must be true or false.",
    );
    const noPhone = Object.fromEntries(Object.entries(ATS_CONFIG.required).filter(([id]) => id !== "phone"));
    expect(() => checkAts(input(), { ...ATS_CONFIG, required: noPhone } as unknown as AtsConfig)).toThrow(
      "Invalid ATS config: required.phone must be true or false.",
    );
  });

  it("rejects a missing picture weight, naming the field", () => {
    const rest = Object.fromEntries(Object.entries(ATS_CONFIG.weights).filter(([id]) => id !== "picture"));
    const missing = { ...ATS_CONFIG, weights: rest } as unknown as AtsConfig;
    expect(() => checkAts(input(), missing)).toThrow(
      "Invalid ATS config: weights.picture must be a finite number.",
    );
  });

  it("rejects a picture limit that is not a whole number of zero or more, naming the field", () => {
    expect(() => checkAts(input(), { ...ATS_CONFIG, maxImages: 0.5 })).toThrow(
      "Invalid ATS config: maxImages must be a whole number.",
    );
    expect(() => checkAts(input(), { ...ATS_CONFIG, maxImages: -1 })).toThrow(
      /^Invalid ATS config: maxImages must be between 0 and/,
    );
    const missing = { ...ATS_CONFIG, maxImages: undefined } as unknown as AtsConfig;
    expect(() => checkAts(input(), missing)).toThrow("Invalid ATS config: maxImages must be a finite number.");
  });

  it.each([
    ["passScore", { passScore: 101 }],
    ["passScore", { passScore: -1 }],
    ["passScore", { passScore: Number.NaN }],
    ["minTextChars", { minTextChars: Number.NaN }],
    ["minTextChars", { minTextChars: -5 }],
    ["minSections", { minSections: Number.POSITIVE_INFINITY }],
    ["maxSymbolRatio", { maxSymbolRatio: 1.5 }],
    ["maxSymbolRatio", { maxSymbolRatio: Number.NaN }],
    ["maxFileBytes", { maxFileBytes: Number.NaN }],
    ["maxHeadingChars", { maxHeadingChars: 0 }],
    ["maxImages", { maxImages: Number.NaN }],
    ["maxImages", { maxImages: -1 }],
    ["maxImages", { maxImages: 1.5 }],
  ])("rejects an invalid %s", (field, override) => {
    expect(() => checkAts(input(), { ...ATS_CONFIG, ...override })).toThrow(
      new RegExp(`Invalid ATS config: ${field} must`),
    );
  });

  it("accepts boundary values and validates a config once per object", () => {
    const edge: AtsConfig = {
      ...ATS_CONFIG,
      passScore: 0,
      maxSymbolRatio: 1,
      minTextChars: 0,
      weights: {
        readable_text: 0,
        file: 0,
        contact_info: 0,
        phone: 0,
        picture: 0,
        standard_sections: 0,
        layout_noise: 100,
      },
    };
    expect(checkAts(input({ text: "" }), edge).score).toBe(100);
    expect(checkAts(input({ text: "" }), edge).score).toBe(100);
  });
});

describe("unexpected runtime input", () => {
  const bad = (overrides: Record<string, unknown>) =>
    checkAts({ ...input(), ...overrides } as unknown as AtsInput);

  it.each([null, undefined, 42, {}, ["text"]])("a text of %j is not ATS-ready and does not throw", (text) => {
    const result = bad({ text });
    expect(result.status).toBe("NOT_ATS_READY");
    expect(failed(result)).toContain("readable_text");
    expect(result.reasons[0]).toBe("No text was provided for this resume, so it cannot be checked.");
    expect(result.checks).toHaveLength(7);
  });

  it.each([null, undefined, 7, {}])("a content type of %j fails the file check", (contentType) => {
    const result = bad({ contentType });
    expect(result.status).toBe("NOT_ATS_READY");
    expect(failed(result)).toEqual(["file"]);
    expect(result.reasons).toEqual(["This file has no known file type."]);
  });

  it.each([null, undefined, "5", {}])("a size of %j fails the file check", (sizeBytes) => {
    const result = bad({ sizeBytes });
    expect(failed(result)).toEqual(["file"]);
    expect(result.reasons).toEqual(["This file has an unknown size."]);
  });

  it.each([null, undefined, -1, Number.NaN, "2", {}])(
    "a picture count of %j is treated as not counted and passes the picture check",
    (imageCount) => {
      const result = bad({ imageCount });
      expect(failed(result)).toEqual([]);
      expect(value(result, "picture")).toBe(0);
    },
  );

  it("everything wrong at once still returns seven checks", () => {
    const result = bad({ text: null, contentType: null, sizeBytes: null, imageCount: null });
    expect(result.status).toBe("NOT_ATS_READY");
    expect(result.checks).toHaveLength(7);
    expect(result.score).toBe(ATS_CONFIG.weights.layout_noise + ATS_CONFIG.weights.picture);
    expect(result.reasons).toHaveLength(5);
  });

  it("a text of null bytes has no readable characters", () => {
    const result = checkAts(input({ text: "\u0000".repeat(5000) }));
    expect(value(result, "readable_text")).toBe(0);
    expect(value(result, "layout_noise")).toBe(0);
    expect(result.reasons[0]).toMatch(/^No text could be read/);
    const mixed = checkAts(input({ text: `${"\u0000".repeat(400)}${"a".repeat(10)}` }));
    expect(value(mixed, "readable_text")).toBe(10);
  });
});

describe("database columns", () => {
  it("maps a result to the resumes ats columns", () => {
    const result = checkAts(failing.file);
    expect(toAtsColumns(result)).toEqual({
      ats_status: "NOT_ATS_READY",
      ats_score: 95,
      ats_reasons: ["This file is not a PDF or Word (DOCX) document."],
    });
  });

  it("maps a passing result to an empty reasons array", () => {
    expect(toAtsColumns(checkAts(input()))).toEqual({
      ats_status: "ATS_READY",
      ats_score: 100,
      ats_reasons: [],
    });
  });

  it("copies the reasons instead of sharing the array", () => {
    const result = checkAts(failing.file);
    expect(toAtsColumns(result).ats_reasons).not.toBe(result.reasons);
  });

  it("uses status strings the resumes table accepts", () => {
    const row: Database["public"]["Tables"]["resumes"]["Update"] = toAtsColumns(checkAts(input()));
    expect(row.ats_status).toBe("ATS_READY");
  });
});
