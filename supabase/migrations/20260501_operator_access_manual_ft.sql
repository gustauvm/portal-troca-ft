create table if not exists public.operator_access (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  role text not null default 'operator' check (role in ('operator', 'admin')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  can_view_all boolean not null default true,
  can_edit_all boolean not null default true,
  view_group_keys text[] not null default '{}'::text[],
  edit_group_keys text[] not null default '{}'::text[],
  view_company_ids bigint[] not null default '{}'::bigint[],
  edit_company_ids bigint[] not null default '{}'::bigint[],
  created_by uuid references auth.users (id),
  revoked_by uuid references auth.users (id),
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint operator_access_email_lower_unique unique (email),
  constraint operator_access_scope_consistency check (
    role = 'admin'
    or can_view_all
    or cardinality(view_group_keys) > 0
    or cardinality(view_company_ids) > 0
  )
);

create unique index if not exists operator_access_email_ci_idx on public.operator_access (lower(email));

drop trigger if exists set_operator_access_updated_at on public.operator_access;
create trigger set_operator_access_updated_at
before update on public.operator_access
for each row
execute function public.set_updated_at();

alter table public.operator_profiles
add column if not exists access_id uuid references public.operator_access (id),
add column if not exists status text not null default 'active' check (status in ('active', 'revoked')),
add column if not exists can_view_all boolean not null default true,
add column if not exists can_edit_all boolean not null default true,
add column if not exists view_group_keys text[] not null default '{}'::text[],
add column if not exists edit_group_keys text[] not null default '{}'::text[],
add column if not exists view_company_ids bigint[] not null default '{}'::bigint[],
add column if not exists edit_company_ids bigint[] not null default '{}'::bigint[];

create table if not exists public.career_equivalence_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null,
  label text not null,
  group_key text,
  match_mode text not null default 'exact' check (match_mode in ('exact', 'prefix', 'contains')),
  match_pattern text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists career_equivalence_rules_unique_idx
on public.career_equivalence_rules (coalesce(group_key, ''), rule_key, match_mode, match_pattern);

drop trigger if exists set_career_equivalence_rules_updated_at on public.career_equivalence_rules;
create trigger set_career_equivalence_rules_updated_at
before update on public.career_equivalence_rules
for each row
execute function public.set_updated_at();

create table if not exists public.ft_reasons (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  requires_covered_employee boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ft_reasons_label_unique unique (label)
);

drop trigger if exists set_ft_reasons_updated_at on public.ft_reasons;
create trigger set_ft_reasons_updated_at
before update on public.ft_reasons
for each row
execute function public.set_updated_at();

create table if not exists public.shift_directory (
  id uuid primary key default gen_random_uuid(),
  nexti_shift_id bigint not null unique,
  shift_external_id text,
  name text not null,
  turn text not null default 'indefinido' check (turn in ('diurno', 'noturno', 'indefinido')),
  is_pre_assigned boolean not null default false,
  is_active boolean not null default true,
  sync_fingerprint text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_synced_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_shift_directory_updated_at on public.shift_directory;
create trigger set_shift_directory_updated_at
before update on public.shift_directory
for each row
execute function public.set_updated_at();

alter table public.portal_requests
drop constraint if exists portal_requests_launch_source_check;

alter table public.portal_requests
add constraint portal_requests_launch_source_check
check (launch_source in ('schedule_transfer', 'replacement', 'manual'));

alter table public.portal_requests
add column if not exists operational_status text not null default 'pending'
  check (operational_status in ('pending', 'approved', 'rejected', 'cancelled', 'launched', 'launched_manual', 'corrected')),
add column if not exists operation_note text,
add column if not exists manual_authorization_note text,
add column if not exists manual_created_by uuid references auth.users (id),
add column if not exists manual_created_at timestamptz,
add column if not exists manual_launched_by uuid references auth.users (id),
add column if not exists manual_launched_at timestamptz,
add column if not exists ft_reason_id uuid references public.ft_reasons (id),
add column if not exists ft_reason_label text,
add column if not exists covered_employee_id uuid references public.employee_directory (id),
add column if not exists covered_nexti_person_id bigint,
add column if not exists covered_person_external_id text,
add column if not exists covered_name text,
add column if not exists covered_enrolment text,
add column if not exists selected_shift_directory_id uuid references public.shift_directory (id),
add column if not exists selected_shift_id bigint,
add column if not exists selected_shift_external_id text,
add column if not exists selected_shift_name text,
add column if not exists selected_shift_turn text check (selected_shift_turn in ('diurno', 'noturno', 'indefinido'));

create index if not exists portal_requests_operational_status_idx on public.portal_requests (operational_status);
create index if not exists portal_requests_launch_source_idx on public.portal_requests (launch_source);

alter table public.operator_access enable row level security;
alter table public.career_equivalence_rules enable row level security;
alter table public.ft_reasons enable row level security;
alter table public.shift_directory enable row level security;

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
      and status = 'active'
  );
$$;

drop policy if exists "operator_access_admin_select" on public.operator_access;
create policy "operator_access_admin_select"
on public.operator_access
for select
to authenticated
using (public.has_operator_role(array['admin']));

drop policy if exists "career_equivalence_operator_select" on public.career_equivalence_rules;
create policy "career_equivalence_operator_select"
on public.career_equivalence_rules
for select
to authenticated
using (public.has_operator_role());

drop policy if exists "ft_reasons_operator_select" on public.ft_reasons;
create policy "ft_reasons_operator_select"
on public.ft_reasons
for select
to authenticated
using (public.has_operator_role());

drop policy if exists "shift_directory_operator_select" on public.shift_directory;
create policy "shift_directory_operator_select"
on public.shift_directory
for select
to authenticated
using (public.has_operator_role());

insert into public.operator_access (email, full_name, role, status, can_view_all, can_edit_all)
values
  ('wagnertrainingdunamis@gmail.com', 'Wagner Training Dunamis', 'admin', 'active', true, true),
  ('nextibombeiros@gmail.com', 'Nexti Bombeiros', 'admin', 'active', true, true),
  ('marcelogiovanioperacao@gmail.com', 'Marcelo Giovani Operacao', 'admin', 'active', true, true),
  ('rbfacilities084@gmail.com', 'RB Facilities Operacao', 'operator', 'active', true, true),
  ('plantaodunamis@gmail.com', 'Plantao Dunamis', 'operator', 'active', true, true)
on conflict (email) do update
set role = excluded.role,
    status = 'active',
    can_view_all = true,
    can_edit_all = true,
    updated_at = timezone('utc', now());

insert into public.career_equivalence_rules (rule_key, label, group_key, match_mode, match_pattern)
values
  ('bombeiros', 'Bombeiros', 'bombeiros', 'exact', 'BOMBEIRO CIVIL'),
  ('bombeiros', 'Bombeiros', 'bombeiros', 'exact', 'BOMBEIRO CIVIL LIDER'),
  ('bombeiros', 'Bombeiros', 'bombeiros', 'exact', 'BOMBEIRO LIDER'),
  ('vigilantes', 'Vigilantes', 'seguranca', 'prefix', 'VIGILANTE'),
  ('vigilantes', 'Vigilantes', null, 'prefix', 'VIGILANTE')
on conflict do nothing;

insert into public.ft_reasons (label, requires_covered_employee, sort_order)
values
  ('Férias', true, 10),
  ('Falta', true, 20),
  ('Atestado/Afastamento', true, 30),
  ('Solicitação de posto extra do cliente', false, 40),
  ('Falta de efetivo', false, 50),
  ('Reforço operacional', false, 60),
  ('Outro motivo autorizado', false, 999)
on conflict (label) do update
set requires_covered_employee = excluded.requires_covered_employee,
    sort_order = excluded.sort_order,
    is_active = true,
    updated_at = timezone('utc', now());
