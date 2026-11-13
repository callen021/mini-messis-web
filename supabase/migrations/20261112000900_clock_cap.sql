-- Runaway clock safety stop (D105). A running period pauses itself once it has run 30 minutes
-- past the period length, or 90 minutes when the team sets no length. Stored timestamps alone
-- decide it: every read of the clock settles the game, every clock action loads the settled row,
-- and the stats compute from the capped stretch, so it holds when the app was closed throughout
-- and for games already running away when this lands. After an automatic pause, Resume runs the
-- clock for up to another 30 minutes before it pauses itself again.

alter table public.games
  add column if not exists clock_limit int,
  add column if not exists clock_auto_paused boolean not null default false;
comment on column public.games.clock_limit is
  'Period second the running stretch pauses itself at (D105): the cap, or 30 minutes after a restart at the cap. Null while paused.';
comment on column public.games.clock_auto_paused is 'The last pause was the safety stop (D105).';

-- The limit of a stretch that starts with p_seconds banked.
create or replace function public.clock_limit_for(p_team_id uuid, p_seconds int)
returns int
language sql
stable
set search_path = ''
as $$
  select case when p_seconds < c.cap then c.cap else p_seconds + 1800 end
  from (select coalesce(t.period_minutes * 60 + 1800, 5400) as cap from public.teams t where t.id = p_team_id) c;
$$;
revoke all on function public.clock_limit_for(uuid, int) from public;

-- Elapsed seconds within the stretch's limit (the two-argument form stays the raw reading).
create or replace function public.clock_elapsed(p_seconds int, p_running_since timestamptz, p_limit int)
returns int
language sql
stable
set search_path = ''
as $$
  select p_seconds
       + case when p_running_since is null then 0
              else least(greatest(0, floor(extract(epoch from (now() - p_running_since)))::int),
                         greatest(0, coalesce(p_limit, 2147483647) - p_seconds)) end;
$$;

-- A stretch at or past its limit becomes a pause at the limit.
create or replace function public.clock_settle(p_game_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.games g
  set clock_seconds = g.clock_limit, clock_running_since = null, clock_auto_paused = true
  where g.id = p_game_id and g.status = 'live' and g.clock_running_since is not null and g.clock_limit is not null
    and public.clock_elapsed(g.clock_seconds, g.clock_running_since) >= g.clock_limit;
$$;
revoke all on function public.clock_settle(uuid) from public;

-- games already running away get their limit now; the next read settles them
update public.games g
set clock_limit = public.clock_limit_for(g.team_id, g.clock_seconds)
where g.status = 'live' and g.clock_running_since is not null and g.clock_limit is null;

-- every clock action loads the settled row
create or replace function public.clock_game(p_game_id uuid)
returns public.games
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype;
  v_mode public.time_mode;
begin
  perform public.clock_settle(p_game_id);
  select * into v_g from public.games g where g.id = p_game_id;
  if not found or not public.is_staff(v_g.team_id) then
    raise exception 'only a coach or assistant can run the clock' using errcode = '42501';
  end if;
  if v_g.status <> 'live' then
    raise exception 'the clock only runs during a live game' using errcode = '22023';
  end if;
  select t.time_mode into v_mode from public.teams t where t.id = v_g.team_id;
  if v_mode <> 'clock' then
    raise exception 'this team tracks playing time by periods, not the clock' using errcode = 'P0007';
  end if;
  return v_g;
end;
$$;

-- Start writes the stretch's limit; a restart at the cap gets another 30 minutes.
create or replace function public.clock_start(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype := public.clock_game(p_game_id);
  v_n int := public.team_period_count(v_g.team_id);
begin
  if v_g.clock_period >= v_n then
    raise exception 'the game clock has reached full time' using errcode = 'P0012';
  end if;
  if v_g.clock_running_since is null then
    update public.games
    set clock_running_since = now(),
        clock_limit = public.clock_limit_for(v_g.team_id, v_g.clock_seconds),
        clock_auto_paused = false
    where id = p_game_id;
  end if;
end;
$$;

-- The clock as every device reads it, settled first; auto_paused says the last pause was the
-- safety stop and nothing has moved since.
drop function if exists public.game_clock(uuid);
create function public.game_clock(p_game_id uuid)
returns table (
  period_index int, clock_seconds int, running_since timestamptz, elapsed int,
  period_lengths int[], server_now timestamptz, limit_seconds int, auto_paused boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.games g where g.id = p_game_id and public.is_active_member(g.team_id)) then
    return;
  end if;
  perform public.clock_settle(p_game_id);
  return query
  select g.clock_period, g.clock_seconds, g.clock_running_since,
         public.clock_elapsed(g.clock_seconds, g.clock_running_since, g.clock_limit),
         g.clock_period_lengths, now(), g.clock_limit,
         (g.clock_auto_paused and g.clock_running_since is null and g.clock_seconds = g.clock_limit)
  from public.games g
  where g.id = p_game_id;
end;
$$;
revoke all on function public.game_clock(uuid) from public;
grant execute on function public.game_clock(uuid) to authenticated, service_role;

-- finishing settles first, so a runaway ends at the cap
create or replace function public.finish_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype;
  v_mode public.time_mode;
  v_at int;
  v_lengths int[];
  r record;
begin
  select * into v_g from public.games g where g.id = p_game_id;
  if not found or not public.is_staff(v_g.team_id) then
    raise exception 'only a coach or assistant can finish a game' using errcode = '42501';
  end if;
  if v_g.status <> 'live' then
    raise exception 'only a live game can be finished' using errcode = '22023';
  end if;
  select t.time_mode into v_mode from public.teams t where t.id = v_g.team_id;
  perform public.clock_settle(p_game_id);
  select * into v_g from public.games g where g.id = p_game_id;
  perform public.snapshot_game_players(p_game_id, v_g.team_id);
  if v_mode = 'clock' then
    v_at := public.clock_elapsed(v_g.clock_seconds, v_g.clock_running_since);
    v_lengths := v_g.clock_period_lengths;
    if v_g.clock_period < public.team_period_count(v_g.team_id) and v_at > 0 then
      v_lengths[v_g.clock_period + 1] := v_at;
    end if;
    update public.stints set clock_end = v_at where game_id = p_game_id and clock_end is null and clock_start < v_at;
    delete from public.stints where game_id = p_game_id and clock_end is null;
    update public.games
    set status = 'done', finished_at = now(), clock_seconds = v_at, clock_running_since = null, clock_period_lengths = v_lengths
    where id = p_game_id;
    -- template := the starters (the game's first-period spots, each with the player who began
    -- the game there), written into every template period
    for r in select l.id from public.lineups l where l.team_id = v_g.team_id and l.game_id is null loop
      update public.lineups
      set formation_name = coalesce((select g.formation_name from public.lineups g where g.game_id = p_game_id and g.period_index = 0), formation_name)
      where id = r.id;
      delete from public.lineup_slots where lineup_id = r.id;
      insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code, player_id, auto_picked)
      select r.id, s.slot_index, s.position_role, s.position_code,
             (select st.player_id from public.stints st
              where st.game_id = p_game_id and st.period_index = 0 and st.clock_start = 0 and st.slot_index = s.slot_index
              order by st.created_at limit 1),
             false
      from public.lineup_slots s join public.lineups g on g.id = s.lineup_id
      where g.game_id = p_game_id and g.period_index = 0;
    end loop;
  else
    update public.games set status = 'done', finished_at = now() where id = p_game_id;
    perform public.copy_lineups(v_g.team_id, p_game_id, null);
  end if;
end;
$$;

-- a score during a runaway is stamped at the cap
create or replace function public.score_events_clock_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype;
  v_mode public.time_mode;
begin
  if new.clock_seconds is not null then return new; end if;
  perform public.clock_settle(new.game_id);
  select * into v_g from public.games g where g.id = new.game_id;
  select t.time_mode into v_mode from public.teams t where t.id = v_g.team_id;
  if v_mode = 'clock' and v_g.status = 'live' and v_g.clock_period < public.team_period_count(v_g.team_id) then
    new.period_index := v_g.clock_period;
    new.clock_seconds := public.clock_elapsed(v_g.clock_seconds, v_g.clock_running_since);
  end if;
  return new;
end;
$$;

-- the stats read the capped stretch, whether or not anyone has opened the game since
create or replace function public.player_season_stats(
  p_team_id uuid,
  p_season_id uuid default null,
  p_game_id uuid default null
)
returns table (
  player_id uuid, name text, number text, removed boolean, games_played int, periods_played int, goals int, assists int,
  points int, field_goals int, three_pointers int, free_throws int, runs int, plate_appearances int,
  at_bats int, hits int, doubles int, triples int, home_runs int, rbi int, walks int, strikeouts int,
  seconds_played int
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
           sum(greatest(0, coalesce(st.clock_end, case when g.clock_period = st.period_index then public.clock_elapsed(g.clock_seconds, g.clock_running_since, g.clock_limit) else st.clock_start end) - st.clock_start))::int as secs
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
         coalesce(b.home_runs, 0), coalesce(b.rbi, 0), coalesce(b.walks, 0), coalesce(b.strikeouts, 0),
         coalesce(tm.secs, 0)
  from ids i
  left join public.players p on p.id = i.id
  left join snap sn on sn.player_id = i.id
  left join played pl on pl.player_id = i.id
  left join timed tm on tm.player_id = i.id
  left join scored sc on sc.player_id = i.id
  left join assisted a on a.player_id = i.id
  left join batting b on b.player_id = i.id
  where public.is_active_member(p_team_id)
    and (public.sees_all_stats(p_team_id) or public.is_linked_to(i.id));
$$;

create or replace function public.season_minutes(p_team_id uuid, p_season_id uuid default null)
returns table (player_id uuid, seconds int, by_group jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with scope as (
    select g.id from public.games g
    where g.team_id = p_team_id and g.status <> 'upcoming'
      and g.season_id = coalesce(p_season_id, (select s.id from public.seasons s where s.team_id = p_team_id and s.is_current limit 1))
  ),
  per as (
    select st.player_id, st.position_role,
           sum(greatest(0, coalesce(st.clock_end, case when g.clock_period = st.period_index then public.clock_elapsed(g.clock_seconds, g.clock_running_since, g.clock_limit) else st.clock_start end) - st.clock_start))::int as secs
    from public.stints st join public.games g on g.id = st.game_id
    where st.game_id in (select id from scope)
    group by st.player_id, st.position_role
  )
  select per.player_id, sum(per.secs)::int, jsonb_object_agg(per.position_role, per.secs)
  from per
  where public.is_staff(p_team_id)
  group by per.player_id;
$$;
