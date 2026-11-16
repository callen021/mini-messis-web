-- Hockey (D122), step 2 of 2. Six on the ice — G, LD, RD, LW, C, RW — on the game clock with
-- three periods, like any clock sport: stints, the bench queue, the tap queue and undo are the
-- existing ones. What hockey adds is **lines**: up to three named forward lines (LW, C, RW) and
-- two defense pairs (LD, RD) per team (`lines`), and a one-tap line change
-- (`clock_line_change`) that puts the line on exactly as saved, as one undoable op: a line
-- player already on the ice elsewhere moves to their line spot; players displaced from the
-- line's spots who are not in the line go to the bench; a spot that is left empty by a move
-- stays open and is returned so the court can flag it. A forward line change never touches the
-- defense, a pair change never touches the forwards; the goalie is never touched. Goals keep
-- the soccer model: a scorer and an optional assist, editable after the fact.

-- ---------- lines ----------
create table public.lines (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  kind        text not null check (kind in ('forward', 'defense')),
  -- F1–F3, D1–D2
  slot        int not null,
  name        text not null default '' check (length(name) <= 24),
  player_ids  uuid[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  unique (team_id, kind, slot),
  check ((kind = 'forward' and slot between 1 and 3) or (kind = 'defense' and slot between 1 and 2)),
  check (coalesce(array_length(player_ids, 1), 0) <= case kind when 'forward' then 3 else 2 end)
);
create trigger lines_updated_at before update on public.lines
  for each row execute function public.set_updated_at();
create trigger lines_stamp before insert or update on public.lines
  for each row execute function public.stamp_updated_by();

-- every player of a line is on the team, and once
create or replace function public.lines_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pid uuid;
begin
  if new.player_ids is not null then
    foreach v_pid in array new.player_ids loop
      if v_pid is not null and public.team_of_player(v_pid) is distinct from new.team_id then
        raise exception 'player is not on this team' using errcode = '23503';
      end if;
    end loop;
    if (select count(distinct x) from unnest(new.player_ids) as x where x is not null)
       <> (select count(*) from unnest(new.player_ids) as x where x is not null) then
      raise exception 'a player can only be in a line once' using errcode = '23514';
    end if;
  end if;
  new.name := left(trim(coalesce(new.name, '')), 24);
  return new;
end;
$$;
create trigger lines_validate before insert or update on public.lines
  for each row execute function public.lines_validate();

alter table public.lines enable row level security;
create policy lines_select_member on public.lines for select to authenticated
  using (public.is_active_member(team_id));
create policy lines_write_staff on public.lines for all to authenticated
  using (public.is_staff(team_id))
  with check (public.is_staff(team_id));
alter publication supabase_realtime add table public.lines;

-- a line change is an op like a sub
alter table public.clock_ops drop constraint if exists clock_ops_kind_check;
alter table public.clock_ops add constraint clock_ops_kind_check
  check (kind in ('sub', 'swap', 'empty', 'fill', 'lineup', 'end_period', 'bench', 'formation', 'point', 'rotate', 'line'));

-- goals score one
create or replace function public.score_event_points(p_sport public.sport, p_event_type text)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case p_sport::text
    when 'soccer' then case p_event_type when 'goal' then 1 end
    when 'lacrosse' then case p_event_type when 'goal' then 1 end
    when 'hockey' then case p_event_type when 'goal' then 1 end
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
    when 'hockey' then '[
      {"key":"skate","name":"Skating speed","instructions":"Skate goal line to far blue line from a standing start. Two tries, same start signal and timing method each session.","metric":"time_seconds","higher_is_better":false,"attempts":5},
      {"key":"puckweave","name":"Puck control","instructions":"Stickhandle through five cones and back. Time the run; a lost puck restarts the attempt.","metric":"time_seconds","higher_is_better":false,"attempts":5},
      {"key":"shooting","name":"Shooting accuracy","instructions":"Ten shots from the slot at an empty net with corner targets. Count targets hit.","metric":"made_of_attempted","higher_is_better":true,"attempts":10},
      {"key":"passing","name":"Passing","instructions":"Ten passes from 20 feet to a stick-width target. Count passes that hit it.","metric":"made_of_attempted","higher_is_better":true,"attempts":10},
      {"key":"sprint","name":"Sprint speed","instructions":"Run 20 yards from a standing start. Two tries, same start signal and timing method each session.","metric":"time_seconds","higher_is_better":false,"attempts":5}
    ]'::jsonb
    else public.default_skill_tests_v1(p_sport)
  end;
$$;

-- ---------- create_team: hockey, like volleyball, has as many clock periods as the template says ----------
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
  -- sets (D121) and hockey periods (D122) are the clock periods
  if p_sport::text in ('volleyball', 'hockey') then
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

-- ---------- the line change ----------
-- Returns the position codes left open by the change (a line player moved out of another spot).
create or replace function public.clock_line_change(p_game_id uuid, p_line_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype := public.clock_game(p_game_id);   -- staff + live + clock mode, settled
  v_at int := public.clock_elapsed(v_g.clock_seconds, v_g.clock_running_since);
  v_p int := v_g.clock_period;
  v_sport text;
  v_line public.lines%rowtype;
  v_lineup uuid := public.lineup_of(p_game_id, v_p);
  v_roles text[];
  v_role text;
  v_k int := 0;
  v_slot int;
  v_code text;
  v_pid uuid;
  v_cur public.stints%rowtype;
  v_was public.stints%rowtype;
  v_op uuid;
  v_off uuid[] := '{}';
  v_on uuid[] := '{}';
  v_moved uuid[] := '{}';
begin
  select t.sport::text into v_sport from public.teams t where t.id = v_g.team_id;
  if v_sport <> 'hockey' then
    raise exception 'line changes are for hockey' using errcode = 'P0019';
  end if;
  if v_p >= public.team_period_count(v_g.team_id) then
    raise exception 'the game clock has reached full time' using errcode = 'P0012';
  end if;
  select * into v_line from public.lines l where l.id = p_line_id and l.team_id = v_g.team_id;
  if not found then
    raise exception 'no such line' using errcode = 'P0011';
  end if;
  if v_lineup is null then
    raise exception 'no lineup for this period' using errcode = 'P0011';
  end if;
  v_roles := case v_line.kind when 'forward' then array['LW', 'C', 'RW'] else array['LD', 'RD'] end;
  v_op := public.clock_new_op(p_game_id, v_p, 'line');
  foreach v_role in array v_roles loop
    v_k := v_k + 1;
    select s.slot_index, s.position_code into v_slot, v_code
    from public.lineup_slots s where s.lineup_id = v_lineup and s.position_role = v_role
    order by s.slot_index limit 1;
    if v_slot is null then continue; end if;
    -- the saved player for this spot, if they can play today
    v_pid := v_line.player_ids[v_k];
    if v_pid is not null and not exists (
      select 1 from public.players p where p.id = v_pid and p.team_id = v_g.team_id and p.archived_at is null and p.is_available
    ) then
      v_pid := null;
    end if;
    -- who holds the spot now
    select * into v_cur from public.stints s
    where s.game_id = p_game_id and s.period_index = v_p and s.slot_index = v_slot and s.clock_end is null;
    if found then
      if v_cur.player_id = v_pid then
        v_slot := null;
        continue;   -- already in place
      end if;
      perform public.clock_close_stint(v_cur, v_at, v_op);
      if v_cur.player_id = any (v_line.player_ids) then
        v_moved := v_moved || v_cur.player_id;   -- a line player: their own spot comes up in this loop
      else
        v_off := v_off || v_cur.player_id;       -- displaced: to the bench
      end if;
    end if;
    if v_pid is not null then
      -- on the ice elsewhere: they move (their old spot stays open unless the line fills it)
      select * into v_was from public.stints s
      where s.game_id = p_game_id and s.period_index = v_p and s.player_id = v_pid and s.clock_end is null;
      if found then
        perform public.clock_close_stint(v_was, v_at, v_op);
        v_moved := v_moved || v_pid;
      elsif not (v_pid = any (v_moved)) then
        v_on := v_on || v_pid;                   -- from the bench
      end if;
      insert into public.stints (game_id, player_id, period_index, slot_index, position_role, position_code, clock_start, opened_by_op, continues)
      values (p_game_id, v_pid, v_p, v_slot, v_role, v_code, v_at, v_op, v_pid = any (v_moved));
    end if;
    v_slot := null;
  end loop;
  perform public.bench_apply(v_lineup, v_on, v_off);
  perform public.clock_sync_lineup(p_game_id, v_p);
  return array(
    select s.position_code from public.lineup_slots s
    where s.lineup_id = v_lineup
      and not exists (select 1 from public.stints st where st.game_id = p_game_id and st.period_index = v_p and st.slot_index = s.slot_index and st.clock_end is null)
    order by s.slot_index
  );
end;
$$;
revoke all on function public.clock_line_change(uuid, uuid) from public;
grant execute on function public.clock_line_change(uuid, uuid) to authenticated, service_role;
