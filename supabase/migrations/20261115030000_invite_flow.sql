-- invite_flow
-- Moves the schema from "candidates take an automated interview" to
-- "a recruiter approves, then one invitation email is sent".
-- Source of truth: docs/DATA_MODELING.md.
--
-- DECISION: nothing contacts a candidate without a person's click, so the
-- tables that drove the automated interview are removed and the click gets
-- its own record (invitations).
--
-- Safe to re-run: every statement is guarded (if exists / if not exists),
-- and the data updates only touch rows still holding an old value.

-- ---------------------------------------------------------------------------
-- 1. Remove the automated interview
-- ---------------------------------------------------------------------------

drop table if exists public.screenings;
drop table if exists public.interview_tokens;

-- ---------------------------------------------------------------------------
-- 2. jobs: progress is counted from the resumes, so the stored status goes.
--    One less value that can fall out of step when runs finish in any order.
-- ---------------------------------------------------------------------------

alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs drop column if exists status;

-- ---------------------------------------------------------------------------
-- 3. resumes: a `scored` status and the workflow run that handled the file
-- ---------------------------------------------------------------------------

alter table public.resumes add column if not exists run_id text;

alter table public.resumes drop constraint if exists resumes_status_check;

-- A resume that already has a candidate row was scored.
update public.resumes r
   set status = 'scored'
 where r.status = 'extracted'
   and exists (select 1 from public.candidates c where c.resume_id = r.id);

alter table public.resumes
  add constraint resumes_status_check
  check (status in ('pending', 'extracted', 'scored', 'failed'));

-- ---------------------------------------------------------------------------
-- 4. candidates: the address an invitation goes to, and the new invite states
-- ---------------------------------------------------------------------------

alter table public.candidates add column if not exists email text;

alter table public.candidates drop constraint if exists candidates_invite_status_check;

-- The old values described an interview link, not a person's approval.
-- No recruiter has approved anyone yet, so every candidate starts at NONE.
update public.candidates
   set invite_status = 'NONE'
 where invite_status not in ('NONE', 'APPROVED', 'SENT', 'FAILED');

alter table public.candidates
  add constraint candidates_invite_status_check
  check (invite_status in ('NONE', 'APPROVED', 'SENT', 'FAILED'));

-- ---------------------------------------------------------------------------
-- 5. invitations: the record of the human decision and of the email after it.
--    unique (candidate_id) is what makes the send safe to retry: a second
--    click or a repeated step finds the existing row instead of adding one.
-- ---------------------------------------------------------------------------

create table if not exists public.invitations (
  id           uuid        primary key default gen_random_uuid(),
  candidate_id uuid        not null references public.candidates (id) on delete cascade,
  approved_by  uuid        not null,
  approved_at  timestamptz not null default now(),
  sent_to      text        not null,
  sent_at      timestamptz,
  message_id   text,
  error        text,
  constraint invitations_candidate_id_key unique (candidate_id)
);

alter table public.invitations enable row level security;

drop policy if exists "authenticated full access" on public.invitations;
create policy "authenticated full access" on public.invitations
  for all to authenticated using (true) with check (true);

-- New tables are not exposed to the API roles by default.
grant select, insert, update, delete on public.invitations to authenticated, service_role;
revoke all on public.invitations from anon;
