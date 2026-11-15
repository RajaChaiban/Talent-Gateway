import type { Tables } from "@/lib/supabase/database.types";

/** What the job page lists for each resume. */
export type ResumeListItem = Pick<Tables<"resumes">, "id" | "file_name" | "status" | "created_at">;

export type StoredResume = Pick<
  Tables<"resumes">,
  "id" | "job_id" | "storage_path" | "file_name" | "status" | "extracted_text"
>;
