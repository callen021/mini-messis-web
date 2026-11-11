-- Team directory (round 2, D57).
--   * player_contacts.share_with_team: when on (default), every ACTIVE member of the team may read
--     the contact's name, relationship, phone and email. Birthdate and shirt size (player_details)
--     stay with staff and the child's approved guardians only. Writes stay with staff + guardians.
--   * The invite can carry a phone number; on approval it becomes a contact on each linked child.
--   * roster_directory(team): parents' first names per player as the caller may see them.
--   * player_people(player): the merged Parents list (contacts + guardian accounts).
--   * team_sheet(team): staff-only table of child, birthdate, shirt size and every parent.

alter table public.player_contacts add column if not exists share_with_team boolean not null default true;
alter table public.team_members add column if not exists contact_phone text
  check (contact_phone is null or length(contact_phone) <= 40);

-- ---------- contact visibility ----------
create or replace function public.can_see_contact(p_player_id uuid, p_shared boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_see_player_private(p_player_id)
      or (p_shared and public.is_active_member(public.team_of_player(p_player_id)));
$$;
revoke all on function public.can_see_contact(uuid, boolean) from public;
grant execute on function public.can_see_contact(uuid, boolean) to authenticated, service_role;

drop policy if exists player_contacts_private on public.player_contacts;
create policy player_contacts_select on public.player_contacts for select to authenticated
  using (public.can_see_contact(player_id, share_with_team));
create policy player_contacts_insert on public.player_contacts for insert to authenticated
  with check (public.can_see_player_private(player_id));
create policy player_contacts_update on public.player_contacts for update to authenticated
  using (public.can_see_player_private(player_id)) with check (public.can_see_player_private(player_id));
create policy player_contacts_delete on public.player_contacts for delete to authenticated
  using (public.can_see_player_private(player_id));

-- ---------- invite: optional phone ----------
drop function if exists public.request_join(text, public.member_role, uuid[], text);
create function public.request_join(
  p_code text,
  p_requested_role public.member_role,
  p_player_ids uuid[] default '{}',
  p_unlisted_child_name text default null,
  p_phone text default null
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
  v_phone text := nullif(left(trim(coalesce(p_phone, '')), 40), '');
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
          approved_by = null, approved_at = null, contact_phone = coalesce(v_phone, contact_phone)
      where id = v_existing.id;
    v_member_id := v_existing.id;
  else
    insert into public.team_members (team_id, user_id, role, status, requested_role, contact_phone)
    values (v_team.id, v_uid, 'parent', 'pending', 'parent', v_phone)
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
revoke all on function public.request_join(text, public.member_role, uuid[], text, text) from public;
grant execute on function public.request_join(text, public.member_role, uuid[], text, text) to authenticated, service_role;

-- ---------- approval creates a contact on each linked child ----------
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
  v_name text;
  v_email text;
  v_link record;
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

  -- the parent becomes a contact on each child they are now linked to (D57)
  select coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)), u.email::text
    into v_name, v_email
  from auth.users u left join public.profiles p on p.id = u.id where u.id = v_m.user_id;
  for v_link in
    select pg.player_id from public.player_guardians pg
    where pg.user_id = v_m.user_id and pg.status = 'approved' and public.team_of_player(pg.player_id) = v_m.team_id
  loop
    if not exists (select 1 from public.player_contacts c where c.player_id = v_link.player_id and c.user_id = v_m.user_id) then
      insert into public.player_contacts (player_id, name, relationship, email, phone, user_id, updated_by)
      values (v_link.player_id, v_name, 'Parent', v_email, v_m.contact_phone, v_m.user_id, v_uid);
    end if;
  end loop;
end;
$$;

-- ---------- the directory ----------
-- Parents' first names per player, as the caller may see them: contacts visible under the sharing
-- rule, plus (for staff) guardian accounts that have no contact row yet.
create or replace function public.roster_directory(p_team_id uuid)
returns table (player_id uuid, parent_names text[])
language sql
stable
security definer
set search_path = ''
as $$
  with people as (
    select c.player_id, split_part(trim(c.name), ' ', 1) as first_name, c.sort_order as ord, c.created_at
    from public.player_contacts c
    join public.players p on p.id = c.player_id
    where p.team_id = p_team_id and public.can_see_contact(c.player_id, c.share_with_team)
    union all
    select g.player_id, split_part(coalesce(nullif(pr.display_name, ''), split_part(u.email, '@', 1)), ' ', 1), 999, g.created_at
    from public.player_guardians g
    join public.players p on p.id = g.player_id
    join auth.users u on u.id = g.user_id
    left join public.profiles pr on pr.id = g.user_id
    where p.team_id = p_team_id and g.status = 'approved' and public.is_staff(p_team_id)
      and not exists (select 1 from public.player_contacts c where c.player_id = g.player_id and c.user_id = g.user_id)
  )
  select pp.player_id, array_agg(distinct pp.first_name order by pp.first_name)
  from people pp
  where public.is_active_member(p_team_id)
  group by pp.player_id;
$$;

-- The Parents list of one player: contacts the caller may see, and guardian accounts (approved,
-- plus pending ones for staff) that have no contact row.
create or replace function public.player_people(p_player_id uuid)
returns table (
  contact_id uuid, user_id uuid, name text, relationship text, email text, phone text,
  share_with_team boolean, in_app boolean, link_status text, can_edit boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.user_id, c.name, c.relationship, c.email, c.phone, c.share_with_team,
         c.user_id is not null,
         (select g.status::text from public.player_guardians g where g.player_id = c.player_id and g.user_id = c.user_id),
         public.can_see_player_private(c.player_id)
  from public.player_contacts c
  where c.player_id = p_player_id and public.can_see_contact(c.player_id, c.share_with_team)
  union all
  select null, g.user_id,
         coalesce(nullif(pr.display_name, ''), split_part(u.email, '@', 1)),
         null,
         case when public.is_staff(public.team_of_player(p_player_id)) then u.email::text end,
         null, false, true, g.status::text, public.can_see_player_private(p_player_id)
  from public.player_guardians g
  join auth.users u on u.id = g.user_id
  left join public.profiles pr on pr.id = g.user_id
  where g.player_id = p_player_id
    and public.can_see_player_private(p_player_id)
    and (g.status = 'approved' or public.is_staff(public.team_of_player(p_player_id)))
    and not exists (select 1 from public.player_contacts c where c.player_id = p_player_id and c.user_id = g.user_id)
  order by 8 desc, 3;
$$;

-- Staff only: everything on one sheet.
create or replace function public.team_sheet(p_team_id uuid)
returns table (
  player_id uuid, first_name text, last_name text, jersey_number text, birthdate date,
  shirt_size public.shirt_size, contacts jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.first_name, p.last_name, p.jersey_number, d.birthdate, d.shirt_size,
         coalesce((
           select jsonb_agg(jsonb_build_object('name', c.name, 'relationship', c.relationship, 'phone', c.phone,
                                               'email', c.email, 'share_with_team', c.share_with_team)
                            order by c.sort_order, c.created_at)
           from public.player_contacts c where c.player_id = p.id
         ), '[]'::jsonb)
  from public.players p
  left join public.player_details d on d.player_id = p.id
  where p.team_id = p_team_id and p.archived_at is null and public.is_staff(p_team_id)
  order by p.sort_order, p.first_name;
$$;

revoke all on function public.roster_directory(uuid) from public;
revoke all on function public.player_people(uuid) from public;
revoke all on function public.team_sheet(uuid) from public;
grant execute on function public.roster_directory(uuid), public.player_people(uuid), public.team_sheet(uuid)
  to authenticated, service_role;
