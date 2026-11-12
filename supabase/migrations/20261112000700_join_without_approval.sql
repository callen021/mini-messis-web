-- Joining without approval and unconfirmed child links (D91).
--
-- teams.require_approval (default off, for every team): when off, submitting the invite link makes
-- the parent an active member at once and links the children they picked as UNCONFIRMED
-- (player_guardians.status = 'pending'). An unconfirmed link gives the parent everything any team
-- parent sees plus their child starred and the child's individual stats under "own child only"
-- (is_linked_to); it does NOT give the child's birthdate or shirt size, contacts not shared with
-- the team, skill results, or editing of the child's details and other people's contacts (those
-- stay on is_guardian_of, which needs a staff-confirmed link). A parent may add and edit a contact
-- entry for themselves on a linked child. A parent cannot add, change or remove their own child
-- links after joining; staff do that from Members (0710). When the setting is on, the approval
-- flow (request_join → pending → approve_member) is unchanged. The link only ever grants the
-- parent role.

alter table public.teams add column if not exists require_approval boolean not null default false;

-- ---------- a link of any status ----------
create or replace function public.is_linked_to(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.player_guardians g
    where g.player_id = p_player_id and g.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_linked_to(uuid) from public;
grant execute on function public.is_linked_to(uuid) to authenticated, service_role;

-- ---------- stats: an unconfirmed link grants the child's own stats ----------
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
    else public.is_linked_to(p_player_id)
  end;
$$;

create or replace function public.player_season_stats(
  p_team_id uuid,
  p_season_id uuid default null,
  p_game_id uuid default null
)
returns table (
  player_id uuid, name text, number text, removed boolean, games_played int, periods_played int, goals int, assists int,
  points int, field_goals int, three_pointers int, free_throws int, runs int, plate_appearances int,
  at_bats int, hits int, doubles int, triples int, home_runs int, rbi int, walks int, strikeouts int,
  seconds_played int
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
           sum(greatest(0, coalesce(st.clock_end, case when g.clock_period = st.period_index then public.clock_elapsed(g.clock_seconds, g.clock_running_since) else st.clock_start end) - st.clock_start))::int as secs
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
         coalesce(b.home_runs, 0), coalesce(b.rbi, 0), coalesce(b.walks, 0), coalesce(b.strikeouts, 0),
         coalesce(tm.secs, 0)
  from ids i
  left join public.players p on p.id = i.id
  left join snap sn on sn.player_id = i.id
  left join played pl on pl.player_id = i.id
  left join timed tm on tm.player_id = i.id
  left join scored sc on sc.player_id = i.id
  left join assisted a on a.player_id = i.id
  left join batting b on b.player_id = i.id
  where public.is_active_member(p_team_id)
    and (public.sees_all_stats(p_team_id) or public.is_linked_to(i.id));
$$;

-- ---------- contacts: a parent's own entry on a linked child ----------
-- Reading: what the team shares, what a confirmed guardian or staff may see, and your own row.
-- Writing: staff and confirmed guardians as before; a linked parent (confirmed or not) may add,
-- edit and delete the row that is their own account (user_id = auth.uid()) and nothing else.
create or replace function public.can_write_contact(p_player_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_see_player_private(p_player_id)
      or (p_user_id is not null and p_user_id = (select auth.uid()) and public.is_linked_to(p_player_id));
$$;
revoke all on function public.can_write_contact(uuid, uuid) from public;
grant execute on function public.can_write_contact(uuid, uuid) to authenticated, service_role;

drop policy if exists player_contacts_select on public.player_contacts;
create policy player_contacts_select on public.player_contacts for select to authenticated
  using (public.can_see_contact(player_id, share_with_team) or user_id = (select auth.uid()));
drop policy if exists player_contacts_insert on public.player_contacts;
create policy player_contacts_insert on public.player_contacts for insert to authenticated
  with check (public.can_write_contact(player_id, user_id));
drop policy if exists player_contacts_update on public.player_contacts;
create policy player_contacts_update on public.player_contacts for update to authenticated
  using (public.can_write_contact(player_id, user_id)) with check (public.can_write_contact(player_id, user_id));
drop policy if exists player_contacts_delete on public.player_contacts;
create policy player_contacts_delete on public.player_contacts for delete to authenticated
  using (public.can_write_contact(player_id, user_id));

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
         public.can_write_contact(c.player_id, c.user_id)
  from public.player_contacts c
  where c.player_id = p_player_id
    and (public.can_see_contact(c.player_id, c.share_with_team) or c.user_id = (select auth.uid()))
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

-- ---------- the invite preview says whether the coach confirms first ----------
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
    'join_enabled', v_team.join_enabled, 'require_approval', v_team.require_approval, 'membership', v_status,
    'players', case when v_team.join_enabled then v_players else '[]'::jsonb end
  );
end;
$$;

-- ---------- join: straight in unless the team asks for approval ----------
create or replace function public.request_join(
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
  v_status public.member_status;
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
    -- already on the team: nothing changes, and in particular no child links (staff do that)
    return jsonb_build_object('status', 'active', 'team_id', v_team.id, 'name', v_team.name, 'sport', v_team.sport);
  end if;
  if not v_team.join_enabled then
    raise exception 'the coach has turned this invite link off; ask for a new one' using errcode = 'P0005';
  end if;
  v_status := case when v_team.require_approval then 'pending'::public.member_status else 'active'::public.member_status end;
  if found then
    update public.team_members
      set status = v_status, requested_role = 'parent', role = 'parent', note = null,
          approved_by = null, approved_at = case when v_status = 'active' then now() end,
          contact_phone = coalesce(v_phone, contact_phone)
      where id = v_existing.id;
    v_member_id := v_existing.id;
  else
    insert into public.team_members (team_id, user_id, role, status, requested_role, contact_phone, approved_at)
    values (v_team.id, v_uid, 'parent', v_status, 'parent', v_phone, case when v_status = 'active' then now() end)
    returning id into v_member_id;
  end if;
  -- the children they picked: pending until a coach confirms (approval off) or approves (on)
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
  return jsonb_build_object('status', v_status::text, 'team_id', v_team.id, 'name', v_team.name, 'sport', v_team.sport);
end;
$$;

-- ---------- parents never manage their own links ----------
create or replace function public.request_guardian_link(p_player_id uuid, p_relationship text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'ask a coach to link your child from Settings → Members' using errcode = '42501';
end;
$$;

