-- Stats visibility (round 2, D56). teams.parent_stats decides what a parent sees of OTHER
-- children's individual stats: 'own' (default) hides them, 'team' shows everything. Enforced here,
-- not in the UI: parents read score events, plate appearances and per-player stats only through
-- the functions below, which withhold other players' ids; the tables themselves are closed to
-- parents while the setting is 'own'. Team totals and scores stay visible to every member.

create type public.parent_stats as enum ('own', 'team');
alter table public.teams add column if not exists parent_stats public.parent_stats not null default 'own';

-- Can the caller see this player's individual stats? Staff always; parents when the team shares
-- everything, or for their own approved children.
create or replace function public.can_see_player_stats(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_player_id is null then false
    when public.is_staff(public.team_of_player(p_player_id)) then true
    when not public.is_active_member(public.team_of_player(p_player_id)) then false
    when (select t.parent_stats from public.teams t where t.id = public.team_of_player(p_player_id)) = 'team' then true
    else public.is_guardian_of(p_player_id)
  end;
$$;

-- Everyone's stats are visible on this team to the caller (staff, or a parent on a 'team' team).
create or replace function public.sees_all_stats(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_staff(p_team_id)
      or (public.is_active_member(p_team_id)
          and (select t.parent_stats from public.teams t where t.id = p_team_id) = 'team');
$$;
revoke all on function public.can_see_player_stats(uuid) from public;
revoke all on function public.sees_all_stats(uuid) from public;
grant execute on function public.can_see_player_stats(uuid), public.sees_all_stats(uuid) to authenticated, service_role;

-- ---------- the tables close to parents on an 'own' team ----------
drop policy if exists score_events_select_member on public.score_events;
create policy score_events_select_staff_or_shared on public.score_events for select to authenticated
  using (public.sees_all_stats(public.team_of_game(game_id)));
drop policy if exists plate_appearances_select_member on public.plate_appearances;
create policy plate_appearances_select_staff_or_shared on public.plate_appearances for select to authenticated
  using (public.sees_all_stats(public.team_of_game(game_id)));

-- ---------- what parents read instead ----------
-- The game's log with other children's ids withheld. `hidden` tells the UI "a player scored, but
-- not one you may see" (as opposed to "the coach did not record who").
create or replace function public.game_events(p_game_id uuid)
returns table (
  id uuid, game_id uuid, side public.score_side, period_index int, event_type text, points smallint,
  scorer_player_id uuid, assist_player_id uuid, occurred_at timestamptz, created_by uuid,
  created_at timestamptz, updated_at timestamptz, updated_by uuid, hidden boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.game_id, e.side, e.period_index, e.event_type, e.points,
         case when public.can_see_player_stats(e.scorer_player_id) then e.scorer_player_id end,
         case when public.can_see_player_stats(e.assist_player_id) then e.assist_player_id end,
         e.occurred_at, e.created_by, e.created_at, e.updated_at, e.updated_by,
         (e.scorer_player_id is not null and not public.can_see_player_stats(e.scorer_player_id))
  from public.score_events e
  where e.game_id = p_game_id
    and public.is_active_member(public.team_of_game(p_game_id))
  order by e.occurred_at, e.created_at;
$$;

create or replace function public.game_plate_appearances(p_game_id uuid)
returns table (
  id uuid, game_id uuid, player_id uuid, inning int, sequence int, result public.pa_result, rbi smallint,
  occurred_at timestamptz, created_by uuid, created_at timestamptz, updated_at timestamptz, updated_by uuid,
  hidden boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select pa.id, pa.game_id,
         case when public.can_see_player_stats(pa.player_id) then pa.player_id end,
         pa.inning, pa.sequence, pa.result, pa.rbi, pa.occurred_at, pa.created_by, pa.created_at,
         pa.updated_at, pa.updated_by,
         not public.can_see_player_stats(pa.player_id)
  from public.plate_appearances pa
  where pa.game_id = p_game_id
    and public.is_active_member(public.team_of_game(p_game_id))
  order by pa.sequence, pa.occurred_at;
$$;

-- Scores for a set of games (replaces reading the game_scores view, which parents can no longer sum).
create or replace function public.game_scores_for(p_game_ids uuid[])
returns table (game_id uuid, us int, them int)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id,
         coalesce(sum(e.points) filter (where e.side = 'us'), 0)::int,
         coalesce(sum(e.points) filter (where e.side = 'them'), 0)::int
  from public.games g
  left join public.score_events e on e.game_id = g.id
  where g.id = any (p_game_ids) and public.is_active_member(g.team_id)
  group by g.id;
$$;

revoke all on function public.game_events(uuid) from public;
revoke all on function public.game_plate_appearances(uuid) from public;
revoke all on function public.game_scores_for(uuid[]) from public;
grant execute on function public.game_events(uuid), public.game_plate_appearances(uuid), public.game_scores_for(uuid[])
  to authenticated, service_role;

-- ---------- per-player stats: only the players the caller may see ----------
-- Same body as 0600, definer (so it can read the log on a parent's behalf) with a visibility filter.
drop function if exists public.player_season_stats(uuid, uuid, uuid);
create function public.player_season_stats(
  p_team_id uuid,
  p_season_id uuid default null,
  p_game_id uuid default null
)
returns table (
  player_id uuid, name text, number text, removed boolean, games_played int, periods_played int, goals int, assists int,
  points int, field_goals int, three_pointers int, free_throws int, runs int, plate_appearances int,
  at_bats int, hits int, doubles int, triples int, home_runs int, rbi int, walks int, strikeouts int
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
  where public.is_active_member(p_team_id)
    and (public.sees_all_stats(p_team_id) or public.is_guardian_of(i.id));
$$;
revoke all on function public.player_season_stats(uuid, uuid, uuid) from public;
grant execute on function public.player_season_stats(uuid, uuid, uuid) to authenticated, service_role;

-- ---------- realtime for parents who can no longer read the log ----------
-- A change to the log touches the game row, so a subscription on `games` (which every member can
-- read) still refreshes scores live.
create or replace function public.touch_game_on_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.games set updated_at = now() where id = coalesce(new.game_id, old.game_id);
  return coalesce(new, old);
end;
$$;
drop trigger if exists score_events_touch_game on public.score_events;
create trigger score_events_touch_game after insert or update or delete on public.score_events
  for each row execute function public.touch_game_on_event();
drop trigger if exists plate_appearances_touch_game on public.plate_appearances;
create trigger plate_appearances_touch_game after insert or update or delete on public.plate_appearances
  for each row execute function public.touch_game_on_event();
