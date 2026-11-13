-- Parent RSVP (D107): one reply per player per game or practice — going, out ("can't make it")
-- or none ("no reply", the default). No reply counts as available. Only "out" takes a player out
-- of that game's lineup, and only for that game: the coach's own flag (players.is_available,
-- set_player_available) stays team-wide and untouched. Writes go through set_rsvp only:
--   · staff may set any player's reply at any time;
--   · a parent may set a reply for a player linked to them (any link when the team does not
--     require approval, an approved link when it does), only while the game is upcoming or,
--     for a practice, until it has started in the team's timezone;
--   · the row records who made the last change (parent or coach) and when; last write wins;
--   · a coach setting "going" also lifts their own team-wide out flag for that player.
-- Lineups are never edited by a reply: a player already placed stays placed and the Field shows
-- the flag. Start game opens that player's spot exactly as it does for the coach's flag, and the
-- game_players snapshot records them unavailable.

create type public.rsvp_status as enum ('going', 'out', 'none');
create type public.rsvp_setter as enum ('parent', 'coach');

create table public.event_rsvps (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  game_id      uuid references public.games(id) on delete cascade,
  practice_id  uuid references public.practices(id) on delete cascade,
  player_id    uuid not null references public.players(id) on delete cascade,
  status       public.rsvp_status not null,
  set_by_role  public.rsvp_setter not null,
  set_by       uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint event_rsvps_one_event check ((game_id is null) <> (practice_id is null))
);
create unique index event_rsvps_game_player_idx on public.event_rsvps(game_id, player_id) where game_id is not null;
create unique index event_rsvps_practice_player_idx on public.event_rsvps(practice_id, player_id) where practice_id is not null;
create index event_rsvps_team_idx on public.event_rsvps(team_id);

alter table public.event_rsvps enable row level security;
-- every active member reads the team's replies (the schedule marks and counts); nobody writes
-- rows directly — set_rsvp is the only path
create policy event_rsvps_select_member on public.event_rsvps for select to authenticated
  using (public.is_active_member(team_id));

alter publication supabase_realtime add table public.event_rsvps;
alter table public.event_rsvps replica identity full;

-- ---------- who may reply for a player ----------
-- Staff always. A parent: a linked player; with approval required the link must be approved.
create or replace function public.can_rsvp_for(p_player_id uuid)
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
    when (select t.require_approval from public.teams t where t.id = public.team_of_player(p_player_id))
      then public.is_guardian_of(p_player_id)
    else public.is_linked_to(p_player_id)
  end;
$$;
revoke all on function public.can_rsvp_for(uuid) from public;
grant execute on function public.can_rsvp_for(uuid) to authenticated, service_role;

-- ---------- a player's reply says out for this game ----------
create or replace function public.rsvp_out_for_game(p_game_id uuid, p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.event_rsvps r
    where r.game_id = p_game_id and r.player_id = p_player_id and r.status = 'out'
  );
$$;
revoke all on function public.rsvp_out_for_game(uuid, uuid) from public;

-- ---------- set a reply ----------
create or replace function public.set_rsvp(
  p_player_id uuid,
  p_status public.rsvp_status,
  p_game_id uuid default null,
  p_practice_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid := public.team_of_player(p_player_id);
  v_event_team uuid;
  v_staff boolean;
  v_g public.games%rowtype;
  v_p public.practices%rowtype;
  v_tz text;
begin
  if v_team is null or not public.can_rsvp_for(p_player_id) then
    raise exception 'you can only reply for your own player' using errcode = '42501';
  end if;
  if (p_game_id is null) = (p_practice_id is null) then
    raise exception 'a reply is for one game or one practice' using errcode = '22023';
  end if;
  if exists (select 1 from public.players p where p.id = p_player_id and p.archived_at is not null) then
    raise exception 'that player is no longer on the roster' using errcode = '22023';
  end if;
  v_staff := public.is_staff(v_team);
  select t.timezone into v_tz from public.teams t where t.id = v_team;

  if p_game_id is not null then
    select * into v_g from public.games g where g.id = p_game_id;
    v_event_team := v_g.team_id;
    -- parents reply until the game is started; coaches at any time
    if not v_staff and v_g.status is distinct from 'upcoming' then
      raise exception 'replies closed: the game has started' using errcode = 'P0005';
    end if;
  else
    select * into v_p from public.practices pr where pr.id = p_practice_id;
    v_event_team := v_p.team_id;
    if not v_staff and v_p.status = 'cancelled' then
      raise exception 'that practice is cancelled' using errcode = 'P0005';
    end if;
    if not v_staff
       and (v_p.practice_date + coalesce(v_p.start_time, time '23:59:59')) <= (now() at time zone coalesce(v_tz, 'UTC')) then
      raise exception 'replies closed: the practice has started' using errcode = 'P0005';
    end if;
  end if;
  if v_event_team is null or v_event_team <> v_team then
    raise exception 'that event belongs to another team' using errcode = '22023';
  end if;

  if p_game_id is not null then
    insert into public.event_rsvps (team_id, game_id, player_id, status, set_by_role, set_by, updated_at)
    values (v_team, p_game_id, p_player_id, p_status,
            (case when v_staff then 'coach' else 'parent' end)::public.rsvp_setter, (select auth.uid()), now())
    on conflict (game_id, player_id) where game_id is not null do update
      set status = excluded.status, set_by_role = excluded.set_by_role, set_by = excluded.set_by, updated_at = now();
  else
    insert into public.event_rsvps (team_id, practice_id, player_id, status, set_by_role, set_by, updated_at)
    values (v_team, p_practice_id, p_player_id, p_status,
            (case when v_staff then 'coach' else 'parent' end)::public.rsvp_setter, (select auth.uid()), now())
    on conflict (practice_id, player_id) where practice_id is not null do update
      set status = excluded.status, set_by_role = excluded.set_by_role, set_by = excluded.set_by, updated_at = now();
  end if;

  -- a coach saying "going" overrides their own team-wide out flag too
  if v_staff and p_status = 'going'
     and exists (select 1 from public.players p where p.id = p_player_id and not p.is_available) then
    perform public.set_player_available(p_player_id, true);
  end if;
end;
$$;
revoke all on function public.set_rsvp(uuid, public.rsvp_status, uuid, uuid) from public;
grant execute on function public.set_rsvp(uuid, public.rsvp_status, uuid, uuid) to authenticated, service_role;

-- ---------- the snapshot and the start-of-game copy honour the reply ----------
create or replace function public.snapshot_game_players(p_game_id uuid, p_team_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.game_players (game_id, player_id, name_snapshot, number_snapshot, available)
  select p_game_id, p.id, trim(p.first_name || ' ' || coalesce(p.last_name, '')), p.jersey_number,
         p.is_available and not public.rsvp_out_for_game(p_game_id, p.id)
  from public.players p
  where p.team_id = p_team_id and p.archived_at is null
  on conflict (game_id, player_id) do update
    set name_snapshot = excluded.name_snapshot, number_snapshot = excluded.number_snapshot, available = excluded.available;
$$;

-- copying into a game (start) drops players whose reply says out for that game; copying back to
-- the template (finish) passes a null game, so a reply never follows a player past the game
create or replace function public.copy_lineups(p_team_id uuid, p_from_game uuid, p_to_game uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_new uuid;
begin
  delete from public.lineups where team_id = p_team_id and game_id is not distinct from p_to_game;
  for r in select * from public.lineups l where l.team_id = p_team_id and l.game_id is not distinct from p_from_game order by l.period_index loop
    insert into public.lineups (team_id, game_id, period_index, formation_name, bench_order)
    values (p_team_id, p_to_game, r.period_index, r.formation_name, r.bench_order)
    returning id into v_new;
    insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code, player_id, auto_picked)
    select v_new, s.slot_index, s.position_role, s.position_code,
           case when p.id is not null and p.archived_at is null and p.is_available
                     and (p_to_game is null or not public.rsvp_out_for_game(p_to_game, p.id)) then s.player_id end,
           s.auto_picked and p.id is not null and p.archived_at is null and p.is_available
             and (p_to_game is null or not public.rsvp_out_for_game(p_to_game, p.id))
    from public.lineup_slots s
    left join public.players p on p.id = s.player_id
    where s.lineup_id = r.id;
    perform public.bench_normalize(v_new);
  end loop;
end;
$$;

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
  select t.name, t.time_mode into v_team_name, v_mode from public.teams t where t.id = v_g.team_id;
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
    set clock_period = 0, clock_seconds = 0, clock_running_since = null, clock_period_lengths = '{}'
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
  update public.games set status = 'live', started_at = now(), team_name_snapshot = v_team_name where id = p_game_id;
end;
$$;
