-- Skills: the default test sets live in SQL too, so the server can seed any team that has none
-- (teams created before the sets existed, and create_team called with an empty list), and
-- restore_skill_tests works without a client payload. Keep in step with src/skills/defaults.ts
-- (a unit test checks every key and name below appears here).

create or replace function public.default_skill_tests(p_sport public.sport)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_sport
    when 'soccer' then '[
      {"key":"ticktocks","name":"Tick-tocks","instructions":"Count alternating inside-foot touches in a small marked box. Stop when the ball leaves the box or the player loses the rhythm.","metric":"count","higher_is_better":true,"attempts":5},
      {"key":"juggling","name":"Juggling","instructions":"Start with a hand drop. Count consecutive foot touches before the ball hits the ground.","metric":"count","higher_is_better":true,"attempts":5},
      {"key":"dribble","name":"Dribbling with control","instructions":"Weave through four cones on the same course each time. Time the run and record the fastest attempt that goes around every cone.","metric":"time_seconds","higher_is_better":false,"attempts":5},
      {"key":"passing","name":"Passing accuracy","instructions":"From 5 yards, pass a stationary ball through a 1-yard cone gate. Five tries with each foot.","metric":"made_of_attempted","has_sides":true,"higher_is_better":true,"attempts":5},
      {"key":"shooting","name":"Shooting accuracy","instructions":"Five shots from 7 yards at the same goal without a keeper. Count shots that go in.","metric":"made_of_attempted","higher_is_better":true,"attempts":5},
      {"key":"kickdist","name":"Kick distance","instructions":"Kick a stationary ball down a marked lane. Measure to where it first lands, using the same size ball each time.","metric":"distance","unit":"yd","higher_is_better":true,"attempts":5},
      {"key":"sprint","name":"Sprint speed","instructions":"Run 20 yards from a standing start. Two tries, same start signal and timing method each session.","metric":"time_seconds","higher_is_better":false,"attempts":5}
    ]'::jsonb
    when 'baseball' then '[
      {"key":"throwacc","name":"Throwing accuracy","instructions":"From 40 feet, throw at a target on a fence or net. Ten throws; count hits.","metric":"made_of_attempted","higher_is_better":true,"attempts":10},
      {"key":"throwdist","name":"Throwing distance","instructions":"Crow-hop and throw down a marked lane. Measure to the first bounce. Best of three.","metric":"distance","unit":"ft","higher_is_better":true,"attempts":5},
      {"key":"tee","name":"Tee contact","instructions":"Ten swings off a tee into a net. Count solid line-drive contacts.","metric":"made_of_attempted","higher_is_better":true,"attempts":10},
      {"key":"grounders","name":"Ground balls","instructions":"Ten rolled grounders at game speed. Count clean fields and throws.","metric":"made_of_attempted","higher_is_better":true,"attempts":10},
      {"key":"popups","name":"Fly balls","instructions":"Ten tossed pop-ups. Count clean catches.","metric":"made_of_attempted","higher_is_better":true,"attempts":10},
      {"key":"sprint","name":"Sprint speed","instructions":"Run from home to first base (60 feet) from a standing start. Two tries, same start signal and timing method each session.","metric":"time_seconds","higher_is_better":false,"attempts":5}
    ]'::jsonb
    when 'basketball' then '[
      {"key":"ft","name":"Free throws","instructions":"Ten free throws from the line. Count makes.","metric":"made_of_attempted","higher_is_better":true,"attempts":10},
      {"key":"layups","name":"Layups","instructions":"Ten layups, five from each side, off the dribble. Count makes.","metric":"made_of_attempted","has_sides":true,"higher_is_better":true,"attempts":5},
      {"key":"dribblecones","name":"Dribble weave","instructions":"Dribble through five cones and back. Time the run; a lost ball restarts the attempt.","metric":"time_seconds","higher_is_better":false,"attempts":5},
      {"key":"passwall","name":"Chest passes","instructions":"Chest passes against a wall from 6 feet for 30 seconds. Count catches.","metric":"count","higher_is_better":true,"attempts":5},
      {"key":"sprint","name":"Sprint speed","instructions":"Sprint baseline to baseline from a standing start. Two tries, same start signal and timing method each session.","metric":"time_seconds","higher_is_better":false,"attempts":5}
    ]'::jsonb
    when 'lacrosse' then '[
      {"key":"wallball","name":"Wall ball","instructions":"Throw and catch against a wall from 5 yards for 60 seconds, alternating hands. Count catches.","metric":"count","higher_is_better":true,"attempts":5},
      {"key":"shoot","name":"Shooting accuracy","instructions":"Ten shots from 8 yards at an open goal with corners marked. Count shots in a corner.","metric":"made_of_attempted","higher_is_better":true,"attempts":10},
      {"key":"ground","name":"Ground balls","instructions":"Ten rolled ground balls. Count clean scoops on the first try.","metric":"made_of_attempted","higher_is_better":true,"attempts":10},
      {"key":"cradle","name":"Cradle and run","instructions":"Weave four cones while cradling. Time the run; a dropped ball restarts it.","metric":"time_seconds","higher_is_better":false,"attempts":5},
      {"key":"sprint","name":"Sprint speed","instructions":"Run 20 yards from a standing start. Two tries, same start signal and timing method each session.","metric":"time_seconds","higher_is_better":false,"attempts":5}
    ]'::jsonb
    else '[]'::jsonb
  end;
$$;
grant execute on function public.default_skill_tests(public.sport) to authenticated, service_role;

-- Insert the defaults that a team is missing and un-hide hidden ones. With no payload the sport's
-- own set is used, so this also seeds a team that has no tests at all.
drop function if exists public.restore_skill_tests(uuid, jsonb);
create function public.restore_skill_tests(p_team_id uuid, p_tests jsonb default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tests jsonb := p_tests;
  v_test jsonb;
  v_n int := 0;
  v_order int;
  v_id uuid;
  v_active boolean;
begin
  if not public.is_staff(p_team_id) then
    raise exception 'only a coach or assistant can restore tests' using errcode = '42501';
  end if;
  if v_tests is null or jsonb_typeof(v_tests) <> 'array' or jsonb_array_length(v_tests) = 0 then
    select public.default_skill_tests(t.sport) into v_tests from public.teams t where t.id = p_team_id;
  end if;
  select coalesce(max(sort_order), -1) + 1 into v_order from public.skill_tests where team_id = p_team_id;
  for v_test in select * from jsonb_array_elements(coalesce(v_tests, '[]'::jsonb)) loop
    select id, is_active into v_id, v_active from public.skill_tests where team_id = p_team_id and key = v_test ->> 'key';
    if v_id is null then
      insert into public.skill_tests (team_id, key, name, instructions, metric, unit, has_sides, higher_is_better, attempts, sort_order, updated_by)
      values (p_team_id, v_test ->> 'key', v_test ->> 'name', coalesce(v_test ->> 'instructions', ''),
              (v_test ->> 'metric')::public.skill_metric, nullif(v_test ->> 'unit', ''),
              coalesce((v_test ->> 'has_sides')::boolean, false), coalesce((v_test ->> 'higher_is_better')::boolean, true),
              coalesce((v_test ->> 'attempts')::int, 5), v_order, v_uid);
      v_order := v_order + 1;
      v_n := v_n + 1;
    elsif not v_active then
      update public.skill_tests set is_active = true where id = v_id;
      v_n := v_n + 1;
    end if;
    v_id := null;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.restore_skill_tests(uuid, jsonb) from public;
grant execute on function public.restore_skill_tests(uuid, jsonb) to authenticated, service_role;

-- create_team: an empty or missing list means "the sport's defaults".
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
  v_tests jsonb;
  v_order int := 0;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not public.email_confirmed(v_uid) then
    raise exception 'verify your email before creating a team' using errcode = '42501';
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

  insert into public.teams (name, sport, owner_id, join_code, side_size, has_gk, periods_count, colors, updated_by)
  values (trim(p_name), p_sport, v_uid, v_code, p_side_size, p_has_gk, p_periods_count, coalesce(p_colors, '{}'::jsonb), v_uid)
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

-- Backfill: every existing team with no tests gets its sport's default set.
do $$
declare
  t record;
  v_test jsonb;
  v_order int;
begin
  for t in
    select tm.id, tm.sport from public.teams tm
    where not exists (select 1 from public.skill_tests s where s.team_id = tm.id)
  loop
    v_order := 0;
    for v_test in select * from jsonb_array_elements(public.default_skill_tests(t.sport)) loop
      insert into public.skill_tests (team_id, key, name, instructions, metric, unit, has_sides, higher_is_better, attempts, sort_order)
      values (t.id, v_test ->> 'key', v_test ->> 'name', coalesce(v_test ->> 'instructions', ''),
              (v_test ->> 'metric')::public.skill_metric, nullif(v_test ->> 'unit', ''),
              coalesce((v_test ->> 'has_sides')::boolean, false), coalesce((v_test ->> 'higher_is_better')::boolean, true),
              coalesce((v_test ->> 'attempts')::int, 5), v_order);
      v_order := v_order + 1;
    end loop;
  end loop;
end $$;
