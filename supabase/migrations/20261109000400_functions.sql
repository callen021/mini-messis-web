-- Multi-row operations and membership flows (BUILD-PROMPT §3, §5).
-- SECURITY DEFINER only where an atomic multi-row write needs to bypass per-table RLS; each
-- function re-checks authorization itself.

-- ---------- join codes: 8 chars, Crockford-ish base32 without I/L/O/U/0/1 ----------
create or replace function public.generate_join_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(8);
  v_code text := '';
  i int;
begin
  for i in 0..7 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
  end loop;
  return v_code;
end;
$$;

create or replace function public.normalize_join_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- ---------- create_team ----------
-- p_template: [{ "formation_name": "3-3", "slots": [{ "position_role": "ST", "position_code": "LW" }, ...] }, ...]
--             one entry per period, built by the client from the sport definition.
-- p_skill_tests: [{ key, name, instructions, metric, unit, has_sides, higher_is_better }] default set (Phase 6).
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
    insert into public.skill_tests (team_id, key, name, instructions, metric, unit, has_sides, higher_is_better, sort_order, updated_by)
    values (
      v_team,
      v_test ->> 'key',
      v_test ->> 'name',
      coalesce(v_test ->> 'instructions', ''),
      (v_test ->> 'metric')::public.skill_metric,
      nullif(v_test ->> 'unit', ''),
      coalesce((v_test ->> 'has_sides')::boolean, false),
      coalesce((v_test ->> 'higher_is_better')::boolean, true),
      v_order,
      v_uid
    );
    v_order := v_order + 1;
  end loop;

  update public.profiles set last_team_id = v_team where id = v_uid;
  return v_team;
end;
$$;

-- ---------- join by code ----------
create or replace function public.record_join_attempt(p_uid uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent int;
begin
  select count(*) into v_recent
  from public.join_attempts a
  where a.user_id = p_uid and a.attempted_at > now() - interval '10 minutes';
  if v_recent >= 5 then
    raise exception 'too many attempts — try again in a few minutes' using errcode = 'P0001';
  end if;
  insert into public.join_attempts (user_id, code_tried) values (p_uid, left(p_code, 16));
end;
$$;
revoke all on function public.record_join_attempt(uuid, text) from public;

-- Preview what a code points at: team name, sport, and roster first names + numbers for child linking.
create or replace function public.lookup_join_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_code text := public.normalize_join_code(p_code);
  v_team public.teams%rowtype;
  v_players jsonb;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform public.record_join_attempt(v_uid, v_code);
  select * into v_team from public.teams t where t.join_code = v_code and t.archived_at is null;
  if not found then
    return null;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'first_name', p.first_name, 'jersey_number', p.jersey_number)
                            order by p.sort_order, p.first_name), '[]'::jsonb)
  into v_players
  from public.players p where p.team_id = v_team.id and p.archived_at is null;
  return jsonb_build_object('team_id', v_team.id, 'name', v_team.name, 'sport', v_team.sport, 'players', v_players);
end;
$$;

create or replace function public.request_join(
  p_code text,
  p_requested_role public.member_role,
  p_player_ids uuid[] default '{}',
  p_unlisted_child_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_code text := public.normalize_join_code(p_code);
  v_team public.teams%rowtype;
  v_member_id uuid;
  v_existing public.team_members%rowtype;
  v_pid uuid;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_requested_role not in ('parent', 'assistant') then
    raise exception 'you can request to join as a parent or an assistant coach' using errcode = '22023';
  end if;
  perform public.record_join_attempt(v_uid, v_code);
  select * into v_team from public.teams t where t.join_code = v_code and t.archived_at is null;
  if not found then
    raise exception 'that join code is not valid' using errcode = 'P0002';
  end if;

  select * into v_existing from public.team_members m where m.team_id = v_team.id and m.user_id = v_uid;
  if found then
    if v_existing.status = 'active' then
      return jsonb_build_object('status', 'active', 'team_id', v_team.id, 'name', v_team.name, 'sport', v_team.sport);
    end if;
    update public.team_members
      set status = 'pending', requested_role = p_requested_role, role = p_requested_role, note = null,
          approved_by = null, approved_at = null
      where id = v_existing.id;
    v_member_id := v_existing.id;
  else
    insert into public.team_members (team_id, user_id, role, status, requested_role)
    values (v_team.id, v_uid, p_requested_role, 'pending', p_requested_role)
    returning id into v_member_id;
  end if;

  if p_requested_role = 'parent' then
    foreach v_pid in array coalesce(p_player_ids, '{}') loop
      if public.team_of_player(v_pid) = v_team.id then
        insert into public.player_guardians (player_id, user_id, status)
        values (v_pid, v_uid, 'pending')
        on conflict (player_id, user_id) do nothing;
      end if;
    end loop;
    if nullif(trim(coalesce(p_unlisted_child_name, '')), '') is not null then
      insert into public.unlisted_child_requests (member_id, child_name) values (v_member_id, trim(p_unlisted_child_name));
    end if;
  end if;

  return jsonb_build_object('status', 'pending', 'team_id', v_team.id, 'name', v_team.name, 'sport', v_team.sport);
end;
$$;

-- A member (any role) asks to be linked to one more child on the same team; coach approves.
create or replace function public.request_guardian_link(p_player_id uuid, p_relationship text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_team uuid := public.team_of_player(p_player_id);
  v_id uuid;
begin
  if v_uid is null or v_team is null or not public.is_active_member(v_team) then
    raise exception 'not a member of this team' using errcode = '42501';
  end if;
  insert into public.player_guardians (player_id, user_id, relationship, status)
  values (p_player_id, v_uid, p_relationship, 'pending')
  on conflict (player_id, user_id) do update set relationship = coalesce(excluded.relationship, public.player_guardians.relationship)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------- coach: approve / decline / remove / roles ----------
create or replace function public.approve_member(p_member_id uuid, p_role public.member_role, p_player_ids uuid[] default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_m public.team_members%rowtype;
  v_pid uuid;
begin
  select * into v_m from public.team_members m where m.id = p_member_id;
  if not found or not public.is_coach(v_m.team_id) then
    raise exception 'only a coach can approve members' using errcode = '42501';
  end if;
  if not public.email_confirmed(v_m.user_id) then
    raise exception 'this person has not verified their email yet' using errcode = 'P0003';
  end if;
  update public.team_members
    set status = 'active', role = p_role, approved_by = v_uid, approved_at = now()
    where id = p_member_id;

  if p_player_ids is not null then
    -- the coach's list wins: drop pending links not in it, approve the rest (create if missing)
    delete from public.player_guardians g
      where g.user_id = v_m.user_id and g.status = 'pending'
        and public.team_of_player(g.player_id) = v_m.team_id
        and not (g.player_id = any (p_player_ids));
    foreach v_pid in array p_player_ids loop
      if public.team_of_player(v_pid) = v_m.team_id then
        insert into public.player_guardians (player_id, user_id, status, approved_by, approved_at)
        values (v_pid, v_m.user_id, 'approved', v_uid, now())
        on conflict (player_id, user_id) do update set status = 'approved', approved_by = v_uid, approved_at = now();
      end if;
    end loop;
  else
    update public.player_guardians g set status = 'approved', approved_by = v_uid, approved_at = now()
      where g.user_id = v_m.user_id and g.status = 'pending' and public.team_of_player(g.player_id) = v_m.team_id;
  end if;
  delete from public.unlisted_child_requests where member_id = p_member_id;
end;
$$;

create or replace function public.decline_member(p_member_id uuid)
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
    raise exception 'only a coach can decline requests' using errcode = '42501';
  end if;
  if v_m.status <> 'pending' then
    raise exception 'only pending requests can be declined' using errcode = '22023';
  end if;
  delete from public.player_guardians g
    where g.user_id = v_m.user_id and g.status = 'pending' and public.team_of_player(g.player_id) = v_m.team_id;
  delete from public.team_members where id = p_member_id;
end;
$$;

create or replace function public.remove_member(p_member_id uuid)
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
    raise exception 'only a coach can remove members' using errcode = '42501';
  end if;
  if v_m.user_id = (select owner_id from public.teams where id = v_m.team_id) then
    raise exception 'transfer ownership before removing the owner' using errcode = '23514';
  end if;
  update public.team_members set status = 'removed' where id = p_member_id;  -- keep-a-coach trigger applies
  delete from public.player_guardians g
    where g.user_id = v_m.user_id and public.team_of_player(g.player_id) = v_m.team_id;
end;
$$;

create or replace function public.set_member_role(p_member_id uuid, p_role public.member_role)
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
    raise exception 'only a coach can change roles' using errcode = '42501';
  end if;
  if v_m.user_id = (select owner_id from public.teams where id = v_m.team_id) and p_role <> 'coach' then
    raise exception 'the owner must stay a coach; transfer ownership first' using errcode = '23514';
  end if;
  update public.team_members set role = p_role where id = p_member_id;  -- keep-a-coach trigger applies
end;
$$;

create or replace function public.approve_guardian_link(p_link_id uuid, p_approve boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.player_guardians%rowtype;
begin
  select * into v_g from public.player_guardians g where g.id = p_link_id;
  if not found or not public.is_coach(public.team_of_player(v_g.player_id)) then
    raise exception 'only a coach can approve child links' using errcode = '42501';
  end if;
  if p_approve then
    update public.player_guardians set status = 'approved', approved_by = (select auth.uid()), approved_at = now() where id = p_link_id;
  else
    delete from public.player_guardians where id = p_link_id;
  end if;
end;
$$;

create or replace function public.rotate_join_code(p_team_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not public.is_coach(p_team_id) then
    raise exception 'only a coach can rotate the join code' using errcode = '42501';
  end if;
  loop
    v_code := public.generate_join_code();
    exit when not exists (select 1 from public.teams t where t.join_code = v_code);
  end loop;
  update public.teams set join_code = v_code, join_code_rotated_at = now() where id = p_team_id;
  return v_code;
end;
$$;

create or replace function public.transfer_ownership(p_team_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner(p_team_id) then
    raise exception 'only the owner can transfer ownership' using errcode = '42501';
  end if;
  if not exists (select 1 from public.team_members m where m.team_id = p_team_id and m.user_id = p_user_id and m.status = 'active') then
    raise exception 'the new owner must be an active member' using errcode = '22023';
  end if;
  update public.team_members set role = 'coach' where team_id = p_team_id and user_id = p_user_id;
  perform set_config('app.allow_owner_change', 'on', true);
  update public.teams set owner_id = p_user_id where id = p_team_id;
  perform set_config('app.allow_owner_change', 'off', true);
end;
$$;

-- ---------- games: start / finish ----------
create or replace function public.snapshot_game_players(p_game_id uuid, p_team_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.game_players (game_id, player_id, name_snapshot, number_snapshot, available)
  select p_game_id, p.id, trim(p.first_name || ' ' || coalesce(p.last_name, '')), p.jersey_number, p.is_available
  from public.players p
  where p.team_id = p_team_id and p.archived_at is null
  on conflict (game_id, player_id) do update
    set name_snapshot = excluded.name_snapshot, number_snapshot = excluded.number_snapshot, available = excluded.available;
$$;
revoke all on function public.snapshot_game_players(uuid, uuid) from public;

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
    insert into public.lineups (team_id, game_id, period_index, formation_name)
    values (p_team_id, p_to_game, r.period_index, r.formation_name)
    returning id into v_new;
    insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code, player_id, auto_picked)
    select v_new, s.slot_index, s.position_role, s.position_code,
           case when p.id is not null and p.archived_at is null and p.is_available then s.player_id end,
           s.auto_picked and p.id is not null and p.archived_at is null and p.is_available
    from public.lineup_slots s
    left join public.players p on p.id = s.player_id
    where s.lineup_id = r.id;
  end loop;
end;
$$;
revoke all on function public.copy_lineups(uuid, uuid, uuid) from public;

create or replace function public.start_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype;
  v_team_name text;
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
  select name into v_team_name from public.teams where id = v_g.team_id;
  perform public.copy_lineups(v_g.team_id, null, p_game_id);
  perform public.snapshot_game_players(p_game_id, v_g.team_id);
  update public.games set status = 'live', started_at = now(), team_name_snapshot = v_team_name where id = p_game_id;
end;
$$;

create or replace function public.finish_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype;
begin
  select * into v_g from public.games g where g.id = p_game_id;
  if not found or not public.is_staff(v_g.team_id) then
    raise exception 'only a coach or assistant can finish a game' using errcode = '42501';
  end if;
  if v_g.status <> 'live' then
    raise exception 'only a live game can be finished' using errcode = '22023';
  end if;
  perform public.snapshot_game_players(p_game_id, v_g.team_id);
  update public.games set status = 'done', finished_at = now() where id = p_game_id;
  -- the final lineup becomes the plan for the next game
  perform public.copy_lineups(v_g.team_id, p_game_id, null);
end;
$$;

-- ---------- views ----------
create or replace view public.game_scores
with (security_invoker = true) as
  select g.id as game_id,
         coalesce(sum(e.points) filter (where e.side = 'us'), 0)::int as us,
         coalesce(sum(e.points) filter (where e.side = 'them'), 0)::int as them
  from public.games g
  left join public.score_events e on e.game_id = g.id
  group by g.id;

create or replace view public.game_line_score
with (security_invoker = true) as
  select e.game_id, e.period_index, e.side, sum(e.points)::int as points
  from public.score_events e
  group by e.game_id, e.period_index, e.side;

-- ---------- grants ----------
revoke all on function public.create_team(text, public.sport, int, boolean, int, jsonb, jsonb, jsonb) from public;
revoke all on function public.lookup_join_code(text) from public;
revoke all on function public.request_join(text, public.member_role, uuid[], text) from public;
revoke all on function public.request_guardian_link(uuid, text) from public;
revoke all on function public.approve_member(uuid, public.member_role, uuid[]) from public;
revoke all on function public.decline_member(uuid) from public;
revoke all on function public.remove_member(uuid) from public;
revoke all on function public.set_member_role(uuid, public.member_role) from public;
revoke all on function public.approve_guardian_link(uuid, boolean) from public;
revoke all on function public.rotate_join_code(uuid) from public;
revoke all on function public.transfer_ownership(uuid, uuid) from public;
revoke all on function public.start_game(uuid) from public;
revoke all on function public.finish_game(uuid) from public;
grant execute on function
  public.create_team(text, public.sport, int, boolean, int, jsonb, jsonb, jsonb),
  public.lookup_join_code(text),
  public.request_join(text, public.member_role, uuid[], text),
  public.request_guardian_link(uuid, text),
  public.approve_member(uuid, public.member_role, uuid[]),
  public.decline_member(uuid),
  public.remove_member(uuid),
  public.set_member_role(uuid, public.member_role),
  public.approve_guardian_link(uuid, boolean),
  public.rotate_join_code(uuid),
  public.transfer_ownership(uuid, uuid),
  public.start_game(uuid),
  public.finish_game(uuid)
to authenticated, service_role;

-- ---------- directory helpers for the UI ----------
-- Pending requests of the current user, with the team's name (teams are not readable before approval).
create or replace function public.my_pending_requests()
returns table (member_id uuid, team_id uuid, team_name text, sport public.sport, requested_role public.member_role, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, t.id, t.name, t.sport, m.requested_role, m.created_at
  from public.team_members m
  join public.teams t on t.id = m.team_id
  where m.user_id = (select auth.uid()) and m.status = 'pending'
  order by m.created_at desc;
$$;

-- Member directory for coaches/assistants: profiles are private, so names come through here.
create or replace function public.list_team_members(p_team_id uuid)
returns table (
  member_id uuid, user_id uuid, role public.member_role, status public.member_status,
  requested_role public.member_role, display_name text, email text, is_owner boolean,
  created_at timestamptz, approved_at timestamptz, children jsonb, unlisted jsonb
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
         coalesce((
           select jsonb_agg(jsonb_build_object('link_id', g.id, 'player_id', g.player_id, 'first_name', pl.first_name,
                                               'jersey_number', pl.jersey_number, 'status', g.status) order by pl.sort_order, pl.first_name)
           from public.player_guardians g join public.players pl on pl.id = g.player_id
           where g.user_id = m.user_id and pl.team_id = m.team_id
         ), '[]'::jsonb),
         coalesce((select jsonb_agg(r.child_name order by r.created_at) from public.unlisted_child_requests r where r.member_id = m.id), '[]'::jsonb)
  from public.team_members m
  join public.teams t on t.id = m.team_id
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.team_id = p_team_id
    and m.status <> 'removed'
    and public.is_staff(p_team_id)
  order by (m.status = 'pending') desc, m.role, m.created_at;
$$;

revoke all on function public.my_pending_requests() from public;
revoke all on function public.list_team_members(uuid) from public;
grant execute on function public.my_pending_requests(), public.list_team_members(uuid) to authenticated, service_role;
