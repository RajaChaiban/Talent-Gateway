import { MockLanguageModelV4 } from "ai/test";
import { RADAR_INSTRUCTIONS } from "@/lib/ai/prompts";
import { CLEAN_RESUME, SCANNED_RESUME } from "@/lib/ats/test-fixtures";
import { FakeDb, type Row } from "./fake-supabase";
import { answer, messageText, RADAR_ANSWER, SCORE_ANSWER, type CallOptions } from "./mock-model";

export const READY_TEXT = CLEAN_RESUME;
export const NOT_READY_TEXT = SCANNED_RESUME;

type Reply = (options: CallOptions) => unknown;

/**
 * The model every screening test uses in place of AI Gateway: one
 * MockLanguageModelV4 that answers score and Radar calls (told apart by their
 * instructions) and records every call.
 */
export class ScreeningModel {
  readonly calls: { kind: "score" | "radar"; options: CallOptions }[] = [];
  score: Reply = () => SCORE_ANSWER;
  radar: Reply = () => RADAR_ANSWER;
  /** Milliseconds each call waits before answering, to let concurrent calls interleave. */
  delayMs = 0;
  /** Runs before each call answers, e.g. to check what the database holds at that moment. */
  onCall: ((kind: "score" | "radar") => void) | null = null;

  readonly model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const kind = messageText(options, "system") === RADAR_INSTRUCTIONS ? "radar" : "score";
      this.calls.push({ kind, options });
      this.onCall?.(kind);
      if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      return answer((kind === "radar" ? this.radar : this.score)(options));
    },
  });

  count(kind?: "score" | "radar"): number {
    return kind ? this.calls.filter((call) => call.kind === kind).length : this.calls.length;
  }
}

export function seedJob(db: FakeDb, over: Row = {}): Row {
  return db.insertRow("jobs", {
    title: "Backend engineer",
    description: "Build APIs in TypeScript and Postgres.",
    ...over,
  });
}

export function seedResume(db: FakeDb, jobId: string, over: Row = {}): Row {
  const id = (over.id as string | undefined) ?? crypto.randomUUID();
  return db.insertRow("resumes", {
    id,
    job_id: jobId,
    file_name: "Priya Natarajan.pdf",
    storage_path: `${jobId}/${id}/resume.pdf`,
    status: "extracted",
    extracted_text: READY_TEXT,
    image_count: 0,
    ...over,
  });
}
