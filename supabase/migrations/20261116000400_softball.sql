-- Softball (D119), step 2 of 2: a sport that reuses the baseball model everywhere the database
-- cares: runs are the score, plate appearances are the batting log, the skill tests are the
-- baseball set, and a new softball team tracks playing time by innings (periods), not the clock.

-- runs score one, like baseball
create or replace function public.score_event_points(p_sport public.sport, p_event_type text)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case p_sport::text
    when 'soccer' then case p_event_type when 'goal' then 1 end
    when 'lacrosse' then case p_event_type when 'goal' then 1 end
    when 'basketball' then case p_event_type when 'free_throw' then 1 when 'field_goal' then 2 when 'three_pointer' then 3 end
    when 'baseball' then case p_event_type when 'run' then 1 end
    when 'softball' then case p_event_type when 'run' then 1 end
    when 'football' then case p_event_type when 'touchdown' then 6 when 'field_goal' then 3 when 'extra_point' then 1 when 'two_point' then 2 when 'safety' then 2 end
  end::smallint;
$$;

-- the batting log: baseball and softball
create or replace function public.plate_appearances_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sport text;
  v_team uuid;
begin
  select t.sport::text, t.id into v_sport, v_team
  from public.games g join public.teams t on t.id = g.team_id
  where g.id = new.game_id;
  if v_sport is null or v_sport not in ('baseball', 'softball') then
    raise exception 'plate appearances are only recorded for baseball and softball' using errcode = '23514';
  end if;
  if public.team_of_player(new.player_id) is distinct from v_team then
    raise exception 'batter is not on this team' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_by := (select auth.uid());
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

-- the default skill tests: softball takes the baseball set (the lists stay in 0800, under a new name)
alter function public.default_skill_tests(public.sport) rename to default_skill_tests_v1;
create function public.default_skill_tests(p_sport public.sport)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select public.default_skill_tests_v1(case when p_sport::text = 'softball' then 'baseball'::public.sport else p_sport end);
$$;
revoke all on function public.default_skill_tests(public.sport) from public;
grant execute on function public.default_skill_tests(public.sport) to authenticated, service_role;

-- a new softball team starts on innings (periods), like baseball (D87)
create or replace function public.create_team(
  p_name text,
  p_sport public.sport,
  p_side_size int,
  p_has_gk boolean,
  p_periods_count int,
  p_colors jsonb,
  p_template jsonb,
  p_skill_tests jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_team uuid;
  v_code text;
  v_period jsonb;
  v_slot jsonb;
  v_lineup uuid;
  v_i int := 0;
  v_j int;
  v_test jsonb;
  v_order int := 0;
  v_tests jsonb;
  v_mode public.time_mode := case when p_sport::text in ('baseball', 'softball') then 'periods'::public.time_mode else 'clock'::public.time_mode end;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not public.is_platform_admin() then
    raise exception 'only a platform admin can create a team' using errcode = '42501';
  end if;
  if p_sport = 'football' then
    raise exception 'football is not enabled yet' using errcode = '22023';
  end if;
  if jsonb_typeof(p_template) <> 'array' or jsonb_array_length(p_template) <> p_periods_count then
    raise exception 'template must have one lineup per period' using errcode = '22023';
  end if;

  loop
    v_code := public.generate_join_code();
    exit when not exists (select 1 from public.teams t where t.join_code = v_code);
  end loop;

  insert into public.teams (name, sport, owner_id, join_code, side_size, has_gk, periods_count, colors, time_mode, updated_by)
  values (trim(p_name), p_sport, v_uid, v_code, p_side_size, p_has_gk, p_periods_count, coalesce(p_colors, '{}'::jsonb), v_mode, v_uid)
  returning id into v_team;

  insert into public.team_members (team_id, user_id, role, status, requested_role, approved_by, approved_at)
  values (v_team, v_uid, 'coach', 'active', 'coach', v_uid, now());

  insert into public.seasons (team_id, name, starts_on, is_current)
  values (v_team, to_char(now(), 'YYYY') || ' season', current_date, true);

  for v_period in select * from jsonb_array_elements(p_template) loop
    insert into public.lineups (team_id, game_id, period_index, formation_name)
    values (v_team, null, v_i, coalesce(v_period ->> 'formation_name', ''))
    returning id into v_lineup;
    v_j := 0;
    for v_slot in select * from jsonb_array_elements(coalesce(v_period -> 'slots', '[]'::jsonb)) loop
      insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code)
      values (v_lineup, v_j, coalesce(v_slot ->> 'position_role', ''), coalesce(v_slot ->> 'position_code', ''));
      v_j := v_j + 1;
    end loop;
    v_i := v_i + 1;
  end loop;

  -- skill tests: the caller's list, or the sport's server-side defaults when it sends none (0800)
  v_tests := case
    when p_skill_tests is null or jsonb_typeof(p_skill_tests) <> 'array' or jsonb_array_length(p_skill_tests) = 0
      then public.default_skill_tests(p_sport)
    else p_skill_tests
  end;
  for v_test in select * from jsonb_array_elements(v_tests) loop
    insert into public.skill_tests (team_id, key, name, instructions, metric, unit, has_sides, higher_is_better, attempts, sort_order, updated_by)
    values (
      v_team,
      v_test ->> 'key',
      v_test ->> 'name',
      coalesce(v_test ->> 'instructions', ''),
      (v_test ->> 'metric')::public.skill_metric,
      nullif(v_test ->> 'unit', ''),
      coalesce((v_test ->> 'has_sides')::boolean, false),
      coalesce((v_test ->> 'higher_is_better')::boolean, true),
      coalesce((v_test ->> 'attempts')::int, 5),
      v_order,
      v_uid
    );
    v_order := v_order + 1;
  end loop;

  update public.profiles set last_team_id = v_team where id = v_uid;
  return v_team;
end;
$$;
