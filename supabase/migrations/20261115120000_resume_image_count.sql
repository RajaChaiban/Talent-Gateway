-- resume_image_count
-- Stores how many pictures a resume file holds, counted when its text is
-- extracted, so the ATS check can set aside a resume with a photo or graphic.
-- Source of truth: docs/DATA_MODELING.md.
--
-- DECISION: the count is taken from the file while it is already in memory
-- for text extraction (PDF image drawing operations, DOCX word/media/ files)
-- and saved on the row, so the check needs no second download and no model.
-- Null means "not counted" (a row extracted before this column existed) and
-- passes the picture check.
--
-- Safe to re-run: every statement is guarded.

alter table public.resumes
  add column if not exists image_count int;

alter table public.resumes drop constraint if exists resumes_image_count_check;

alter table public.resumes
  add constraint resumes_image_count_check
  check (image_count >= 0);
