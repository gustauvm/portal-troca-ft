alter table public.employee_directory
add column if not exists phone text,
add column if not exists phone2 text,
add column if not exists whatsapp_phone text;

create index if not exists employee_directory_whatsapp_phone_idx
on public.employee_directory (whatsapp_phone)
where whatsapp_phone is not null;

create table if not exists public.nexti_launch_history (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('swap', 'ft')),
  nexti_source text not null check (nexti_source in ('schedule_transfer', 'replacement')),
  nexti_record_id bigint not null,
  nexti_record_external_id text,
  group_key text not null,
  payroll_reference text not null,
  payroll_period_start date not null,
  payroll_period_end date not null,
  requester_employee_id uuid references public.employee_directory (id),
  requester_nexti_person_id bigint,
  requester_person_external_id text,
  requester_name text not null,
  requester_enrolment text,
  requester_is_active boolean not null default false,
  substitute_nexti_person_id bigint,
  substitute_person_external_id text,
  substitute_name text,
  substitute_enrolment text,
  company_id bigint,
  company_name text,
  career_id bigint,
  career_name text,
  schedule_id bigint,
  schedule_name text,
  shift_id bigint,
  shift_external_id text,
  shift_name text,
  workplace_id bigint,
  workplace_external_id text,
  workplace_name text,
  request_date date not null,
  coverage_date date,
  nexti_created_at timestamptz,
  nexti_last_update timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_synced_at timestamptz not null default timezone('utc', now()),
  constraint nexti_launch_history_source_record_unique unique (nexti_source, nexti_record_id)
);

create index if not exists nexti_launch_history_employee_idx
on public.nexti_launch_history (requester_employee_id, request_date desc);

create index if not exists nexti_launch_history_filters_idx
on public.nexti_launch_history (group_key, company_id, request_type, request_date desc);

create index if not exists nexti_launch_history_active_idx
on public.nexti_launch_history (requester_is_active, request_date desc);

drop trigger if exists set_nexti_launch_history_updated_at on public.nexti_launch_history;
create trigger set_nexti_launch_history_updated_at
before update on public.nexti_launch_history
for each row
execute function public.set_updated_at();

create table if not exists public.nexti_launch_history_sync_state (
  sync_key text primary key,
  last_cursor_start text,
  last_cursor_finish text,
  last_success_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_nexti_launch_history_sync_state_updated_at on public.nexti_launch_history_sync_state;
create trigger set_nexti_launch_history_sync_state_updated_at
before update on public.nexti_launch_history_sync_state
for each row
execute function public.set_updated_at();

create table if not exists public.whatsapp_notification_rules (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('global', 'group', 'company', 'workplace', 'employee', 'request_type')),
  scope_key text not null,
  request_type text check (request_type in ('swap', 'ft')),
  enabled boolean not null default true,
  note text,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists whatsapp_notification_rules_unique_idx
on public.whatsapp_notification_rules (scope_type, scope_key, coalesce(request_type, ''));

create index if not exists whatsapp_notification_rules_lookup_idx
on public.whatsapp_notification_rules (scope_type, scope_key, request_type);

drop trigger if exists set_whatsapp_notification_rules_updated_at on public.whatsapp_notification_rules;
create trigger set_whatsapp_notification_rules_updated_at
before update on public.whatsapp_notification_rules
for each row
execute function public.set_updated_at();

create table if not exists public.whatsapp_send_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null default 'whatsapp_manual_opened',
  target_type text not null check (target_type in ('portal_request', 'nexti_history')),
  target_id uuid not null,
  operator_user_id uuid references auth.users (id),
  operator_email text,
  operator_name text,
  employee_nexti_person_id bigint,
  employee_name text,
  employee_enrolment text,
  phone_raw text,
  phone_normalized text,
  message text not null,
  wa_url text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists whatsapp_send_events_target_idx
on public.whatsapp_send_events (target_type, target_id, created_at desc);

create index if not exists whatsapp_send_events_operator_idx
on public.whatsapp_send_events (operator_user_id, created_at desc);

alter table public.nexti_launch_history enable row level security;
alter table public.nexti_launch_history_sync_state enable row level security;
alter table public.whatsapp_notification_rules enable row level security;
alter table public.whatsapp_send_events enable row level security;

drop policy if exists "nexti_launch_history_operator_select" on public.nexti_launch_history;
create policy "nexti_launch_history_operator_select"
on public.nexti_launch_history
for select
to authenticated
using (public.has_operator_role());

drop policy if exists "nexti_launch_history_sync_state_operator_select" on public.nexti_launch_history_sync_state;
create policy "nexti_launch_history_sync_state_operator_select"
on public.nexti_launch_history_sync_state
for select
to authenticated
using (public.has_operator_role());

drop policy if exists "whatsapp_notification_rules_operator_select" on public.whatsapp_notification_rules;
create policy "whatsapp_notification_rules_operator_select"
on public.whatsapp_notification_rules
for select
to authenticated
using (public.has_operator_role());

drop policy if exists "whatsapp_notification_rules_admin_all" on public.whatsapp_notification_rules;
create policy "whatsapp_notification_rules_admin_all"
on public.whatsapp_notification_rules
for all
to authenticated
using (public.has_operator_role(array['admin']))
with check (public.has_operator_role(array['admin']));

drop policy if exists "whatsapp_send_events_operator_select" on public.whatsapp_send_events;
create policy "whatsapp_send_events_operator_select"
on public.whatsapp_send_events
for select
to authenticated
using (public.has_operator_role());

drop policy if exists "whatsapp_send_events_operator_insert" on public.whatsapp_send_events;
create policy "whatsapp_send_events_operator_insert"
on public.whatsapp_send_events
for insert
to authenticated
with check (public.has_operator_role());

create or replace function public.operator_auth_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  requested_email text;
  access_record public.operator_access%rowtype;
  existing_metadata jsonb;
begin
  requested_email := lower(coalesce(event #>> '{user,email}', event ->> 'email', ''));

  select *
    into access_record
  from public.operator_access
  where lower(email) = requested_email
    and status = 'active'
  limit 1;

  if access_record.id is null then
    raise exception 'Este e-mail não está liberado para acesso operacional.';
  end if;

  existing_metadata := coalesce(event #> '{user,user_metadata}', '{}'::jsonb);

  return jsonb_set(
    event,
    '{user,user_metadata}',
    existing_metadata || jsonb_build_object(
      'role', access_record.role,
      'access_id', access_record.id
    ),
    true
  );
end;
$$;

grant execute on function public.operator_auth_before_user_created(jsonb) to supabase_auth_admin;

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
      and class_ref.relname = 'nexti_launch_history'
  ) then
    alter publication supabase_realtime add table public.nexti_launch_history;
  end if;
end;
$$;
