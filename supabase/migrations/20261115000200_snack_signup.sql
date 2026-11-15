-- Snack signup (D115). A team setting (off | games | games and practices, default off) and one
-- family per eligible event, stored on the event as the player whose family brings the snacks
-- ("Nolan's family": either parent sees and changes it). A family may hold at most
-- ceil(eligible events this season / active players) slots; coaches and assistants assign, clear
-- or override any slot regardless of the cap. Writes go through set_snack / clear_snack only.
-- When the snack family's reply turns to "can't make it" the event is flagged for the coaches;
-- the flag drops when the reply changes back or the slot changes hands.

create type public.snack_mode as enum ('off', 'games', 'both');
alter table public.teams add column snack_signup public.snack_mode not null default 'off';

alter table public.games
  add column snack_player_id uuid references public.players(id) on delete set null,
  add column snack_flagged boolean not null default false;
alter table public.practices
  add column snack_player_id uuid references public.players(id) on delete set null,
  add column snack_flagged boolean not null default false;

-- ---------- which events take a snack family ----------
create or replace function public.snack_wanted(p_team_id uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case t.snack_signup
    when 'games' then p_kind = 'game'
    when 'both' then p_kind in ('game', 'practice')
    else false
  end
  from public.teams t where t.id = p_team_id;
$$;
revoke all on function public.snack_wanted(uuid, text) from public;
grant execute on function public.snack_wanted(uuid, text) to authenticated, service_role;

-- ---------- the per-family cap: eligible events this season / active players, rounded up ----------
create or replace function public.snack_cap(p_team_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_season uuid;
  v_events int := 0;
  v_players int;
begin
  if not public.is_active_member(p_team_id) then
    return null;
  end if;
  select s.id into v_season from public.seasons s where s.team_id = p_team_id and s.is_current limit 1;
  if public.snack_wanted(p_team_id, 'game') then
    v_events := v_events + (select count(*) from public.games g where g.team_id = p_team_id and g.season_id = v_season);
  end if;
  if public.snack_wanted(p_team_id, 'practice') then
    v_events := v_events + (select count(*) from public.practices p where p.team_id = p_team_id and p.season_id = v_season and p.status <> 'cancelled');
  end if;
  select count(*) into v_players from public.players p where p.team_id = p_team_id and p.archived_at is null and p.is_available;
  return ceil(v_events::numeric / greatest(v_players, 1))::int;
end;
$$;
revoke all on function public.snack_cap(uuid) from public;
grant execute on function public.snack_cap(uuid) to authenticated, service_role;

-- how many slots one family holds this season
create or replace function public.snack_claims(p_player_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select se.id from public.seasons se
    where se.team_id = public.team_of_player(p_player_id) and se.is_current limit 1
  )
  select (select count(*) from public.games g, s where g.snack_player_id = p_player_id and g.season_id = s.id)::int
       + (select count(*) from public.practices p, s where p.snack_player_id = p_player_id and p.season_id = s.id and p.status <> 'cancelled')::int;
$$;
revoke all on function public.snack_claims(uuid) from public;
grant execute on function public.snack_claims(uuid) to authenticated, service_role;

-- ---------- claim or assign a slot ----------
create or replace function public.set_snack(p_player_id uuid, p_game_id uuid default null, p_practice_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid := public.team_of_player(p_player_id);
  v_staff boolean;
  v_kind text := case when p_game_id is not null then 'game' else 'practice' end;
  v_event_team uuid;
  v_holder uuid;
  v_open boolean;
  v_tz text;
begin
  if (p_game_id is null) = (p_practice_id is null) then
    raise exception 'a snack slot is for one game or one practice' using errcode = '22023';
  end if;
  if v_team is null then
    raise exception 'player not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.players p where p.id = p_player_id and p.archived_at is not null) then
    raise exception 'that player is no longer on the roster' using errcode = '22023';
  end if;
  v_staff := public.is_staff(v_team);
  if not v_staff and not public.can_rsvp_for(p_player_id) then
    raise exception 'you can only sign up your own family' using errcode = '42501';
  end if;
  select t.timezone into v_tz from public.teams t where t.id = v_team;

  if p_game_id is not null then
    select g.team_id, g.snack_player_id, g.status = 'upcoming' into v_event_team, v_holder, v_open
    from public.games g where g.id = p_game_id;
  else
    select p.team_id, p.snack_player_id,
           p.status <> 'cancelled' and (p.practice_date + coalesce(p.start_time, time '23:59:59')) > (now() at time zone coalesce(v_tz, 'UTC'))
    into v_event_team, v_holder, v_open
    from public.practices p where p.id = p_practice_id;
  end if;
  if v_event_team is null or v_event_team <> v_team then
    raise exception 'that event belongs to another team' using errcode = '22023';
  end if;

  if not v_staff then
    if not public.snack_wanted(v_team, v_kind) then
      raise exception 'snack signup is off for this kind of event' using errcode = 'P0017';
    end if;
    if not v_open then
      raise exception 'that event is over' using errcode = 'P0005';
    end if;
    -- a parent takes an open slot, or moves one between their own children
    if v_holder is not null and v_holder <> p_player_id and not public.can_rsvp_for(v_holder) then
      raise exception 'another family already has this one' using errcode = 'P0018';
    end if;
    if v_holder is distinct from p_player_id and public.snack_claims(p_player_id) >= public.snack_cap(v_team) then
      raise exception 'your family already has its share of snack days this season' using errcode = 'P0019';
    end if;
  end if;

  if p_game_id is not null then
    update public.games set snack_player_id = p_player_id, snack_flagged = public.rsvp_out_for_game(p_game_id, p_player_id)
    where id = p_game_id;
  else
    update public.practices set snack_player_id = p_player_id,
      snack_flagged = exists (select 1 from public.event_rsvps r where r.practice_id = p_practice_id and r.player_id = p_player_id and r.status = 'out')
    where id = p_practice_id;
  end if;
end;
$$;
revoke all on function public.set_snack(uuid, uuid, uuid) from public;
grant execute on function public.set_snack(uuid, uuid, uuid) to authenticated, service_role;

-- ---------- release a slot ----------
create or replace function public.clear_snack(p_game_id uuid default null, p_practice_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
  v_holder uuid;
begin
  if (p_game_id is null) = (p_practice_id is null) then
    raise exception 'a snack slot is for one game or one practice' using errcode = '22023';
  end if;
  if p_game_id is not null then
    select g.team_id, g.snack_player_id into v_team, v_holder from public.games g where g.id = p_game_id;
  else
    select p.team_id, p.snack_player_id into v_team, v_holder from public.practices p where p.id = p_practice_id;
  end if;
  if v_team is null then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  if v_holder is null then
    return;
  end if;
  if not public.is_staff(v_team) and not public.can_rsvp_for(v_holder) then
    raise exception 'only the snack family or a coach can release this one' using errcode = '42501';
  end if;
  if p_game_id is not null then
    update public.games set snack_player_id = null, snack_flagged = false where id = p_game_id;
  else
    update public.practices set snack_player_id = null, snack_flagged = false where id = p_practice_id;
  end if;
end;
$$;
revoke all on function public.clear_snack(uuid, uuid) from public;
grant execute on function public.clear_snack(uuid, uuid) to authenticated, service_role;

-- ---------- the snack family saying "can't make it" flags the event for the coaches ----------
create or replace function public.snack_flag_on_rsvp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.game_id is not null then
    update public.games set snack_flagged = (new.status = 'out')
    where id = new.game_id and snack_player_id = new.player_id and snack_flagged is distinct from (new.status = 'out');
  else
    update public.practices set snack_flagged = (new.status = 'out')
    where id = new.practice_id and snack_player_id = new.player_id and snack_flagged is distinct from (new.status = 'out');
  end if;
  return new;
end;
$$;
create trigger event_rsvps_snack_flag after insert or update on public.event_rsvps
  for each row execute function public.snack_flag_on_rsvp();
