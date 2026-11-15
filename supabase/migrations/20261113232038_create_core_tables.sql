-- create_core_tables
-- The five core tables, their constraints and indexes, row-level security,
-- and the private `resumes` storage bucket. Source of truth: docs/DATA_MODELING.md.
-- Safe to re-run: tables and indexes use `if not exists`, policies are dropped
-- before being created, and the bucket insert is an upsert.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.jobs (
  id                   uuid        primary key default gen_random_uuid(),
  title                text        not null,
  description          text        not null,
  top_talent_threshold int         not null default 80,
  invite_threshold     int         not null default 70,
  status               text        not null default 'CREATED',
  created_at           timestamptz not null default now(),
  constraint jobs_title_length check (char_length(title) between 1 and 200),
  constraint jobs_top_talent_threshold_range check (top_talent_threshold between 0 and 100),
  constraint jobs_invite_threshold_range check (invite_threshold between 0 and 100),
  constraint jobs_status_check check (status in ('CREATED', 'ANALYZING', 'DONE', 'ERROR'))
);

create table if not exists public.resumes (
  id             uuid        primary key default gen_random_uuid(),
  job_id         uuid        not null references public.jobs (id) on delete cascade,
  storage_path   text        not null,
  file_name      text        not null,
  extracted_text text,
  status         text        not null default 'pending',
  ats_status     text,
  ats_score      int,
  ats_reasons    text[]      not null default '{}',
  ats_override   boolean     not null default false,
  created_at     timestamptz not null default now(),
  constraint resumes_storage_path_key unique (storage_path),
  constraint resumes_id_job_id_key unique (id, job_id),
  constraint resumes_status_check check (status in ('pending', 'extracted', 'failed')),
  constraint resumes_ats_status_check check (ats_status in ('ATS_READY', 'NOT_ATS_READY')),
  constraint resumes_ats_score_range check (ats_score between 0 and 100)
);

create table if not exists public.candidates (
  id            uuid        primary key default gen_random_uuid(),
  job_id        uuid        not null references public.jobs (id) on delete cascade,
  resume_id     uuid        not null,
  full_name     text        not null,
  match_score   int         not null,
  match_summary text        not null,
  strengths     text[]      not null default '{}',
  gaps          text[]      not null default '{}',
  radar_results jsonb       not null default '{}',
  invite_status text        not null default 'NONE',
  created_at    timestamptz not null default now(),
  constraint candidates_job_id_resume_id_key unique (job_id, resume_id),
  constraint candidates_resume_id_key unique (resume_id),
  -- The resume must belong to the same job as the candidate.
  constraint candidates_resume_same_job_fkey foreign key (resume_id, job_id)
    references public.resumes (id, job_id) on delete cascade,
  constraint candidates_match_score_range check (match_score between 0 and 100),
  constraint candidates_invite_status_check check (invite_status in ('NONE', 'READY', 'COMPLETED'))
);

create table if not exists public.interview_tokens (
  id           uuid        primary key default gen_random_uuid(),
  candidate_id uuid        not null references public.candidates (id) on delete cascade,
  token        text        not null,
  expires_at   timestamptz not null default (now() + interval '7 days'),
  used_at      timestamptz,
  created_at   timestamptz not null default now(),
  constraint interview_tokens_candidate_id_key unique (candidate_id),
  constraint interview_tokens_token_key unique (token)
);

create table if not exists public.screenings (
  id           uuid        primary key default gen_random_uuid(),
  candidate_id uuid        not null references public.candidates (id) on delete cascade,
  questions    jsonb       not null default '[]',
  answers      jsonb       not null default '[]',
  score        int,
  verdict      text,
  summary      text,
  created_at   timestamptz not null default now(),
  constraint screenings_candidate_id_key unique (candidate_id),
  constraint screenings_score_range check (score between 0 and 100),
  constraint screenings_verdict_check check (verdict in ('PASS', 'CONSIDER', 'NO'))
);

-- ---------------------------------------------------------------------------
-- Indexes (unique constraints above already index candidates (job_id, resume_id),
-- interview_tokens (token), interview_tokens (candidate_id), screenings (candidate_id)
-- and resumes (storage_path))
-- ---------------------------------------------------------------------------

create index if not exists resumes_job_id_idx
  on public.resumes (job_id);

create index if not exists candidates_job_id_match_score_idx
  on public.candidates (job_id, match_score desc);

-- ---------------------------------------------------------------------------
-- Row-level security: single demo tenant. `authenticated` may do everything,
-- `anon` has no policy and no table privileges, `service_role` bypasses RLS.
-- ---------------------------------------------------------------------------

alter table public.jobs             enable row level security;
alter table public.resumes          enable row level security;
alter table public.candidates       enable row level security;
alter table public.interview_tokens enable row level security;
alter table public.screenings       enable row level security;

drop policy if exists "authenticated full access" on public.jobs;
create policy "authenticated full access" on public.jobs
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.resumes;
create policy "authenticated full access" on public.resumes
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.candidates;
create policy "authenticated full access" on public.candidates
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.interview_tokens;
create policy "authenticated full access" on public.interview_tokens
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.screenings;
create policy "authenticated full access" on public.screenings
  for all to authenticated using (true) with check (true);

-- Table privileges. New tables are not exposed to the API roles by default, so
-- grant them explicitly. `anon` gets nothing: candidates never query the
-- database from the browser.
grant select, insert, update, delete
  on public.jobs, public.resumes, public.candidates, public.interview_tokens, public.screenings
  to authenticated, service_role;

revoke all
  on public.jobs, public.resumes, public.candidates, public.interview_tokens, public.screenings
  from anon;

-- ---------------------------------------------------------------------------
-- Storage: private `resumes` bucket, PDF or DOCX, 5 MB (5 MiB = 5242880 bytes).
-- Paths are `{job_id}/{resume_id}/{file_name}`.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  false,
  5242880,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "resumes bucket authenticated access" on storage.objects;
create policy "resumes bucket authenticated access" on storage.objects
  for all to authenticated
  using (bucket_id = 'resumes')
  with check (bucket_id = 'resumes');
