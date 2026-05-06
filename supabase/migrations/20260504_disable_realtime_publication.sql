-- Free-plan protection: the app no longer needs Supabase Realtime subscriptions.
-- Keep updates as explicit refetches/SWR-like polling so Realtime messages do not exceed quota.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime drop table public.portal_requests;
    exception when others then
      null;
    end;

    begin
      alter publication supabase_realtime drop table public.request_events;
    exception when others then
      null;
    end;

    begin
      alter publication supabase_realtime drop table public.operator_assignments;
    exception when others then
      null;
    end;

    begin
      alter publication supabase_realtime drop table public.nexti_launch_history;
    exception when others then
      null;
    end;
  end if;
end $$;
