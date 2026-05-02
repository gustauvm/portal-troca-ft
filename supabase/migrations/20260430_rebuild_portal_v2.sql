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

create or replace function public.normalize_digits(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(value, ''), '\D', '', 'g');
$$;

create table if not exists public.operator_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'operator' check (role in ('operator', 'admin')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_operator_profiles_updated_at on public.operator_profiles;
create trigger set_operator_profiles_updated_at
before update on public.operator_profiles
for each row
execute function public.set_updated_at();

create or replace function public.has_operator_role(roles text[] default array['operator', 'admin'])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.operator_profiles
    where user_id = auth.uid()
      and role = any(roles)
  );
$$;

create table if not exists public.employee_directory (
  id uuid primary key default gen_random_uuid(),
  nexti_person_id bigint not null,
  person_external_id text not null,
  enrolment text not null,
  enrolment_aliases text[] not null default '{}'::text[],
  cpf_digits text not null,
  full_name text not null,
  group_key text not null,
  company_id bigint,
  company_name text not null,
  company_external_id text,
  company_number text,
  business_unit_id bigint,
  business_unit_name text,
  workplace_id bigint,
  workplace_external_id text,
  workplace_name text,
  client_name text,
  career_id bigint,
  career_external_id text,
  career_name text,
  schedule_id bigint,
  schedule_external_id text,
  schedule_name text,
  shift_id bigint,
  shift_external_id text,
  shift_name text,
  rotation_id bigint,
  rotation_code integer,
  person_situation_id integer not null default 1,
  situation_label text not null default 'ATIVO',
  admission_date date,
  is_active boolean not null default true,
  sync_fingerprint text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_synced_at timestamptz not null default timezone('utc', now()),
  constraint employee_directory_group_person_unique unique (group_key, nexti_person_id),
  constraint employee_directory_group_external_unique unique (group_key, person_external_id)
);

create index if not exists employee_directory_group_idx on public.employee_directory (group_key);
create index if not exists employee_directory_active_idx on public.employee_directory (group_key, is_active);
create index if not exists employee_directory_company_idx on public.employee_directory (company_id, career_id);
create index if not exists employee_directory_enrolment_idx on public.employee_directory (enrolment);
create index if not exists employee_directory_aliases_idx on public.employee_directory using gin (enrolment_aliases);
create index if not exists employee_directory_cpf_idx on public.employee_directory (cpf_digits);
create index if not exists employee_directory_name_idx on public.employee_directory (full_name);

drop trigger if exists set_employee_directory_updated_at on public.employee_directory;
create trigger set_employee_directory_updated_at
before update on public.employee_directory
for each row
execute function public.set_updated_at();

create table if not exists public.workplace_directory (
  id uuid primary key default gen_random_uuid(),
  nexti_workplace_id bigint not null,
  workplace_external_id text not null,
  name text not null,
  client_name text,
  service_name text,
  group_key text not null,
  company_id bigint,
  company_name text,
  company_external_id text,
  company_number text,
  business_unit_id bigint,
  business_unit_name text,
  is_active boolean not null default true,
  sync_fingerprint text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_synced_at timestamptz not null default timezone('utc', now()),
  constraint workplace_directory_group_workplace_unique unique (group_key, nexti_workplace_id),
  constraint workplace_directory_group_external_unique unique (group_key, workplace_external_id)
);

create index if not exists workplace_directory_group_idx on public.workplace_directory (group_key);
create index if not exists workplace_directory_active_idx on public.workplace_directory (group_key, is_active);
create index if not exists workplace_directory_company_idx on public.workplace_directory (company_id);
create index if not exists workplace_directory_name_idx on public.workplace_directory (name);

drop trigger if exists set_workplace_directory_updated_at on public.workplace_directory;
create trigger set_workplace_directory_updated_at
before update on public.workplace_directory
for each row
execute function public.set_updated_at();

create table if not exists public.portal_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('swap', 'ft')),
  workflow_status text not null default 'submitted' check (workflow_status in ('submitted', 'approved', 'rejected', 'cancelled')),
  launch_status text not null default 'waiting' check (launch_status in ('waiting', 'matched', 'not_found', 'error')),
  launch_source text not null check (launch_source in ('schedule_transfer', 'replacement')),
  origin text not null default 'portal-v2',
  group_key text not null,
  payroll_reference text not null,
  payroll_period_start date not null,
  payroll_period_end date not null,
  requester_employee_id uuid not null references public.employee_directory (id),
  substitute_employee_id uuid references public.employee_directory (id),
  requester_nexti_person_id bigint not null,
  substitute_nexti_person_id bigint,
  requester_person_external_id text not null,
  substitute_person_external_id text,
  requester_name text not null,
  requester_enrolment text not null,
  substitute_name text,
  substitute_enrolment text,
  company_id bigint,
  company_name text not null,
  career_id bigint,
  career_name text not null,
  schedule_id bigint,
  schedule_name text,
  shift_id bigint,
  shift_name text,
  workplace_id bigint,
  workplace_external_id text,
  workplace_name text,
  request_date date not null,
  coverage_date date,
  reason text not null,
  validation_summary jsonb not null default '{}'::jsonb,
  request_snapshot jsonb not null default '{}'::jsonb,
  nexti_payload jsonb not null default '{}'::jsonb,
  nexti_match_payload jsonb not null default '{}'::jsonb,
  launch_error text,
  approved_at timestamptz,
  approved_by uuid references auth.users (id),
  rejected_at timestamptz,
  rejected_by uuid references auth.users (id),
  cancelled_at timestamptz,
  cancelled_by_employee_id uuid references public.employee_directory (id),
  launched_at timestamptz,
  assigned_operator_user_id uuid references auth.users (id),
  assigned_operator_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint portal_requests_swap_dates check (
    (request_type = 'swap' and coverage_date is not null and request_date <> coverage_date)
    or (request_type = 'ft' and coverage_date is null)
  )
);

create index if not exists portal_requests_group_idx on public.portal_requests (group_key);
create index if not exists portal_requests_status_idx on public.portal_requests (workflow_status, launch_status);
create index if not exists portal_requests_payroll_idx on public.portal_requests (payroll_reference);
create index if not exists portal_requests_company_career_idx on public.portal_requests (company_id, career_id);
create index if not exists portal_requests_requester_idx on public.portal_requests (requester_employee_id, created_at desc);
create index if not exists portal_requests_substitute_idx on public.portal_requests (substitute_employee_id, created_at desc);
create index if not exists portal_requests_date_idx on public.portal_requests (request_date, coverage_date);

create unique index if not exists portal_requests_open_unique_idx
on public.portal_requests (
  request_type,
  requester_employee_id,
  coalesce(substitute_employee_id, '00000000-0000-0000-0000-000000000000'::uuid),
  request_date,
  coalesce(coverage_date, request_date)
)
where workflow_status in ('submitted', 'approved')
  and launch_status <> 'matched';

drop trigger if exists set_portal_requests_updated_at on public.portal_requests;
create trigger set_portal_requests_updated_at
before update on public.portal_requests
for each row
execute function public.set_updated_at();

create table if not exists public.request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.portal_requests (id) on delete cascade,
  actor_type text not null check (actor_type in ('employee', 'operator', 'system')),
  actor_id text,
  actor_label text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists request_events_request_idx on public.request_events (request_id, created_at desc);
create index if not exists request_events_type_idx on public.request_events (event_type);

create table if not exists public.operator_assignments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.portal_requests (id) on delete cascade,
  operator_user_id uuid not null references auth.users (id) on delete cascade,
  assigned_by_user_id uuid references auth.users (id),
  operator_name text,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists operator_assignments_request_idx on public.operator_assignments (request_id, created_at desc);
create index if not exists operator_assignments_operator_idx on public.operator_assignments (operator_user_id, created_at desc);

create table if not exists public.nexti_sync_state (
  sync_key text primary key,
  last_cursor_start text,
  last_cursor_finish text,
  last_success_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_nexti_sync_state_updated_at on public.nexti_sync_state;
create trigger set_nexti_sync_state_updated_at
before update on public.nexti_sync_state
for each row
execute function public.set_updated_at();

alter table public.operator_profiles enable row level security;
alter table public.employee_directory enable row level security;
alter table public.workplace_directory enable row level security;
alter table public.portal_requests enable row level security;
alter table public.request_events enable row level security;
alter table public.operator_assignments enable row level security;
alter table public.nexti_sync_state enable row level security;

drop policy if exists "operator_profiles_self" on public.operator_profiles;
create policy "operator_profiles_self"
on public.operator_profiles
for select
to authenticated
using (user_id = auth.uid() or public.has_operator_role());

drop policy if exists "employee_directory_operator_select" on public.employee_directory;
create policy "employee_directory_operator_select"
on public.employee_directory
for select
to authenticated
using (public.has_operator_role());

drop policy if exists "workplace_directory_operator_select" on public.workplace_directory;
create policy "workplace_directory_operator_select"
on public.workplace_directory
for select
to authenticated
using (public.has_operator_role());

drop policy if exists "portal_requests_operator_select" on public.portal_requests;
create policy "portal_requests_operator_select"
on public.portal_requests
for select
to authenticated
using (public.has_operator_role());

drop policy if exists "request_events_operator_select" on public.request_events;
create policy "request_events_operator_select"
on public.request_events
for select
to authenticated
using (public.has_operator_role());

drop policy if exists "operator_assignments_operator_select" on public.operator_assignments;
create policy "operator_assignments_operator_select"
on public.operator_assignments
for select
to authenticated
using (public.has_operator_role());

drop policy if exists "nexti_sync_state_operator_select" on public.nexti_sync_state;
create policy "nexti_sync_state_operator_select"
on public.nexti_sync_state
for select
to authenticated
using (public.has_operator_role());

do $$
begin
  if not exists (
    select 1
    from pg_publication_rel publication_rel
    join pg_class class_ref on class_ref.oid = publication_rel.prrelid
    join pg_namespace namespace_ref on namespace_ref.oid = class_ref.relnamespace
    join pg_publication publication_ref on publication_ref.oid = publication_rel.prpubid
    where publication_ref.pubname = 'supabase_realtime'
      and namespace_ref.nspname = 'public'
      and class_ref.relname = 'portal_requests'
  ) then
    alter publication supabase_realtime add table public.portal_requests;
  end if;

  if not exists (
    select 1
    from pg_publication_rel publication_rel
    join pg_class class_ref on class_ref.oid = publication_rel.prrelid
    join pg_namespace namespace_ref on namespace_ref.oid = class_ref.relnamespace
    join pg_publication publication_ref on publication_ref.oid = publication_rel.prpubid
    where publication_ref.pubname = 'supabase_realtime'
      and namespace_ref.nspname = 'public'
      and class_ref.relname = 'request_events'
  ) then
    alter publication supabase_realtime add table public.request_events;
  end if;

  if not exists (
    select 1
    from pg_publication_rel publication_rel
    join pg_class class_ref on class_ref.oid = publication_rel.prrelid
    join pg_namespace namespace_ref on namespace_ref.oid = class_ref.relnamespace
    join pg_publication publication_ref on publication_ref.oid = publication_rel.prpubid
    where publication_ref.pubname = 'supabase_realtime'
      and namespace_ref.nspname = 'public'
      and class_ref.relname = 'operator_assignments'
  ) then
    alter publication supabase_realtime add table public.operator_assignments;
  end if;
end;
$$;
