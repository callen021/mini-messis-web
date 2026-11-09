-- Membership helpers used by RLS policies. SECURITY DEFINER so policies on team_members can be
-- evaluated without recursing into team_members' own policies.

create or replace function public.member_role_on(p_team_id uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.team_members m
  where m.team_id = p_team_id
    and m.user_id = (select auth.uid())
    and m.status = 'active'
  limit 1;
$$;

create or replace function public.is_active_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.member_role_on(p_team_id) is not null;
$$;

create or replace function public.is_staff(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.member_role_on(p_team_id) in ('coach', 'assistant');
$$;

create or replace function public.is_coach(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.member_role_on(p_team_id) = 'coach';
$$;

create or replace function public.is_owner(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.teams t where t.id = p_team_id and t.owner_id = (select auth.uid())
  );
$$;

create or replace function public.team_of_game(p_game_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.team_id from public.games g where g.id = p_game_id;
$$;

create or replace function public.team_of_player(p_player_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.team_id from public.players p where p.id = p_player_id;
$$;

create or replace function public.team_of_lineup(p_lineup_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.team_id from public.lineups l where l.id = p_lineup_id;
$$;

create or replace function public.team_of_skill_test(p_test_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.team_id from public.skill_tests s where s.id = p_test_id;
$$;

-- An approved guardian link between the current user and a player.
create or replace function public.is_guardian_of(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.player_guardians g
    where g.player_id = p_player_id
      and g.user_id = (select auth.uid())
      and g.status = 'approved'
  );
$$;

-- Email must be verified before a user can own or be approved onto a team.
create or replace function public.email_confirmed(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users u where u.id = p_user_id and u.email_confirmed_at is not null);
$$;

revoke all on function public.member_role_on(uuid) from public;
revoke all on function public.is_active_member(uuid) from public;
revoke all on function public.is_staff(uuid) from public;
revoke all on function public.is_coach(uuid) from public;
revoke all on function public.is_owner(uuid) from public;
revoke all on function public.team_of_game(uuid) from public;
revoke all on function public.team_of_player(uuid) from public;
revoke all on function public.team_of_lineup(uuid) from public;
revoke all on function public.team_of_skill_test(uuid) from public;
revoke all on function public.is_guardian_of(uuid) from public;
revoke all on function public.email_confirmed(uuid) from public;
grant execute on function public.member_role_on(uuid), public.is_active_member(uuid), public.is_staff(uuid),
  public.is_coach(uuid), public.is_owner(uuid), public.team_of_game(uuid), public.team_of_player(uuid),
  public.team_of_lineup(uuid), public.team_of_skill_test(uuid), public.is_guardian_of(uuid),
  public.email_confirmed(uuid) to authenticated, service_role;

-- ---------- profile auto-create ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- teams: guard sensitive columns on direct updates ----------
-- owner_id changes only through transfer_ownership(); name/sport only by a coach; archive only by owner.
create or replace function public.teams_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if new.owner_id is distinct from old.owner_id
     and coalesce(current_setting('app.allow_owner_change', true), '') <> 'on' then
    raise exception 'owner_id can only be changed with transfer_ownership()' using errcode = '42501';
  end if;
  -- service role / postgres (no JWT) may do anything else
  if v_uid is null then
    return new;
  end if;
  if (new.name is distinct from old.name or new.sport is distinct from old.sport)
     and not public.is_coach(old.id) then
    raise exception 'only a coach can rename the team or change its sport' using errcode = '42501';
  end if;
  if new.archived_at is distinct from old.archived_at and not public.is_owner(old.id) then
    raise exception 'only the owner can archive the team' using errcode = '42501';
  end if;
  new.updated_by = v_uid;
  return new;
end;
$$;

create trigger teams_guard_update before update on public.teams
  for each row execute function public.teams_guard_update();

-- ---------- team_members: a team must keep at least one active coach ----------
create or replace function public.team_members_keep_a_coach()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was_active_coach boolean := old.status = 'active' and old.role = 'coach';
  v_still_active_coach boolean := tg_op = 'UPDATE' and new.status = 'active' and new.role = 'coach';
begin
  if v_was_active_coach and not v_still_active_coach then
    -- allow when the whole team is going away (cascade from teams delete)
    if exists (select 1 from public.teams t where t.id = old.team_id)
       and not exists (
         select 1 from public.team_members m
         where m.team_id = old.team_id and m.id <> old.id and m.status = 'active' and m.role = 'coach'
       ) then
      raise exception 'a team must keep at least one active coach' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger team_members_keep_a_coach before update or delete on public.team_members
  for each row execute function public.team_members_keep_a_coach();

-- ---------- score_events: points are derived from the sport's event types ----------
create or replace function public.score_event_points(p_sport public.sport, p_event_type text)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case p_sport
    when 'soccer' then case p_event_type when 'goal' then 1 end
    when 'lacrosse' then case p_event_type when 'goal' then 1 end
    when 'basketball' then case p_event_type when 'free_throw' then 1 when 'field_goal' then 2 when 'three_pointer' then 3 end
    when 'baseball' then case p_event_type when 'run' then 1 end
    when 'football' then case p_event_type when 'touchdown' then 6 when 'field_goal' then 3 when 'extra_point' then 1 when 'two_point' then 2 when 'safety' then 2 end
  end::smallint;
$$;

create or replace function public.score_events_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sport text;
  v_team uuid;
  v_points smallint;
begin
  select t.sport::text, t.id into v_sport, v_team
  from public.games g join public.teams t on t.id = g.team_id
  where g.id = new.game_id;
  if v_sport is null then
    raise exception 'game not found' using errcode = '23503';
  end if;
  v_points := public.score_event_points(v_sport::public.sport, new.event_type);
  if v_points is null then
    raise exception 'event type % is not valid for %', new.event_type, v_sport using errcode = '23514';
  end if;
  new.points := v_points;
  if new.side = 'them' then
    new.scorer_player_id := null;
    new.assist_player_id := null;
  end if;
  -- players must belong to the game's team
  if new.scorer_player_id is not null and public.team_of_player(new.scorer_player_id) is distinct from v_team then
    raise exception 'scorer is not on this team' using errcode = '23503';
  end if;
  if new.assist_player_id is not null and public.team_of_player(new.assist_player_id) is distinct from v_team then
    raise exception 'assist is not on this team' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_by := (select auth.uid());
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger score_events_validate before insert or update on public.score_events
  for each row execute function public.score_events_validate();

-- ---------- plate_appearances: baseball only, player on the team ----------
create or replace function public.plate_appearances_validate()
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
  if v_sport is distinct from 'baseball' then
    raise exception 'plate appearances are only recorded for baseball' using errcode = '23514';
  end if;
  if public.team_of_player(new.player_id) is distinct from v_team then
    raise exception 'batter is not on this team' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' then
    new.updated_by := (select auth.uid());
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger plate_appearances_validate before insert or update on public.plate_appearances
  for each row execute function public.plate_appearances_validate();

-- ---------- lineup_slots: player must belong to the lineup's team ----------
create or replace function public.lineup_slots_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.player_id is not null
     and public.team_of_player(new.player_id) is distinct from public.team_of_lineup(new.lineup_id) then
    raise exception 'player is not on this team' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger lineup_slots_validate before insert or update on public.lineup_slots
  for each row execute function public.lineup_slots_validate();

-- ---------- skill_tests: lock the metric once results exist; never delete with history ----------
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
  ) then
    raise exception 'metric settings are locked once a test has results' using errcode = '23514';
  end if;
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create trigger skill_tests_guard before update or delete on public.skill_tests
  for each row execute function public.skill_tests_guard();

-- ---------- stamp updated_by on coach-editable tables ----------
create or replace function public.stamp_updated_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  return new;
end;
$$;

create trigger players_stamp before insert or update on public.players
  for each row execute function public.stamp_updated_by();
create trigger games_stamp before insert or update on public.games
  for each row execute function public.stamp_updated_by();
create trigger game_coach_notes_stamp before insert or update on public.game_coach_notes
  for each row execute function public.stamp_updated_by();
create trigger skill_results_stamp before insert or update on public.skill_results
  for each row execute function public.stamp_updated_by();
