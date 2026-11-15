-- job_status
-- Brings back the stored status of a job's analysis run.
-- Source of truth: docs/DATA_MODELING.md.
--
-- DECISION: the invite_flow migration dropped this column on the idea that
-- progress could be counted from the resumes alone. The analyze flow needs
-- one stored value the job page, the Analyze button and the progress bar can
-- all agree on while several resumes finish in any order, so it is stored
-- again. It is settled from the resumes' own results, never set by hand.
--
-- Safe to re-run: every statement is guarded.

alter table public.jobs
  add column if not exists status text not null default 'CREATED';

alter table public.jobs drop constraint if exists jobs_status_check;

alter table public.jobs
  add constraint jobs_status_check
  check (status in ('CREATED', 'ANALYZING', 'DONE', 'ERROR'));
