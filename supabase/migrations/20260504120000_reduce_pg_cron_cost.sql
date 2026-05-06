-- Free-plan protection: keep sync automatic, but avoid high-frequency jobs before production load.
do $$
declare
  directory_job_id bigint;
  reconcile_job_id bigint;
  launch_history_job_id bigint;
begin
  select jobid into directory_job_id from cron.job where jobname = 'portal_nexti_directory_sync';
  select jobid into reconcile_job_id from cron.job where jobname = 'portal_nexti_request_reconcile';
  select jobid into launch_history_job_id from cron.job where jobname = 'portal_nexti_launch_history_incremental';

  if directory_job_id is not null then
    perform cron.alter_job(directory_job_id, schedule => '0 * * * *');
  end if;

  if reconcile_job_id is not null then
    perform cron.alter_job(reconcile_job_id, schedule => '*/10 * * * *');
  end if;

  if launch_history_job_id is not null then
    perform cron.alter_job(launch_history_job_id, schedule => '15 * * * *');
  end if;
end $$;
