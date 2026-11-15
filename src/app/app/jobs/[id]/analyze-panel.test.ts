import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { JobProgress } from "@/lib/screening/analyze-client";
import { settleUnfinishedRun } from "@/lib/screening/analyze-client";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { AnalyzePanel, AnalyzePanelView } = await import("./analyze-panel");
type ViewProps = Parameters<typeof AnalyzePanelView>[0];

const progress = (over: Partial<JobProgress> = {}): JobProgress => ({
  total: 6,
  extracted: 6,
  ats_failed: 1,
  scored: 2,
  failed: 0,
  remaining: 3,
  status: "ANALYZING",
  ...over,
});

function view(over: Partial<ViewProps>): string {
  return renderToStaticMarkup(
    createElement(AnalyzePanelView, {
      pending: 6,
      phase: "idle",
      progress: null,
      failed: 0,
      message: null,
      onAnalyze: () => undefined,
      ...over,
    }),
  );
}

/** The disabled attribute (not the `disabled:` Tailwind variants in the class list). */
const DISABLED = /\sdisabled(?:=""|\s|>)/;

/** The main button's markup, from its opening tag to its closing tag. */
function mainButton(html: string): string {
  const buttons = html.match(/<button[\s\S]*?<\/button>/g) ?? [];
  return buttons.at(-1) ?? "";
}

describe("Analyze panel states", () => {
  it("idle: shows how many resumes need work on an enabled button, no progress", () => {
    const html = view({ pending: 6 });
    expect(mainButton(html)).toContain("Analyze 6 resumes");
    expect(mainButton(html)).not.toMatch(DISABLED);
    expect(html).not.toContain("progressbar");
    expect(html).not.toContain("Retry failed");
  });

  it("nothing to analyze: the button says so and is disabled", () => {
    const html = view({ pending: 0 });
    expect(mainButton(html)).toContain("Nothing to analyze");
    expect(mainButton(html)).toMatch(DISABLED);
  });

  it("running: disabled with a spinner, starting until progress arrives, then N of M analyzed", () => {
    const starting = view({ phase: "running" });
    expect(mainButton(starting)).toContain("Analyzing…");
    expect(mainButton(starting)).toMatch(DISABLED);
    expect(starting).toContain("Starting…");

    const html = view({ phase: "running", progress: progress() });
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="3"');
    expect(html).toContain('aria-valuemax="6"');
    expect(html).toContain("3 of 6 analyzed");
    expect(html).toContain("scaleX(0.5)");
  });

  it("done: says Done and how many were set aside, with no Retry", () => {
    const html = view({ phase: "finished", pending: 0, progress: progress({ remaining: 0, status: "DONE" }) });
    expect(html).toContain("6 of 6 analyzed");
    expect(html).toContain("Done.");
    expect(html).toContain("1 resume not ATS-ready, set aside.");
    expect(html).not.toContain("Retry failed");
  });

  it("done with failures: names the count and offers Retry failed", () => {
    const html = view({
      phase: "finished",
      pending: 2,
      failed: 2,
      progress: progress({ remaining: 0, failed: 2, status: "DONE" }),
    });
    expect(html).toContain("2 failed");
    expect(html).toContain("Retry failed");
    expect(mainButton(html)).toContain("Analyze 2 resumes");
  });

  it("error: shows the message", () => {
    expect(view({ phase: "error", message: "Job not found" })).toContain("Job not found");
  });

  it("the stateful panel renders its idle state from props", () => {
    const html = renderToStaticMarkup(
      createElement(AnalyzePanel, { jobId: "j", jobStatus: "DONE", pending: 0 }),
    );
    expect(mainButton(html)).toContain("Nothing to analyze");
  });
});

describe("mounting on a job left ANALYZING", () => {
  const signal = () => new AbortController().signal;

  it("reads progress once and asks for a refresh when the job settled", async () => {
    const read = vi.fn(async () => progress({ remaining: 0, status: "DONE" }));
    await expect(settleUnfinishedRun("j", "ANALYZING", signal(), read)).resolves.toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("does not refresh when work still remains", async () => {
    const read = vi.fn(async () => progress());
    await expect(settleUnfinishedRun("j", "ANALYZING", signal(), read)).resolves.toBe(false);
  });

  it("does nothing for a job that is not ANALYZING", async () => {
    const read = vi.fn(async () => progress());
    await expect(settleUnfinishedRun("j", "DONE", signal(), read)).resolves.toBe(false);
    expect(read).not.toHaveBeenCalled();
  });
});
