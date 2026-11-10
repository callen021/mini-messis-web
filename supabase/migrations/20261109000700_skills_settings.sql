-- Phase 6 + 7: skills tests (attempts, ordering, restore), games played in stats, legacy import.

-- ---------- skill_tests.attempts ----------
alter table public.skill_tests
  add column if not exists attempts int not null default 5 check (attempts between 1 and 100);

-- lock attempts too once a test has results
create or replace function public.skill_tests_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_results boolean;
begin
  select exists (select 1 from public.skill_results r where r.skill_test_id = old.id) into v_has_results;
  if tg_op = 'DELETE' then
    if v_has_results then
      raise exception 'a test with results cannot be deleted; hide it instead' using errcode = '23514';
    end if;
    return old;
  end if;
  if v_has_results and (
       new.metric is distinct from old.metric
    or new.higher_is_better is distinct from old.higher_is_better
    or new.unit is distinct from old.unit
    or new.has_sides is distinct from old.has_sides
    or new.attempts is distinct from old.attempts
  ) then
    raise exception 'metric settings are locked once a test has results' using errcode = '23514';
  end if;
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

-- results: stamp who edited; anyone on staff may edit (RLS); recorded_by stays the original author
create or replace function public.skill_results_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.recorded_by := old.recorded_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := (select auth.uid());
  return new;
end;
$$;
drop trigger if exists skill_results_stamp on public.skill_results;
create trigger skill_results_stamp before insert or update on public.skill_results
  for each row execute function public.skill_results_stamp();

-- ---------- create_team: read attempts from the default set ----------
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

  for v_test in select * from jsonb_array_elements(coalesce(p_skill_tests, '[]'::jsonb)) loop
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

-- ---------- skills: order + restore ----------
create or replace function public.set_skill_test_order(p_team_id uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff(p_team_id) then
    raise exception 'only a coach or assistant can reorder tests' using errcode = '42501';
  end if;
  update public.skill_tests t
  set sort_order = o.ord, updated_by = (select auth.uid())
  from unnest(p_ids) with ordinality as o(id, ord)
  where t.id = o.id and t.team_id = p_team_id;
end;
$$;

-- Re-add missing default tests and un-hide hidden ones. p_tests is the sport's default set
-- (same shape as create_team's p_skill_tests). Returns how many tests changed.
create or replace function public.restore_skill_tests(p_team_id uuid, p_tests jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_test jsonb;
  v_n int := 0;
  v_order int;
  v_id uuid;
  v_active boolean;
begin
  if not public.is_staff(p_team_id) then
    raise exception 'only a coach or assistant can restore tests' using errcode = '42501';
  end if;
  select coalesce(max(sort_order), -1) + 1 into v_order from public.skill_tests where team_id = p_team_id;
  for v_test in select * from jsonb_array_elements(coalesce(p_tests, '[]'::jsonb)) loop
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
  end loop;
  return v_n;
end;
$$;

revoke all on function public.set_skill_test_order(uuid, uuid[]) from public;
revoke all on function public.restore_skill_tests(uuid, jsonb) from public;
grant execute on function public.set_skill_test_order(uuid, uuid[]), public.restore_skill_tests(uuid, jsonb) to authenticated, service_role;

-- ---------- stats: add games_played ----------
drop function if exists public.player_season_stats(uuid, uuid, uuid);
create function public.player_season_stats(
  p_team_id uuid,
  p_season_id uuid default null,
  p_game_id uuid default null
)
returns table (
  player_id uuid,
  name text,
  number text,
  removed boolean,
  games_played int,
  periods_played int,
  goals int,
  assists int,
  points int,
  field_goals int,
  three_pointers int,
  free_throws int,
  runs int,
  plate_appearances int,
  at_bats int,
  hits int,
  doubles int,
  triples int,
  home_runs int,
  rbi int,
  walks int,
  strikeouts int
)
language sql
stable
security invoker
set search_path = ''
as $$
  with scope as (
    select g.id
    from public.games g
    where g.team_id = p_team_id
      and (
        (p_game_id is not null and g.id = p_game_id)
        or (p_game_id is null and g.status <> 'upcoming'
            and g.season_id = coalesce(p_season_id, (select s.id from public.seasons s where s.team_id = p_team_id and s.is_current limit 1)))
      )
  ),
  played as (
    select s.player_id, count(distinct l.id)::int as n, count(distinct l.game_id)::int as games
    from public.lineups l
    join public.lineup_slots s on s.lineup_id = l.id
    where l.game_id in (select id from scope) and s.player_id is not null
    group by s.player_id
  ),
  scored as (
    select e.scorer_player_id as player_id,
           count(*) filter (where e.event_type = 'goal')::int as goals,
           coalesce(sum(e.points), 0)::int as points,
           count(*) filter (where e.event_type = 'field_goal')::int as field_goals,
           count(*) filter (where e.event_type = 'three_pointer')::int as three_pointers,
           count(*) filter (where e.event_type = 'free_throw')::int as free_throws,
           count(*) filter (where e.event_type = 'run')::int as runs
    from public.score_events e
    where e.game_id in (select id from scope) and e.side = 'us' and e.scorer_player_id is not null
    group by e.scorer_player_id
  ),
  assisted as (
    select e.assist_player_id as player_id, count(*)::int as assists
    from public.score_events e
    where e.game_id in (select id from scope) and e.side = 'us' and e.assist_player_id is not null
    group by e.assist_player_id
  ),
  batting as (
    select pa.player_id,
           count(*)::int as pa_n,
           count(*) filter (where pa.result not in ('none', 'walk', 'hit_by_pitch', 'sacrifice'))::int as at_bats,
           count(*) filter (where pa.result in ('single', 'double', 'triple', 'home_run'))::int as hits,
           count(*) filter (where pa.result = 'double')::int as doubles,
           count(*) filter (where pa.result = 'triple')::int as triples,
           count(*) filter (where pa.result = 'home_run')::int as home_runs,
           coalesce(sum(pa.rbi), 0)::int as rbi,
           count(*) filter (where pa.result in ('walk', 'hit_by_pitch'))::int as walks,
           count(*) filter (where pa.result = 'strikeout')::int as strikeouts
    from public.plate_appearances pa
    where pa.game_id in (select id from scope)
    group by pa.player_id
  ),
  ids as (
    select p.id from public.players p where p.team_id = p_team_id and p.archived_at is null
    union select player_id from played
    union select player_id from scored
    union select player_id from assisted
    union select player_id from batting
  ),
  snap as (
    select distinct on (gp.player_id) gp.player_id, gp.name_snapshot, gp.number_snapshot
    from public.game_players gp
    join public.games g on g.id = gp.game_id
    where g.team_id = p_team_id
    order by gp.player_id, g.game_date desc, g.created_at desc
  )
  select i.id,
         coalesce(nullif(trim(p.first_name || ' ' || coalesce(p.last_name, '')), ''), sn.name_snapshot, 'Removed player'),
         coalesce(p.jersey_number, sn.number_snapshot),
         (p.id is null or p.archived_at is not null),
         coalesce(pl.games, 0),
         coalesce(pl.n, 0), coalesce(sc.goals, 0), coalesce(a.assists, 0), coalesce(sc.points, 0),
         coalesce(sc.field_goals, 0), coalesce(sc.three_pointers, 0), coalesce(sc.free_throws, 0), coalesce(sc.runs, 0),
         coalesce(b.pa_n, 0), coalesce(b.at_bats, 0), coalesce(b.hits, 0), coalesce(b.doubles, 0), coalesce(b.triples, 0),
         coalesce(b.home_runs, 0), coalesce(b.rbi, 0), coalesce(b.walks, 0), coalesce(b.strikeouts, 0)
  from ids i
  left join public.players p on p.id = i.id
  left join snap sn on sn.player_id = i.id
  left join played pl on pl.player_id = i.id
  left join scored sc on sc.player_id = i.id
  left join assisted a on a.player_id = i.id
  left join batting b on b.player_id = i.id
  where public.is_active_member(p_team_id);
$$;
revoke all on function public.player_season_stats(uuid, uuid, uuid) from public;
grant execute on function public.player_season_stats(uuid, uuid, uuid) to authenticated, service_role;

-- ---------- legacy backup import ----------
-- The client normalises the old `mini-messis-coach-v5` file with the sports engine (formations →
-- roles/codes, goals → event types) and sends this shape:
-- { "replace": bool,
--   "team": { "side_size": int, "has_gk": bool, "periods_count": int, "colors": {} },
--   "players": [{ "key": text, "first_name": text, "jersey_number": text|null, "is_available": bool, "batting_order": int|null }],
--   "template": [{ "formation_name": text, "slots": [{ "position_role", "position_code", "player_key"|null, "auto_picked" }] }],
--   "last_batter_key": text|null,
--   "games": [{ "opponent", "game_date", "status", "created_at", "started_at", "finished_at", "notes",
--               "lineups": [as template], "events": [{ "side", "period_index", "event_type", "scorer_key", "assist_key", "occurred_at" }],
--               "players": [{ "key", "name", "number" }] }] }
-- With replace=true the team's players, template and games are wiped first (the UI double-confirms).
create or replace function public.import_legacy_backup(p_team_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_season uuid;
  v_player jsonb;
  v_game jsonb;
  v_period jsonb;
  v_slot jsonb;
  v_ev jsonb;
  v_snap jsonb;
  v_pid uuid;
  v_gid uuid;
  v_lineup uuid;
  v_i int;
  v_j int;
  v_players int := 0;
  v_games int := 0;
  v_events int := 0;
begin
  if not public.is_staff(p_team_id) then
    raise exception 'only a coach or assistant can import a backup' using errcode = '42501';
  end if;
  create temp table if not exists _legacy_map (key text primary key, id uuid) on commit drop;
  delete from _legacy_map;

  if coalesce((p_data ->> 'replace')::boolean, false) then
    update public.teams set last_batter_player_id = null where id = p_team_id;
    delete from public.games where team_id = p_team_id;
    delete from public.lineups where team_id = p_team_id;
    delete from public.players where team_id = p_team_id;
  end if;

  select s.id into v_season from public.seasons s where s.team_id = p_team_id and s.is_current limit 1;
  if v_season is null then
    insert into public.seasons (team_id, name, starts_on, is_current)
    values (p_team_id, to_char(now(), 'YYYY') || ' season', current_date, true)
    returning id into v_season;
  end if;

  if p_data ? 'team' then
    update public.teams
    set side_size = coalesce((p_data -> 'team' ->> 'side_size')::int, side_size),
        has_gk = coalesce((p_data -> 'team' ->> 'has_gk')::boolean, has_gk),
        periods_count = coalesce((p_data -> 'team' ->> 'periods_count')::int, periods_count),
        colors = coalesce(p_data -> 'team' -> 'colors', colors)
    where id = p_team_id;
  end if;

  v_i := 0;
  for v_player in select * from jsonb_array_elements(coalesce(p_data -> 'players', '[]'::jsonb)) loop
    insert into public.players (team_id, first_name, jersey_number, is_available, batting_order, sort_order, updated_by)
    values (p_team_id, left(coalesce(nullif(trim(v_player ->> 'first_name'), ''), 'Player'), 40),
            nullif(left(v_player ->> 'jersey_number', 3), ''), coalesce((v_player ->> 'is_available')::boolean, true),
            (v_player ->> 'batting_order')::int, v_i, v_uid)
    returning id into v_pid;
    insert into _legacy_map (key, id) values (v_player ->> 'key', v_pid) on conflict do nothing;
    v_i := v_i + 1;
    v_players := v_players + 1;
  end loop;

  -- template
  if p_data ? 'template' then
    delete from public.lineups where team_id = p_team_id and game_id is null;
    v_i := 0;
    for v_period in select * from jsonb_array_elements(p_data -> 'template') loop
      insert into public.lineups (team_id, game_id, period_index, formation_name)
      values (p_team_id, null, v_i, coalesce(v_period ->> 'formation_name', ''))
      returning id into v_lineup;
      v_j := 0;
      for v_slot in select * from jsonb_array_elements(coalesce(v_period -> 'slots', '[]'::jsonb)) loop
        insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code, player_id, auto_picked)
        values (v_lineup, v_j, coalesce(v_slot ->> 'position_role', ''), coalesce(v_slot ->> 'position_code', ''),
                (select m.id from _legacy_map m where m.key = v_slot ->> 'player_key'),
                coalesce((v_slot ->> 'auto_picked')::boolean, false));
        v_j := v_j + 1;
      end loop;
      v_i := v_i + 1;
    end loop;
  end if;

  -- games
  for v_game in select * from jsonb_array_elements(coalesce(p_data -> 'games', '[]'::jsonb)) loop
    insert into public.games (team_id, season_id, opponent, game_date, status, created_at, started_at, finished_at, team_name_snapshot, updated_by)
    values (p_team_id, v_season, left(coalesce(nullif(v_game ->> 'opponent', ''), 'Opponent'), 40),
            coalesce((v_game ->> 'game_date')::date, current_date),
            coalesce((v_game ->> 'status')::public.game_status, 'done'),
            coalesce((v_game ->> 'created_at')::timestamptz, now()),
            (v_game ->> 'started_at')::timestamptz, (v_game ->> 'finished_at')::timestamptz,
            nullif(v_game ->> 'team_name', ''), v_uid)
    returning id into v_gid;
    v_games := v_games + 1;
    v_i := 0;
    for v_period in select * from jsonb_array_elements(coalesce(v_game -> 'lineups', '[]'::jsonb)) loop
      insert into public.lineups (team_id, game_id, period_index, formation_name)
      values (p_team_id, v_gid, v_i, coalesce(v_period ->> 'formation_name', ''))
      returning id into v_lineup;
      v_j := 0;
      for v_slot in select * from jsonb_array_elements(coalesce(v_period -> 'slots', '[]'::jsonb)) loop
        insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code, player_id, auto_picked)
        values (v_lineup, v_j, coalesce(v_slot ->> 'position_role', ''), coalesce(v_slot ->> 'position_code', ''),
                (select m.id from _legacy_map m where m.key = v_slot ->> 'player_key'),
                coalesce((v_slot ->> 'auto_picked')::boolean, false));
        v_j := v_j + 1;
      end loop;
      v_i := v_i + 1;
    end loop;
    for v_ev in select * from jsonb_array_elements(coalesce(v_game -> 'events', '[]'::jsonb)) loop
      insert into public.score_events (game_id, side, period_index, event_type, points, scorer_player_id, assist_player_id, occurred_at, created_by)
      values (v_gid, coalesce((v_ev ->> 'side')::public.score_side, 'us'), coalesce((v_ev ->> 'period_index')::int, 0),
              coalesce(v_ev ->> 'event_type', 'goal'), 1,
              (select m.id from _legacy_map m where m.key = v_ev ->> 'scorer_key'),
              (select m.id from _legacy_map m where m.key = v_ev ->> 'assist_key'),
              coalesce((v_ev ->> 'occurred_at')::timestamptz, now()), v_uid);
      v_events := v_events + 1;
    end loop;
    for v_snap in select * from jsonb_array_elements(coalesce(v_game -> 'players', '[]'::jsonb)) loop
      select m.id into v_pid from _legacy_map m where m.key = v_snap ->> 'key';
      if v_pid is not null then
        insert into public.game_players (game_id, player_id, name_snapshot, number_snapshot, available)
        values (v_gid, v_pid, coalesce(v_snap ->> 'name', ''), nullif(v_snap ->> 'number', ''), true)
        on conflict do nothing;
      end if;
    end loop;
    if nullif(v_game ->> 'notes', '') is not null then
      insert into public.game_coach_notes (game_id, notes) values (v_gid, left(v_game ->> 'notes', 4000));
    end if;
  end loop;

  if nullif(p_data ->> 'last_batter_key', '') is not null then
    update public.teams set last_batter_player_id = (select m.id from _legacy_map m where m.key = p_data ->> 'last_batter_key')
    where id = p_team_id;
  end if;

  return jsonb_build_object('players', v_players, 'games', v_games, 'events', v_events);
end;
$$;
revoke all on function public.import_legacy_backup(uuid, jsonb) from public;
grant execute on function public.import_legacy_backup(uuid, jsonb) to authenticated, service_role;

-- skill_tests changes should reach other viewers too
alter publication supabase_realtime add table public.skill_tests, public.skill_results;
alter table public.skill_results replica identity full;
