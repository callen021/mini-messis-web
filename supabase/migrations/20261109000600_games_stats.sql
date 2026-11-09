-- Phase 5: games for every sport, stats, batting order.

-- ---------- batting order (baseball) ----------
-- Replace the whole order in one call: position i gets batting_order = i. Players not listed keep null
-- and sort to the bottom. Staff only.
create or replace function public.set_batting_order(p_team_id uuid, p_player_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff(p_team_id) then
    raise exception 'only a coach or assistant can change the batting order' using errcode = '42501';
  end if;
  update public.players p
  set batting_order = o.ord, updated_by = (select auth.uid())
  from unnest(p_player_ids) with ordinality as o(id, ord)
  where p.id = o.id and p.team_id = p_team_id;
end;
$$;
revoke all on function public.set_batting_order(uuid, uuid[]) from public;
grant execute on function public.set_batting_order(uuid, uuid[]) to authenticated, service_role;

-- ---------- season / game stats ----------
-- One row per player who is on the roster or appears in the selected games' history.
-- Scope: a single game (p_game_id), else every live/done game of the season (p_season_id, default current).
-- Runs as the caller: RLS on games / lineups / score_events / plate_appearances decides what is counted.
create or replace function public.player_season_stats(
  p_team_id uuid,
  p_season_id uuid default null,
  p_game_id uuid default null
)
returns table (
  player_id uuid,
  name text,
  number text,
  removed boolean,
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
    select s.player_id, count(distinct l.id)::int as n
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
    -- latest snapshot name for players no longer on the roster
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

-- Coach notes are edited in place; keep updated_by current.
create or replace function public.coach_notes_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := (select auth.uid());
  return new;
end;
$$;
drop trigger if exists game_coach_notes_stamp on public.game_coach_notes;
create trigger game_coach_notes_stamp before insert or update on public.game_coach_notes
  for each row execute function public.coach_notes_stamp();
