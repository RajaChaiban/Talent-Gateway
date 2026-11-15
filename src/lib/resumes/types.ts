import type { Tables } from "@/lib/supabase/database.types";

/** What the job page lists for each resume. */
export type ResumeListItem = Pick<Tables<"resumes">, "id" | "file_name" | "status" | "created_at">;

/** A resume row with its storage path and extracted text: what the server reads to judge, download or remove a file. */
export type StoredResume = Pick<
  Tables<"resumes">,
  "id" | "job_id" | "storage_path" | "file_name" | "status" | "extracted_text"
>;
