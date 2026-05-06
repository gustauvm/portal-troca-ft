alter table public.operator_access
add column if not exists employee_id uuid references public.employee_directory (id),
add column if not exists employee_enrolment text,
add column if not exists employee_name text,
add column if not exists nexti_person_id bigint,
add column if not exists auth_user_id uuid references auth.users (id);

create unique index if not exists operator_access_employee_id_unique_idx
on public.operator_access (employee_id);

create unique index if not exists operator_access_auth_user_id_unique_idx
on public.operator_access (auth_user_id)
where auth_user_id is not null;

update public.operator_access
set status = 'revoked',
    revoked_at = coalesce(revoked_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
where employee_id is null
  and lower(email) in (
    'wagnertrainingdunamis@gmail.com',
    'nextibombeiros@gmail.com',
    'marcelogiovanioperacao@gmail.com',
    'rbfacilities084@gmail.com',
    'plantaodunamis@gmail.com'
  );

with admin_employees as (
  select *
  from public.employee_directory
  where is_active = true
    and (
      (enrolment_aliases && array['7164']::text[] and full_name ilike '%GUSTAVO CORTES BRAGA%')
      or (enrolment_aliases && array['246-6495','2466495','6495']::text[] and full_name ilike '%MARCELO APARECIDO DE GIOVAN%')
      or (enrolment_aliases && array['866-3935','8663935','3935']::text[] and full_name ilike '%WAGNER MONTEIRO%')
    )
)
insert into public.operator_access (
  email,
  employee_id,
  employee_enrolment,
  employee_name,
  nexti_person_id,
  full_name,
  role,
  status,
  can_view_all,
  can_edit_all,
  view_group_keys,
  edit_group_keys,
  view_company_ids,
  edit_company_ids
)
select
  'operator+' || employee.id::text || '@portal.local',
  employee.id,
  employee.enrolment,
  employee.full_name,
  employee.nexti_person_id,
  employee.full_name,
  'admin',
  'active',
  true,
  true,
  '{}'::text[],
  '{}'::text[],
  '{}'::bigint[],
  '{}'::bigint[]
from admin_employees employee
on conflict (employee_id) do update
set employee_enrolment = excluded.employee_enrolment,
    employee_name = excluded.employee_name,
    nexti_person_id = excluded.nexti_person_id,
    full_name = excluded.full_name,
    role = 'admin',
    status = 'active',
    can_view_all = true,
    can_edit_all = true,
    view_group_keys = '{}'::text[],
    edit_group_keys = '{}'::text[],
    view_company_ids = '{}'::bigint[],
    edit_company_ids = '{}'::bigint[],
    revoked_by = null,
    revoked_at = null,
    updated_at = timezone('utc', now());
