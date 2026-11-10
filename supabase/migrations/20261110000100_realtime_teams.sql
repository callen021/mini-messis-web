-- useTeamRealtime subscribes to public.teams (rename / setup changes) alongside the game tables,
-- but teams was never added to the realtime publication. Realtime then reports the channel as
-- SUBSCRIBED yet delivers no events for ANY of its tables, so parents never saw live scores.
-- Idempotent: safe if the table was already added by hand in the dashboard.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'teams'
  ) then
    alter publication supabase_realtime add table public.teams;
  end if;
end $$;
