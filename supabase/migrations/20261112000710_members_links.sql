-- The new-members list and staff link management (D92): confirming a link makes the parent a
-- contact on the child (D57), staff can replace a member's set of children in one call, and
-- list_team_members gains joined_at so Members can show who joined in the last seven days.

-- ---------- staff confirm, change or remove a link ----------
-- Confirming makes the parent a contact on the child (D57), as approval did.
create or replace function public.guardian_contact_row(p_player_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_email text;
  v_phone text;
begin
  if exists (select 1 from public.player_contacts c where c.player_id = p_player_id and c.user_id = p_user_id) then
    return;
  end if;
  select coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)), u.email::text
    into v_name, v_email
  from auth.users u left join public.profiles p on p.id = u.id where u.id = p_user_id;
  select m.contact_phone into v_phone
  from public.team_members m where m.user_id = p_user_id and m.team_id = public.team_of_player(p_player_id);
  insert into public.player_contacts (player_id, name, relationship, email, phone, user_id, updated_by)
  values (p_player_id, v_name, 'Parent', v_email, v_phone, p_user_id, (select auth.uid()));
end;
$$;
revoke all on function public.guardian_contact_row(uuid, uuid) from public;

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
    raise exception 'only a coach or assistant can confirm child links' using errcode = '42501';
  end if;
  if p_approve then
    update public.player_guardians set status = 'approved', approved_by = (select auth.uid()), approved_at = now() where id = p_link_id;
    perform public.guardian_contact_row(v_g.player_id, v_g.user_id);
  else
    delete from public.player_guardians where id = p_link_id;
  end if;
end;
$$;

-- Replace a member's child links on their team with this set, every one confirmed (a staff action).
create or replace function public.set_member_children(p_member_id uuid, p_player_ids uuid[])
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
    raise exception 'only a coach or assistant can change child links' using errcode = '42501';
  end if;
  delete from public.player_guardians g
    where g.user_id = v_m.user_id
      and public.team_of_player(g.player_id) = v_m.team_id
      and not (g.player_id = any (coalesce(p_player_ids, '{}')));
  foreach v_pid in array coalesce(p_player_ids, '{}') loop
    if public.team_of_player(v_pid) = v_m.team_id then
      insert into public.player_guardians (player_id, user_id, status, approved_by, approved_at)
      values (v_pid, v_m.user_id, 'approved', v_uid, now())
      on conflict (player_id, user_id) do update set status = 'approved', approved_by = v_uid, approved_at = now();
      perform public.guardian_contact_row(v_pid, v_m.user_id);
    end if;
  end loop;
  delete from public.unlisted_child_requests where member_id = p_member_id;
end;
$$;
revoke all on function public.set_member_children(uuid, uuid[]) from public;
grant execute on function public.set_member_children(uuid, uuid[]) to authenticated, service_role;

-- ---------- the members list gains joined_at (for "New this week") ----------
drop function if exists public.list_team_members(uuid);
create function public.list_team_members(p_team_id uuid)
returns table (
  member_id uuid, user_id uuid, role public.member_role, status public.member_status,
  requested_role public.member_role, display_name text, email text, is_owner boolean,
  created_at timestamptz, approved_at timestamptz, joined_at timestamptz, children jsonb, unlisted jsonb
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
revoke all on function public.list_team_members(uuid) from public;
grant execute on function public.list_team_members(uuid) to authenticated, service_role;

-- Unlisted-child names from a direct join are visible to staff on the Members screen (the
-- select policy already allows staff); nothing else changes for them.

