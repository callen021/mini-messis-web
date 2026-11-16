-- Volleyball (D121), step 2 of 2. Six on court in rotation spots 1–6 (slot i = spot i + 1), no
-- clock: a volleyball team is a clock-mode team whose clock never runs, and the "second" is the
-- point of the set. Sets are the periods (`clock_periods` 1, 3 or 5), so the stints, the bench
-- queue, the tap queue and undo all work as they do on the clock, and playing time comes out as
-- points played (the stint length) and sets played (periods with a stint).
--
-- Scoring is point by point, us or them (`vb_point`): the score event is the op, so one Undo takes
-- the point back together with anything it caused. We rotate only when we win the serve back
-- (a side-out: our point while they served); never on their point, never on our own serve, and
-- never before the first serve of a set. With "rotate through bench" on, the player on the exit
-- spot does not rotate: they go to the end of the bench line, the other five rotate one spot
-- clockwise, and Up Next enters at the entry spot (defaults: exit 2, entry 1, so right front goes
-- off and Up Next comes in as the server). A set ends on its own at the target with win-by-two
-- (`vb_set_points`, `vb_deciding_points` for the last possible set), or by hand (`vb_end_set`);
-- the next set's first serve alternates. The active stat keeper (D120) scores; a coach or
-- assistant may also rotate by hand, end a set and undo anything, while a keeper undoes only
-- their own points and rotations.

-- ---------- settings and state ----------
alter table public.teams
  add column vb_set_points int not null default 25 check (vb_set_points between 5 and 50),
  add column vb_deciding_points int not null default 15 check (vb_deciding_points between 5 and 50),
  add column vb_win_by_two boolean not null default true,
  add column vb_rotate_bench boolean not null default true,
  add column vb_exit_spot int not null default 2 check (vb_exit_spot between 1 and 6),
  add column vb_entry_spot int not null default 1 check (vb_entry_spot between 1 and 6);
alter table public.games
  add column vb_serving text check (vb_serving in ('us', 'them')),
  add column vb_first_serve text check (vb_first_serve in ('us', 'them'));
comment on column public.games.vb_serving is 'Volleyball: the side serving the next rally (D121); null until the set''s first serve is known.';
comment on column public.games.vb_first_serve is 'Volleyball: the side that served first in the current set, so the next set alternates (D121).';
alter table public.clock_ops
  add column score_event_id uuid,
  add column serving_before text,
  add column first_serve_before text;
alter table public.clock_ops drop constraint if exists clock_ops_kind_check;
alter table public.clock_ops add constraint clock_ops_kind_check
  check (kind in ('sub', 'swap', 'empty', 'fill', 'lineup', 'end_period', 'bench', 'formation', 'point', 'rotate'));

-- a point scores one
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
    when 'volleyball' then case p_event_type when 'point' then 1 end
    when 'football' then case p_event_type when 'touchdown' then 6 when 'field_goal' then 3 when 'extra_point' then 1 when 'two_point' then 2 when 'safety' then 2 end
  end::smallint;
$$;

-- ---------- default skill tests ----------
create or replace function public.default_skill_tests(p_sport public.sport)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_sport::text
    when 'softball' then public.default_skill_tests_v1('baseball'::public.sport)
    when 'volleyball' then '[
      {"key":"serves","name":"Serving","instructions":"Ten serves from the end line. Count serves that land in the court.","metric":"made_of_attempted","higher_is_better":true,"attempts":10},
      {"key":"passing","name":"Passing","instructions":"Ten tossed balls to forearm-pass back to a target. Count passes that reach the target.","metric":"made_of_attempted","higher_is_better":true,"attempts":10},
      {"key":"setting","name":"Setting","instructions":"Count consecutive overhead sets to yourself above head height before the ball drops.","metric":"count","higher_is_better":true,"attempts":5},
      {"key":"wallvolley","name":"Wall volleys","instructions":"Count consecutive controlled volleys against a wall above a marked line.","metric":"count","higher_is_better":true,"attempts":5},
      {"key":"sprint","name":"Sprint speed","instructions":"Run 20 yards from a standing start. Two tries, same start signal and timing method each session.","metric":"time_seconds","higher_is_better":false,"attempts":5}
    ]'::jsonb
    else public.default_skill_tests_v1(p_sport)
  end;
$$;

-- ---------- create_team: a volleyball team is on the clock with as many clock periods as sets ----------
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
  -- sets are the clock periods (D121): best of 1, 3 or 5
  if p_sport::text = 'volleyball' then
    update public.teams set clock_periods = p_periods_count where id = v_team;
  end if;

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

-- ---------- start_game: a volleyball game's clock never runs ----------
create or replace function public.start_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype;
  v_team_name text;
  v_mode public.time_mode;
  v_sport text;
  v_n int;
  v_tpl uuid;
  v_new uuid;
  i int;
  r record;
begin
  select * into v_g from public.games g where g.id = p_game_id;
  if not found or not public.is_staff(v_g.team_id) then
    raise exception 'only a coach or assistant can start a game' using errcode = '42501';
  end if;
  if v_g.status <> 'upcoming' then
    raise exception 'only an upcoming game can be started' using errcode = '22023';
  end if;
  if exists (select 1 from public.games g where g.team_id = v_g.team_id and g.status = 'live') then
    raise exception 'finish the current game first' using errcode = 'P0004';
  end if;
  select t.name, t.time_mode, t.sport::text into v_team_name, v_mode, v_sport from public.teams t where t.id = v_g.team_id;
  if v_mode = 'clock' then
    v_n := public.team_period_count(v_g.team_id);
    delete from public.lineups where team_id = v_g.team_id and game_id = p_game_id;
    select l.id into v_tpl from public.lineups l where l.team_id = v_g.team_id and l.game_id is null and l.period_index = 0;
    for i in 0..(v_n - 1) loop
      insert into public.lineups (team_id, game_id, period_index, formation_name, bench_order)
      select v_g.team_id, p_game_id, i, coalesce((select formation_name from public.lineups where id = v_tpl), ''),
             coalesce((select bench_order from public.lineups where id = v_tpl), '{}')
      returning id into v_new;
      insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code, player_id, auto_picked)
      select v_new, s.slot_index, s.position_role, s.position_code,
             case when i = 0 and p.id is not null and p.archived_at is null and p.is_available
                       and not public.rsvp_out_for_game(p_game_id, p.id) then s.player_id end,
             false
      from public.lineup_slots s
      left join public.players p on p.id = s.player_id
      where s.lineup_id = v_tpl;
      perform public.bench_normalize(v_new);
    end loop;
    update public.games
    set clock_period = 0, clock_seconds = 0, clock_running_since = null, clock_period_lengths = '{}',
        vb_serving = null, vb_first_serve = null
    where id = p_game_id;
    for r in select s.* from public.lineup_slots s join public.lineups l on l.id = s.lineup_id
             where l.game_id = p_game_id and l.period_index = 0 and s.player_id is not null loop
      insert into public.stints (game_id, player_id, period_index, slot_index, position_role, position_code, clock_start)
      values (p_game_id, r.player_id, 0, r.slot_index, r.position_role, r.position_code, 0);
    end loop;
  else
    perform public.copy_lineups(v_g.team_id, null, p_game_id);
  end if;
  perform public.snapshot_game_players(p_game_id, v_g.team_id);
  update public.games
  set status = 'live', started_at = now(), team_name_snapshot = v_team_name,
      -- the one who starts the game keeps its stats (D120)
      keeper_user_id = (select auth.uid()), keeper_name = public.member_display_name((select auth.uid()))
  where id = p_game_id;
  -- start is kickoff (D109): the clock runs from this moment, with the stretch's limit; a
  -- volleyball game has no clock, its "seconds" are the points of the set (D121)
  if v_mode = 'clock' and v_sport <> 'volleyball' then
    perform public.clock_start(p_game_id);
  end if;
end;
$$;

-- ---------- helpers ----------
-- the live volleyball game, for whoever keeps its stats (D120)
create or replace function public.vb_game(p_game_id uuid)
returns public.games
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype;
  v_sport text;
begin
  select * into v_g from public.games g where g.id = p_game_id;
  if not found or not public.can_log_stats(p_game_id) then
    raise exception 'only the one keeping the stats can score this game' using errcode = '42501';
  end if;
  if v_g.status <> 'live' then
    raise exception 'points are scored during a live game' using errcode = '22023';
  end if;
  select t.sport::text into v_sport from public.teams t where t.id = v_g.team_id;
  if v_sport <> 'volleyball' then
    raise exception 'this is not a volleyball team' using errcode = 'P0019';
  end if;
  return v_g;
end;
$$;
revoke all on function public.vb_game(uuid) from public;

-- the points a set is played to: the deciding (last possible) set has its own target
create or replace function public.vb_set_target(p_team public.teams, p_set int, p_sets int)
returns int
language sql
immutable
set search_path = ''
as $$
  select case when p_sets > 1 and p_set >= p_sets - 1 then p_team.vb_deciding_points else p_team.vb_set_points end;
$$;
revoke all on function public.vb_set_target(public.teams, int, int) from public;

-- 'us' / 'them' when the set is won at this score, else null
create or replace function public.vb_set_won(p_us int, p_them int, p_target int, p_win_by_two boolean)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_us >= p_target and (not p_win_by_two or p_us - p_them >= 2) then 'us'
    when p_them >= p_target and (not p_win_by_two or p_them - p_us >= 2) then 'them'
  end;
$$;
revoke all on function public.vb_set_won(int, int, int, boolean) from public;
grant execute on function public.vb_set_won(int, int, int, boolean) to authenticated, service_role;

-- sets won so far: the sets that have ended (before the current one), by the points in them
create or replace function public.vb_sets_won(p_game_id uuid, out us int, out them int)
language sql
stable
security definer
set search_path = ''
as $$
  with per as (
    select e.period_index,
           coalesce(sum(e.points) filter (where e.side = 'us'), 0) as us,
           coalesce(sum(e.points) filter (where e.side = 'them'), 0) as them
    from public.score_events e
    join public.games g on g.id = e.game_id
    where e.game_id = p_game_id and e.period_index < g.clock_period
    group by e.period_index
  )
  select count(*) filter (where per.us > per.them)::int, count(*) filter (where per.them > per.us)::int from per;
$$;
revoke all on function public.vb_sets_won(uuid) from public;
grant execute on function public.vb_sets_won(uuid) to authenticated, service_role;

-- ---------- the rotation ----------
-- Everyone on court moves one spot clockwise (spot s → s − 1, spot 1 → 6) at point p_at of the
-- period, as one op: every open stint closes and reopens in the new spot with `continues`, so the
-- shift goes on. Through the bench (when the team setting is on and someone is waiting): the player
-- on the exit spot leaves for the end of the bench line instead of rotating, and Up Next enters at
-- the entry spot (the spot the rotation left empty is the one before the exit spot; an entry spot
-- elsewhere sends whoever rotated into it to that empty spot).
create or replace function public.vb_rotate_inner(p_game_id uuid, p_period int, p_at int, p_op uuid, p_bench boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype;
  v_t public.teams%rowtype;
  v_cur uuid[] := array_fill(null::uuid, array[6]);
  v_new uuid[] := array_fill(null::uuid, array[6]);
  v_s public.stints%rowtype;
  v_lineup uuid := public.lineup_of(p_game_id, p_period);
  v_off uuid;
  v_on uuid;
  v_e int;
  v_n int;
  v_hole int;
  v_role text;
  v_code text;
  i int;
begin
  select * into v_g from public.games g where g.id = p_game_id;
  select * into v_t from public.teams t where t.id = v_g.team_id;
  for v_s in select * from public.stints s where s.game_id = p_game_id and s.period_index = p_period and s.clock_end is null loop
    if v_s.slot_index between 0 and 5 then
      v_cur[v_s.slot_index + 1] := v_s.player_id;
    end if;
  end loop;
  if p_bench and v_t.vb_rotate_bench then
    v_e := v_t.vb_exit_spot;
    v_n := v_t.vb_entry_spot;
    select l.bench_order[1] into v_on from public.lineups l where l.id = v_lineup;
    if v_on is not null and v_cur[v_e] is not null
       and exists (select 1 from public.players p where p.id = v_on and p.team_id = v_g.team_id and p.archived_at is null and p.is_available) then
      v_off := v_cur[v_e];
      v_cur[v_e] := null;
    else
      v_on := null;
    end if;
  end if;
  for i in 1..6 loop
    v_new[case when i = 1 then 6 else i - 1 end] := v_cur[i];
  end loop;
  if v_off is not null then
    v_hole := case when v_e = 1 then 6 else v_e - 1 end;
    if v_n <> v_hole then
      v_new[v_hole] := v_new[v_n];
    end if;
    v_new[v_n] := v_on;
  end if;
  for v_s in select * from public.stints s where s.game_id = p_game_id and s.period_index = p_period and s.clock_end is null loop
    perform public.clock_close_stint(v_s, p_at, p_op);
  end loop;
  for i in 1..6 loop
    if v_new[i] is not null then
      select cs.o_role, cs.o_code into v_role, v_code from public.clock_spot(p_game_id, p_period, i - 1) cs;
      insert into public.stints (game_id, player_id, period_index, slot_index, position_role, position_code, clock_start, opened_by_op, continues)
      values (p_game_id, v_new[i], p_period, i - 1, v_role, v_code, p_at, p_op, v_new[i] is distinct from v_on);
    end if;
  end loop;
  if v_off is not null then
    perform public.bench_apply(v_lineup, array[v_on], array[v_off]);
  end if;
  perform public.clock_sync_lineup(p_game_id, p_period);
end;
$$;
revoke all on function public.vb_rotate_inner(uuid, int, int, uuid, boolean) from public;

-- ---------- end of a set: like the end of a clock period, and the first serve alternates ----------
create or replace function public.vb_end_set_inner(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype;
  v_n int;
  v_at int;
  v_p int;
  v_op uuid;
  v_s public.stints%rowtype;
  v_lengths int[];
  v_on jsonb;
  v_row jsonb;
  v_cur uuid;
  v_next uuid;
  v_serve text;
begin
  select * into v_g from public.games g where g.id = p_game_id;
  v_n := public.team_period_count(v_g.team_id);
  v_at := v_g.clock_seconds;
  v_p := v_g.clock_period;
  v_lengths := v_g.clock_period_lengths;
  v_on := (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.stints s where s.game_id = p_game_id and s.clock_end is null);
  if v_p >= v_n then
    raise exception 'the match is over' using errcode = 'P0012';
  end if;
  v_op := public.clock_new_op(p_game_id, v_p, 'end_period');
  for v_s in select * from public.stints s where s.game_id = p_game_id and s.clock_end is null loop
    perform public.clock_close_stint(v_s, v_at, v_op);
  end loop;
  v_lengths[v_p + 1] := v_at;
  v_serve := case v_g.vb_first_serve when 'us' then 'them' when 'them' then 'us' end;
  update public.games
  set clock_period = v_p + 1, clock_seconds = 0, clock_running_since = null, clock_period_lengths = v_lengths,
      vb_serving = v_serve, vb_first_serve = v_serve
  where id = p_game_id;
  if v_p + 1 < v_n then
    select l.id into v_cur from public.lineups l where l.game_id = p_game_id and l.period_index = v_p;
    select l.id into v_next from public.lineups l where l.game_id = p_game_id and l.period_index = v_p + 1;
    if v_cur is not null and v_next is not null then
      update public.lineups n set formation_name = c.formation_name, bench_order = c.bench_order
      from public.lineups c where n.id = v_next and c.id = v_cur;
      delete from public.lineup_slots where lineup_id = v_next;
      insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code, player_id, auto_picked)
      select v_next, s.slot_index, s.position_role, s.position_code, null, false
      from public.lineup_slots s where s.lineup_id = v_cur;
    end if;
    -- the players who ended this set start the next, in the same spots, at zero
    for v_row in select * from jsonb_array_elements(v_on) loop
      perform public.clock_open_stint(p_game_id, (v_row ->> 'player_id')::uuid, v_p + 1, (v_row ->> 'slot_index')::int,
                                      v_row ->> 'position_role', v_row ->> 'position_code', 0, v_op);
    end loop;
    perform public.clock_sync_lineup(p_game_id, v_p + 1);
  end if;
end;
$$;
revoke all on function public.vb_end_set_inner(uuid) from public;

-- ---------- the public calls ----------
create or replace function public.vb_point(p_game_id uuid, p_side text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype := public.vb_game(p_game_id);
  v_t public.teams%rowtype;
  v_p int := v_g.clock_period;
  v_n int := public.team_period_count(v_g.team_id);
  v_at int := v_g.clock_seconds;
  v_op uuid;
  v_ev uuid;
  v_us int;
  v_them int;
  v_sets record;
begin
  if p_side not in ('us', 'them') then
    raise exception 'side must be us or them' using errcode = '22023';
  end if;
  if v_p >= v_n then
    raise exception 'the match is over' using errcode = 'P0012';
  end if;
  select * into v_sets from public.vb_sets_won(p_game_id);
  if v_sets.us * 2 > v_n or v_sets.them * 2 > v_n then
    raise exception 'the match is decided' using errcode = 'P0012';
  end if;
  select * into v_t from public.teams t where t.id = v_g.team_id;
  v_op := public.clock_new_op(p_game_id, v_p, 'point');
  insert into public.score_events (game_id, side, period_index, event_type, points, clock_seconds)
  values (p_game_id, p_side::public.score_side, v_p, 'point', 1, v_at)
  returning id into v_ev;
  update public.clock_ops
  set score_event_id = v_ev, serving_before = v_g.vb_serving, first_serve_before = v_g.vb_first_serve
  where id = v_op;
  update public.games
  set clock_seconds = v_at + 1, vb_serving = p_side, vb_first_serve = coalesce(v_g.vb_first_serve, v_g.vb_serving)
  where id = p_game_id;
  -- a side-out: we win the serve back, so we rotate (never on their point, never on our own serve)
  if p_side = 'us' and v_g.vb_serving = 'them' then
    perform public.vb_rotate_inner(p_game_id, v_p, v_at + 1, v_op, true);
  end if;
  select coalesce(sum(e.points) filter (where e.side = 'us'), 0), coalesce(sum(e.points) filter (where e.side = 'them'), 0)
  into v_us, v_them
  from public.score_events e where e.game_id = p_game_id and e.period_index = v_p;
  if public.vb_set_won(v_us, v_them, public.vb_set_target(v_t, v_p, v_n), v_t.vb_win_by_two) is not null then
    perform public.vb_end_set_inner(p_game_id);
  end if;
end;
$$;
revoke all on function public.vb_point(uuid, text) from public;
grant execute on function public.vb_point(uuid, text) to authenticated, service_role;

-- who serves next (and, before the set's first point, who served first)
create or replace function public.vb_set_serve(p_game_id uuid, p_side text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype := public.vb_game(p_game_id);
begin
  if p_side not in ('us', 'them') then
    raise exception 'side must be us or them' using errcode = '22023';
  end if;
  update public.games
  set vb_serving = p_side,
      vb_first_serve = case when v_g.clock_seconds = 0 then p_side else v_g.vb_first_serve end
  where id = p_game_id;
end;
$$;
revoke all on function public.vb_set_serve(uuid, text) from public;
grant execute on function public.vb_set_serve(uuid, text) to authenticated, service_role;

-- a rotation by hand: the same move, as its own op
create or replace function public.vb_rotate(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype := public.vb_game(p_game_id);
  v_op uuid;
begin
  if v_g.clock_period >= public.team_period_count(v_g.team_id) then
    raise exception 'the match is over' using errcode = 'P0012';
  end if;
  v_op := public.clock_new_op(p_game_id, v_g.clock_period, 'rotate');
  perform public.vb_rotate_inner(p_game_id, v_g.clock_period, v_g.clock_seconds, v_op, true);
end;
$$;
revoke all on function public.vb_rotate(uuid) from public;
grant execute on function public.vb_rotate(uuid) to authenticated, service_role;

create or replace function public.vb_end_set(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.vb_game(p_game_id);
  perform public.vb_end_set_inner(p_game_id);
end;
$$;
revoke all on function public.vb_end_set(uuid) from public;
grant execute on function public.vb_end_set(uuid) to authenticated, service_role;

-- ---------- undo: a point op takes its score event, serve and rotation back ----------
create or replace function public.clock_undo_inner(p_game_id uuid, p_period int, p_staff boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op public.clock_ops%rowtype;
  v_row jsonb;
  v_lineup uuid;
begin
  -- the latest change still in effect (undo steps back through the period, D79)
  select * into v_op from public.clock_ops o where o.game_id = p_game_id and o.undone_at is null order by o.seq desc limit 1;
  if not found or v_op.kind = 'end_period' or v_op.period_index <> p_period then
    raise exception 'nothing to undo' using errcode = 'P0015';
  end if;
  -- a stat keeper who is not staff undoes points and rotations only (D121)
  if not p_staff and v_op.kind not in ('point', 'rotate') then
    raise exception 'nothing to undo' using errcode = 'P0015';
  end if;
  delete from public.stints where opened_by_op = v_op.id;
  update public.stints set clock_end = null, closed_by_op = null where closed_by_op = v_op.id;
  for v_row in select * from jsonb_array_elements(v_op.deleted_stints) loop
    insert into public.stints (id, game_id, player_id, period_index, slot_index, position_role, position_code, clock_start, clock_end, opened_by_op, created_at, created_by, continues)
    values ((v_row ->> 'id')::uuid, p_game_id, (v_row ->> 'player_id')::uuid, (v_row ->> 'period_index')::int,
            (v_row ->> 'slot_index')::int, v_row ->> 'position_role', v_row ->> 'position_code',
            (v_row ->> 'clock_start')::int, null, nullif(v_row ->> 'opened_by_op', '')::uuid,
            (v_row ->> 'created_at')::timestamptz, nullif(v_row ->> 'created_by', '')::uuid,
            coalesce((v_row ->> 'continues')::boolean, false));
  end loop;
  update public.clock_ops set undone_at = now() where id = v_op.id;
  if v_op.kind = 'formation' then
    -- the shape as it was: name and spots (players are mirrored from the reopened stints below)
    select l.id into v_lineup from public.lineups l where l.game_id = p_game_id and l.period_index = p_period;
    if v_lineup is not null then
      update public.lineups set formation_name = coalesce(v_op.formation_before, formation_name) where id = v_lineup;
      delete from public.lineup_slots where lineup_id = v_lineup;
      insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code, player_id, auto_picked)
      select v_lineup, (e ->> 'slot_index')::int, coalesce(e ->> 'position_role', ''), coalesce(e ->> 'position_code', ''),
             null, false
      from jsonb_array_elements(coalesce(v_op.slots_before, '[]'::jsonb)) as e;
    end if;
  end if;
  if v_op.kind = 'point' then
    -- the point itself, the serve as it was, and the set's point count
    delete from public.score_events where id = v_op.score_event_id;
    update public.games
    set clock_seconds = greatest(0, clock_seconds - 1),
        vb_serving = v_op.serving_before, vb_first_serve = v_op.first_serve_before
    where id = p_game_id;
  end if;
  if v_op.bench_before is not null then
    update public.lineups set bench_order = v_op.bench_before where game_id = p_game_id and period_index = p_period;
  end if;
  perform public.clock_sync_lineup(p_game_id, p_period);
  return v_op.kind;
end;
$$;
revoke all on function public.clock_undo_inner(uuid, int, boolean) from public;

create or replace function public.clock_undo(p_game_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype := public.clock_game(p_game_id);
begin
  return public.clock_undo_inner(p_game_id, v_g.clock_period, true);
end;
$$;

create or replace function public.vb_undo(p_game_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype := public.vb_game(p_game_id);
begin
  return public.clock_undo_inner(p_game_id, v_g.clock_period, public.is_staff(v_g.team_id));
end;
$$;
revoke all on function public.vb_undo(uuid) from public;
grant execute on function public.vb_undo(uuid) to authenticated, service_role;

-- ---------- a volleyball game's score is sets won ----------
create or replace function public.game_scores_for(p_game_ids uuid[])
returns table (game_id uuid, us int, them int)
language sql
stable
security definer
set search_path = ''
as $$
  with per as (
    select e.game_id, e.period_index,
           coalesce(sum(e.points) filter (where e.side = 'us'), 0)::int as us,
           coalesce(sum(e.points) filter (where e.side = 'them'), 0)::int as them
    from public.score_events e
    where e.game_id = any (p_game_ids)
    group by e.game_id, e.period_index
  )
  select g.id,
         case when t.sport::text = 'volleyball'
              then (select count(*)::int from per p where p.game_id = g.id and p.us > p.them and p.period_index < g.clock_period)
              else coalesce((select sum(p.us) from per p where p.game_id = g.id), 0)::int end,
         case when t.sport::text = 'volleyball'
              then (select count(*)::int from per p where p.game_id = g.id and p.them > p.us and p.period_index < g.clock_period)
              else coalesce((select sum(p.them) from per p where p.game_id = g.id), 0)::int end
  from public.games g
  join public.teams t on t.id = g.team_id
  where g.id = any (p_game_ids) and public.is_active_member(g.team_id);
$$;

-- ---------- the stats: periods with a stint (sets played for volleyball) ----------
drop function if exists public.player_season_stats(uuid, uuid, uuid);
create function public.player_season_stats(
  p_team_id uuid,
  p_season_id uuid default null,
  p_game_id uuid default null
)
returns table (
  player_id uuid, name text, number text, removed boolean, games_played int, periods_played int, goals int, assists int,
  points int, field_goals int, three_pointers int, free_throws int, runs int, plate_appearances int,
  at_bats int, hits int, doubles int, triples int, home_runs int, rbi int, walks int, strikeouts int,
  seconds_played int, rebounds int, steals int, fouls int, stint_periods int
)
language sql
stable
security definer
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
  timed as (
    select st.player_id,
           sum(greatest(0, coalesce(st.clock_end, case when g.clock_period = st.period_index then public.clock_elapsed(g.clock_seconds, g.clock_running_since, g.clock_limit) else st.clock_start end) - st.clock_start))::int as secs,
           count(distinct st.period_index)::int as periods
    from public.stints st
    join public.games g on g.id = st.game_id
    where st.game_id in (select id from scope)
    group by st.player_id
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
  tallied as (
    select x.player_id,
           count(*) filter (where x.stat_type = 'rebound')::int as rebounds,
           count(*) filter (where x.stat_type = 'assist')::int as assists,
           count(*) filter (where x.stat_type = 'steal')::int as steals,
           count(*) filter (where x.stat_type = 'foul')::int as fouls
    from public.stat_events x
    where x.game_id in (select id from scope)
    group by x.player_id
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
    union select player_id from timed
    union select player_id from scored
    union select player_id from assisted
    union select player_id from tallied
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
         coalesce(pl.n, 0), coalesce(sc.goals, 0), coalesce(a.assists, 0) + coalesce(ta.assists, 0), coalesce(sc.points, 0),
         coalesce(sc.field_goals, 0), coalesce(sc.three_pointers, 0), coalesce(sc.free_throws, 0), coalesce(sc.runs, 0),
         coalesce(b.pa_n, 0), coalesce(b.at_bats, 0), coalesce(b.hits, 0), coalesce(b.doubles, 0), coalesce(b.triples, 0),
         coalesce(b.home_runs, 0), coalesce(b.rbi, 0), coalesce(b.walks, 0), coalesce(b.strikeouts, 0),
         coalesce(tm.secs, 0), coalesce(ta.rebounds, 0), coalesce(ta.steals, 0), coalesce(ta.fouls, 0),
         coalesce(tm.periods, 0)
  from ids i
  left join public.players p on p.id = i.id
  left join snap sn on sn.player_id = i.id
  left join played pl on pl.player_id = i.id
  left join timed tm on tm.player_id = i.id
  left join scored sc on sc.player_id = i.id
  left join assisted a on a.player_id = i.id
  left join tallied ta on ta.player_id = i.id
  left join batting b on b.player_id = i.id
  where public.is_active_member(p_team_id)
    and (public.sees_all_stats(p_team_id) or public.is_linked_to(i.id));
$$;
revoke all on function public.player_season_stats(uuid, uuid, uuid) from public;
grant execute on function public.player_season_stats(uuid, uuid, uuid) to authenticated, service_role;
