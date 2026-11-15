import type { TablesUpdate } from "@/lib/supabase/database.types";
import type { AtsResult, AtsStatus } from "./types";

type ResumeAtsColumns = Required<
  Pick<TablesUpdate<"resumes">, "ats_status" | "ats_score" | "ats_reasons">
> & { ats_status: AtsStatus };

/** The `resumes` columns the screening pipeline saves for a check result. */
export function toAtsColumns(result: AtsResult): ResumeAtsColumns {
  return {
    ats_status: result.status,
    ats_score: result.score,
    ats_reasons: [...result.reasons],
  };
}
