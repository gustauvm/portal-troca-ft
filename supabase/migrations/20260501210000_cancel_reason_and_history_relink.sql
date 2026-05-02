alter table public.portal_requests
add column if not exists cancel_reason text;

create index if not exists nexti_launch_history_external_employee_idx
on public.nexti_launch_history (requester_person_external_id, request_date desc)
where requester_person_external_id is not null;

