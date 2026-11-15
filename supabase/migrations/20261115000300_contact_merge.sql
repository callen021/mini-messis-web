-- Duplicate contacts (D116). A contact the coach typed for a parent has no account; when that
-- parent signs up and the link is confirmed, the account's contact row was created next to it,
-- matched only by account. Now the confirmation looks at the child's existing contacts for the
-- same phone (digits only) or the same email (lowercased, trimmed) and attaches the account to
-- that row instead: the coach's relationship label and share setting stay, blank fields are
-- filled from the account. A name-only match is never merged on its own: the app shows the
-- coaches a "Possible duplicate" prompt, and the contact edit screen offers "Merge with…", both
-- through merge_contacts.

-- digits only, null when there are none; a leading US/Canada country code is dropped so
-- "+1 (555) 010-0201" and "555-010-0201" are the same number
create or replace function public.phone_digits(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d = '' then null
    when length(d) = 11 and left(d, 1) = '1' then substr(d, 2)
    else d
  end
  from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) x;
$$;

create or replace function public.email_key(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(trim(coalesce(p_email, ''))), '');
$$;

-- ---------- confirming a link attaches the account to a matching contact, or adds one ----------
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
  v_match uuid;
begin
  if exists (select 1 from public.player_contacts c where c.player_id = p_player_id and c.user_id = p_user_id) then
    return;
  end if;
  select coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)), u.email::text
    into v_name, v_email
  from auth.users u left join public.profiles p on p.id = u.id where u.id = p_user_id;
  select m.contact_phone into v_phone
  from public.team_members m where m.user_id = p_user_id and m.team_id = public.team_of_player(p_player_id);

  -- the same phone or the same email on a contact without an account: that is this person
  select c.id into v_match
  from public.player_contacts c
  where c.player_id = p_player_id and c.user_id is null
    and ((public.phone_digits(c.phone) is not null and public.phone_digits(c.phone) = public.phone_digits(v_phone))
      or (public.email_key(c.email) is not null and public.email_key(c.email) = public.email_key(v_email)))
  order by c.sort_order, c.created_at
  limit 1;
  if v_match is not null then
    update public.player_contacts
      set user_id = p_user_id,
          email = coalesce(email, v_email),
          phone = coalesce(phone, v_phone),
          updated_by = (select auth.uid())
      where id = v_match;
    return;
  end if;
  insert into public.player_contacts (player_id, name, relationship, email, phone, user_id, updated_by)
  values (p_player_id, v_name, 'Parent', v_email, v_phone, p_user_id, (select auth.uid()));
end;
$$;
revoke all on function public.guardian_contact_row(uuid, uuid) from public;

-- approve_member (approval required, D49/D91) goes through the same path
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

  -- the parent becomes a contact on each child they are now linked to (D57), attached to the
  -- coach's entry when the phone or email matches (D116)
  for v_link in
    select pg.player_id from public.player_guardians pg
    where pg.user_id = v_m.user_id and pg.status = 'approved' and public.team_of_player(pg.player_id) = v_m.team_id
  loop
    perform public.guardian_contact_row(v_link.player_id, v_m.user_id);
  end loop;
end;
$$;

-- ---------- merge two contacts of the same player ----------
-- `p_keep` survives with its name, relationship and share setting; its blank fields are filled
-- from `p_drop`, the account moves over if `p_keep` has none, and `p_drop` is deleted. Whoever
-- may edit both rows may merge them (staff, the child's confirmed parents).
create or replace function public.merge_contacts(p_keep uuid, p_drop uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keep public.player_contacts%rowtype;
  v_drop public.player_contacts%rowtype;
begin
  if p_keep = p_drop then
    raise exception 'pick two different contacts' using errcode = '22023';
  end if;
  select * into v_keep from public.player_contacts c where c.id = p_keep;
  select * into v_drop from public.player_contacts c where c.id = p_drop;
  if v_keep.id is null or v_drop.id is null or v_keep.player_id <> v_drop.player_id then
    raise exception 'both contacts must be on the same player' using errcode = 'P0002';
  end if;
  if not public.can_write_contact(v_keep.player_id, v_keep.user_id) or not public.can_write_contact(v_drop.player_id, v_drop.user_id) then
    raise exception 'you cannot merge these contacts' using errcode = '42501';
  end if;
  if v_keep.user_id is not null and v_drop.user_id is not null and v_keep.user_id <> v_drop.user_id then
    raise exception 'these are two different accounts' using errcode = 'P0020';
  end if;
  delete from public.player_contacts where id = p_drop;
  update public.player_contacts
    set user_id = coalesce(v_keep.user_id, v_drop.user_id),
        relationship = coalesce(v_keep.relationship, v_drop.relationship),
        email = coalesce(v_keep.email, v_drop.email),
        phone = coalesce(v_keep.phone, v_drop.phone),
        updated_by = (select auth.uid())
    where id = p_keep;
end;
$$;
revoke all on function public.merge_contacts(uuid, uuid) from public;
grant execute on function public.merge_contacts(uuid, uuid) to authenticated, service_role;
