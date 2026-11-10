-- Strikers practices, winter 2026-27. Run in the Supabase SQL editor (as the project owner, so RLS
-- does not apply). Idempotent like scripts/import-schedule.mjs: a practice already on the team for
-- the same date and start time is skipped, so the script can be re-run after adding dates.
--
-- Location and notes are left blank on purpose; fill them in from the app (Games → Schedule → tap
-- the practice). The team is matched by name ("Striker" or "Strikers", not archived).

do $$
declare
  v_team    uuid;
  v_season  uuid;
  v_added   int;
begin
  select t.id into v_team
  from public.teams t
  where t.name ilike 'striker%' and t.archived_at is null
  order by t.created_at
  limit 1;
  if v_team is null then
    raise exception 'no active team named Striker/Strikers';
  end if;

  select s.id into v_season
  from public.seasons s
  where s.team_id = v_team and s.is_current
  limit 1;
  if v_season is null then
    insert into public.seasons (team_id, name, starts_on, is_current)
    values (v_team, to_char(now(), 'YYYY') || ' season', current_date, true)
    returning id into v_season;
  end if;

  with wanted(d, t) as (
    values
      ('2026-11-11'::date, '18:30'::time),
      ('2026-11-18'::date, '18:30'::time),
      ('2026-12-04'::date, '18:30'::time),
      ('2026-12-09'::date, '20:30'::time),
      ('2026-12-18'::date, '18:30'::time),
      ('2026-12-22'::date, '18:30'::time),
      ('2026-12-30'::date, '18:30'::time),
      ('2027-01-06'::date, '20:30'::time)
  ),
  ins as (
    insert into public.practices (team_id, season_id, practice_date, start_time, end_time, location, notes)
    select v_team, v_season, w.d, w.t, null, null, null
    from wanted w
    where not exists (
      select 1 from public.practices p
      where p.team_id = v_team and p.practice_date = w.d and p.start_time is not distinct from w.t
    )
    returning 1
  )
  select count(*) into v_added from ins;

  raise notice '% practice(s) added to team % (season %)', v_added, v_team, v_season;
end $$;
