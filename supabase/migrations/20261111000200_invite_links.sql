-- Invite links (parent-feedback round, D49).
--   * teams.join_enabled: the coach can turn the invite (link and typed code) off and on; "Replace"
--     (rotate_join_code) makes a new code and turns it back on.
--   * lookup_invite(code): what the /join/<code> screen shows BEFORE an account exists (team name,
--     sport, roster first names + numbers, whether the invite is on). Callable signed out, so a
--     parent can create their account and file the request in one step. Signed-in callers still
--     count against the join rate limit; signed-out ones cannot (there is no user to key it on),
--     and the code space (30^8) is the protection, as it already was for typed codes.
--   * request_join is parent-only: assistant coaches are made by a coach or admin, never requested.
--   * approve / decline / child links are for coach, assistant and admin (is_staff); only a coach
--     may approve someone as anything but a parent.

alter table public.teams add column if not exists join_enabled boolean not null default true;

-- ---------- invite preview (anon + authenticated) ----------
create or replace function public.lookup_invite(p_code text)
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
  v_status text := null;
begin
  if v_uid is not null then
    perform public.record_join_attempt(v_uid, v_code);
  end if;
  if v_code !~ '^[A-Z2-9]{8}$' then
    return null;
  end if;
  select * into v_team from public.teams t where t.join_code = v_code and t.archived_at is null;
  if not found then
    return null;
  end if;
  if v_uid is not null then
    select m.status::text into v_status from public.team_members m where m.team_id = v_team.id and m.user_id = v_uid;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'first_name', p.first_name, 'jersey_number', p.jersey_number)
                            order by p.sort_order, p.first_name), '[]'::jsonb)
  into v_players
  from public.players p where p.team_id = v_team.id and p.archived_at is null;
  return jsonb_build_object(
    'team_id', v_team.id, 'name', v_team.name, 'sport', v_team.sport,
    'join_enabled', v_team.join_enabled, 'membership', v_status,
    'players', case when v_team.join_enabled then v_players else '[]'::jsonb end
  );
end;
$$;
revoke all on function public.lookup_invite(text) from public;
grant execute on function public.lookup_invite(text) to anon, authenticated, service_role;

-- the old signed-in lookup is the same thing now
create or replace function public.lookup_join_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return public.lookup_invite(p_code);
end;
$$;

-- ---------- turn the invite off / on (coach) ----------
create or replace function public.set_join_enabled(p_team_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_coach(p_team_id) then
    raise exception 'only a coach can turn the invite link off or on' using errcode = '42501';
  end if;
  update public.teams set join_enabled = p_enabled where id = p_team_id;
end;
$$;
revoke all on function public.set_join_enabled(uuid, boolean) from public;
grant execute on function public.set_join_enabled(uuid, boolean) to authenticated, service_role;

-- "Replace": a new code, and the invite is back on
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
    raise exception 'only a coach can replace the invite link' using errcode = '42501';
  end if;
  loop
    v_code := public.generate_join_code();
    exit when not exists (select 1 from public.teams t where t.join_code = v_code);
  end loop;
  update public.teams set join_code = v_code, join_code_rotated_at = now(), join_enabled = true where id = p_team_id;
  return v_code;
end;
$$;

-- ---------- request to join: parents only, invite must be on ----------
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
  if p_requested_role <> 'parent' then
    raise exception 'you can only join as a parent; coaches make assistant coaches' using errcode = '22023';
  end if;
  perform public.record_join_attempt(v_uid, v_code);
  select * into v_team from public.teams t where t.join_code = v_code and t.archived_at is null;
  if not found then
    raise exception 'that invite link is not valid' using errcode = 'P0002';
  end if;

  select * into v_existing from public.team_members m where m.team_id = v_team.id and m.user_id = v_uid;
  if found and v_existing.status = 'active' then
    return jsonb_build_object('status', 'active', 'team_id', v_team.id, 'name', v_team.name, 'sport', v_team.sport);
  end if;
  if not v_team.join_enabled then
    raise exception 'the coach has turned this invite link off; ask for a new one' using errcode = 'P0005';
  end if;

  if found then
    update public.team_members
      set status = 'pending', requested_role = 'parent', role = 'parent', note = null,
          approved_by = null, approved_at = null
      where id = v_existing.id;
    v_member_id := v_existing.id;
  else
    insert into public.team_members (team_id, user_id, role, status, requested_role)
    values (v_team.id, v_uid, 'parent', 'pending', 'parent')
    returning id into v_member_id;
  end if;

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

  return jsonb_build_object('status', 'pending', 'team_id', v_team.id, 'name', v_team.name, 'sport', v_team.sport);
end;
$$;

-- ---------- approvals: coach, assistant and admin ----------
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
  if not found or not public.is_staff(v_m.team_id) then
    raise exception 'only a coach or assistant can approve members' using errcode = '42501';
  end if;
  if p_role <> 'parent' and not public.is_coach(v_m.team_id) then
    raise exception 'only a coach can approve someone as an assistant or coach' using errcode = '42501';
  end if;
  if not public.email_confirmed(v_m.user_id) then
    raise exception 'this person has not verified their email yet' using errcode = 'P0003';
  end if;
  update public.team_members
    set status = 'active', role = p_role, approved_by = v_uid, approved_at = now()
    where id = p_member_id;

  if p_player_ids is not null then
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
  if not found or not public.is_staff(v_m.team_id) then
    raise exception 'only a coach or assistant can decline requests' using errcode = '42501';
  end if;
  if v_m.status <> 'pending' then
    raise exception 'only pending requests can be declined' using errcode = '22023';
  end if;
  delete from public.player_guardians g
    where g.user_id = v_m.user_id and g.status = 'pending' and public.team_of_player(g.player_id) = v_m.team_id;
  delete from public.team_members where id = p_member_id;
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
  if not found or not public.is_staff(public.team_of_player(v_g.player_id)) then
    raise exception 'only a coach or assistant can approve child links' using errcode = '42501';
  end if;
  if p_approve then
    update public.player_guardians set status = 'approved', approved_by = (select auth.uid()), approved_at = now() where id = p_link_id;
  else
    delete from public.player_guardians where id = p_link_id;
  end if;
end;
$$;

-- Staff (not just coaches) can read membership, guardian-link and unlisted-child rows, so an
-- assistant's Members screen and the player page work; writes stay on the RPCs above.
drop policy if exists team_members_select_own_or_coach on public.team_members;
create policy team_members_select_own_or_staff on public.team_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff(team_id));

drop policy if exists guardians_select_own_or_coach on public.player_guardians;
create policy guardians_select_own_or_staff on public.player_guardians for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff(public.team_of_player(player_id)));

drop policy if exists unlisted_select_own_or_coach on public.unlisted_child_requests;
create policy unlisted_select_own_or_staff on public.unlisted_child_requests for select to authenticated
  using (exists (
    select 1 from public.team_members m
    where m.id = member_id and (m.user_id = (select auth.uid()) or public.is_staff(m.team_id))
  ));
