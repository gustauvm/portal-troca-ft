-- Add substitute_employee_id FK to nexti_launch_history for better colega linking
alter table public.nexti_launch_history
add column if not exists substitute_employee_id uuid references public.employee_directory (id);

create index if not exists nexti_launch_history_substitute_employee_id_idx
on public.nexti_launch_history (substitute_employee_id)
where substitute_employee_id is not null;
