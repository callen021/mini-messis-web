-- Basketball stats (D118). Optional stat entries next to the score log: rebound, assist, steal,
-- foul, each tied to a player and a period, logged with the same tap-then-jersey pattern as the
-- points. The team chooses which are tracked (`teams.tracked_stats`, all off by default); entries
-- are editable and removable like scores. A coach may make any member a stat keeper
-- (`team_members.is_stat_keeper`): they log scores and stats while a game is live and nothing else.

create type public.stat_type as enum ('rebound', 'assist', 'steal', 'foul');

alter table public.teams add column tracked_stats public.stat_type[] not null default '{}';
alter table public.team_members add column is_stat_keeper boolean not null default false;

create table public.stat_events (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references public.games(id) on delete cascade,
  player_id     uuid not null references public.players(id) on delete cascade,
  period_index  int not null default 0 check (period_index >= 0),
  stat_type     public.stat_type not null,
  -- clock mode: the second of the period the entry was logged at (stamped by the server when absent)
  clock_seconds int check (clock_seconds is null or clock_seconds >= 0),
  occurred_at   timestamptz not null default now(),
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id)
);
create index stat_events_game_idx on public.stat_events(game_id, period_index, occurred_at);
create trigger stat_events_updated_at before update on public.stat_events
  for each row execute function public.set_updated_at();

-- ---------- who may log: staff, or a stat keeper while the game is live ----------
create or replace function public.is_stat_keeper(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = p_team_id and m.user_id = (select auth.uid()) and m.status = 'active' and m.is_stat_keeper
  );
$$;
revoke all on function public.is_stat_keeper(uuid) from public;
grant execute on function public.is_stat_keeper(uuid) to authenticated, service_role;

create or replace function public.can_log_stats(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_staff(public.team_of_game(p_game_id))
      or (public.is_stat_keeper(public.team_of_game(p_game_id))
          and exists (select 1 from public.games g where g.id = p_game_id and g.status = 'live'));
$$;
revoke all on function public.can_log_stats(uuid) from public;
grant execute on function public.can_log_stats(uuid) to authenticated, service_role;

-- A coach makes any active member a stat keeper, or takes it back.
create or replace function public.set_stat_keeper(p_member_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.team_members%rowtype;
begin
  select * into v_m from public.team_members m where m.id = p_member_id;
  if not found or not public.is_coach(v_m.team_id) then
    raise exception 'only a coach can name a stat keeper' using errcode = '42501';
  end if;
  if v_m.status <> 'active' then
    raise exception 'the member must be active' using errcode = '23514';
  end if;
  update public.team_members set is_stat_keeper = p_on where id = p_member_id;
end;
$$;
revoke all on function public.set_stat_keeper(uuid, boolean) from public;
grant execute on function public.set_stat_keeper(uuid, boolean) to authenticated, service_role;

-- ---------- validation: basketball only, a player of the game's team, a tracked stat ----------
create or replace function public.stat_events_validate()
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
  if v_sport is null then
    raise exception 'game not found' using errcode = '23503';
  end if;
  if v_sport <> 'basketball' then
    raise exception 'stats are only recorded for basketball' using errcode = '23514';
  end if;
  if public.team_of_player(new.player_id) is distinct from v_team then
    raise exception 'player is not on this team' using errcode = '23503';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
  else
    new.updated_by := (select auth.uid());
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
create trigger stat_events_validate before insert or update on public.stat_events
  for each row execute function public.stat_events_validate();

-- the same clock stamp as a score (D74, D105): the period and second of a live clock game
create or replace function public.stat_events_clock_stamp()
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
create trigger stat_events_clock_stamp before insert on public.stat_events
  for each row execute function public.stat_events_clock_stamp();

-- a change to the stats touches the game row, so parents' subscriptions on `games` refresh (D56)
create trigger stat_events_touch_game after insert or update or delete on public.stat_events
  for each row execute function public.touch_game_on_event();

-- ---------- RLS ----------
alter table public.stat_events enable row level security;
-- reading: like the score log (staff, or a parent on a 'team' team), plus whoever may log right now
create policy stat_events_select on public.stat_events for select to authenticated
  using (public.sees_all_stats(public.team_of_game(game_id)) or public.can_log_stats(game_id));
create policy stat_events_write on public.stat_events for all to authenticated
  using (public.can_log_stats(game_id))
  with check (public.can_log_stats(game_id));

-- scores: a stat keeper logs them during a live game too
drop policy if exists score_events_write_staff on public.score_events;
create policy score_events_write on public.score_events for all to authenticated
  using (public.can_log_stats(game_id))
  with check (public.can_log_stats(game_id));
drop policy if exists score_events_select_staff_or_shared on public.score_events;
create policy score_events_select on public.score_events for select to authenticated
  using (public.sees_all_stats(public.team_of_game(game_id)) or public.can_log_stats(game_id));

alter publication supabase_realtime add table public.stat_events;
alter table public.stat_events replica identity full;

-- ---------- what parents read: the game's stats with other children's ids withheld ----------
create function public.game_stats(p_game_id uuid)
returns table (
  id uuid, game_id uuid, player_id uuid, period_index int, stat_type public.stat_type, clock_seconds int,
  occurred_at timestamptz, created_by uuid, created_at timestamptz, updated_at timestamptz, updated_by uuid,
  hidden boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.game_id,
         case when public.can_see_player_stats(e.player_id) or public.can_log_stats(p_game_id) then e.player_id end,
         e.period_index, e.stat_type, e.clock_seconds,
         e.occurred_at, e.created_by, e.created_at, e.updated_at, e.updated_by,
         not (public.can_see_player_stats(e.player_id) or public.can_log_stats(p_game_id))
  from public.stat_events e
  where e.game_id = p_game_id
    and public.is_active_member(public.team_of_game(p_game_id))
  order by e.occurred_at, e.created_at;
$$;
revoke all on function public.game_stats(uuid) from public;
grant execute on function public.game_stats(uuid) to authenticated, service_role;

-- ---------- the members list carries the flag ----------
drop function if exists public.list_team_members(uuid);
create function public.list_team_members(p_team_id uuid)
returns table (
  member_id uuid, user_id uuid, role public.member_role, status public.member_status,
  requested_role public.member_role, display_name text, email text, is_owner boolean,
  created_at timestamptz, approved_at timestamptz, joined_at timestamptz, children jsonb, unlisted jsonb,
  is_stat_keeper boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.user_id, m.role, m.status, m.requested_role,
         coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)),
         u.email::text,
         t.owner_id = m.user_id,
         m.created_at, m.approved_at,
         case when m.status = 'active' then coalesce(m.approved_at, m.created_at) end,
         coalesce((
           select jsonb_agg(jsonb_build_object('link_id', g.id, 'player_id', g.player_id, 'first_name', pl.first_name,
                                               'jersey_number', pl.jersey_number, 'status', g.status) order by pl.sort_order, pl.first_name)
           from public.player_guardians g join public.players pl on pl.id = g.player_id
           where g.user_id = m.user_id and pl.team_id = m.team_id and pl.archived_at is null
         ), '[]'::jsonb),
         coalesce((select jsonb_agg(r.child_name order by r.created_at) from public.unlisted_child_requests r where r.member_id = m.id), '[]'::jsonb),
         m.is_stat_keeper
  from public.team_members m
  join public.teams t on t.id = m.team_id
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.team_id = p_team_id
    and m.status <> 'removed'
    and public.is_staff(p_team_id)
  order by (m.status = 'pending') desc, m.role, m.created_at;
$$;
revoke all on function public.list_team_members(uuid) from public;
grant execute on function public.list_team_members(uuid) to authenticated, service_role;

-- ---------- the stats: rebounds, assists (scores + entries), steals, fouls ----------
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
  seconds_played int, rebounds int, steals int, fouls int
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
         coalesce(tm.secs, 0), coalesce(ta.rebounds, 0), coalesce(ta.steals, 0), coalesce(ta.fouls, 0)
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
