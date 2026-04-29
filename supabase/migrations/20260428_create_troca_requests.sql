create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.troca_requests (
  id uuid primary key default gen_random_uuid(),
  group_key text not null,
  request_type text not null default 'day_off_swap' check (request_type in ('day_off_swap', 'ft')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled', 'launched')),
  origin text not null default 'portal-nexti',
  payroll_reference text not null,
  payroll_period_start date not null,
  payroll_period_end date not null,
  requester_enrolment text not null,
  requester_name text not null,
  requester_person_id bigint,
  requester_external_id text,
  requester_rotation_code integer,
  substitute_enrolment text not null,
  substitute_name text not null,
  substitute_person_id bigint,
  substitute_external_id text,
  substitute_rotation_code integer,
  workplace_name text not null,
  workplace_id bigint,
  workplace_external_id text,
  work_date date not null,
  off_date date not null,
  reason text not null,
  whatsapp_target_phone text,
  whatsapp_message text,
  requester_payload jsonb not null default '{}'::jsonb,
  substitute_payload jsonb not null default '{}'::jsonb,
  workplace_payload jsonb not null default '{}'::jsonb,
  nexti_draft jsonb not null default '{}'::jsonb,
  nexti_match_payload jsonb not null default '{}'::jsonb,
  nexti_match_source text not null default 'none' check (nexti_match_source in ('none', 'schedule_transfer', 'replacement')),
  nexti_match_status text not null default 'not_checked' check (nexti_match_status in ('not_checked', 'matched', 'not_found', 'error', 'not_applicable')),
  nexti_match_error text,
  nexti_last_checked_at timestamptz,
  request_payload jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  approved_by text,
  rejected_at timestamptz,
  rejected_by text,
  decision_note text,
  launched_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists troca_requests_group_key_idx on public.troca_requests (group_key);
create index if not exists troca_requests_status_idx on public.troca_requests (status);
create index if not exists troca_requests_payroll_reference_idx on public.troca_requests (payroll_reference);
create index if not exists troca_requests_created_at_idx on public.troca_requests (created_at desc);

drop trigger if exists set_troca_requests_updated_at on public.troca_requests;
create trigger set_troca_requests_updated_at
before update on public.troca_requests
for each row
execute function public.set_updated_at();

alter table public.troca_requests enable row level security;
