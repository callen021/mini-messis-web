-- Platform admin: a flag on profiles that nothing in the app can set. An admin is treated as a coach
-- (and owner) on every team by the membership helpers, so every policy and RPC that checks
-- is_active_member / is_staff / is_coach / is_owner lets them through without touching the rules
-- for everyone else. Changing a team's sport is admin-only.

alter table public.profiles add column if not exists is_platform_admin boolean not null default false;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_platform_admin from public.profiles p where p.id = (select auth.uid())), false);
$$;
grant execute on function public.is_platform_admin() to authenticated, service_role;

-- Nobody flips the flag through the API: only the SQL editor / service role (no JWT) may change it.
create or replace function public.profiles_guard_admin_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_platform_admin is distinct from old.is_platform_admin and (select auth.uid()) is not null then
    raise exception 'is_platform_admin can only be changed in the SQL editor' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_guard_admin_flag on public.profiles;
create trigger profiles_guard_admin_flag before update on public.profiles
  for each row execute function public.profiles_guard_admin_flag();

-- An admin acts as a coach on every team.
create or replace function public.member_role_on(p_team_id uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_platform_admin() then 'coach'::public.member_role
    else (
      select m.role
      from public.team_members m
      where m.team_id = p_team_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
      limit 1
    )
  end;
$$;

create or replace function public.is_owner(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin() or exists (
    select 1 from public.teams t where t.id = p_team_id and t.owner_id = (select auth.uid())
  );
$$;

-- teams: sport changes are admin-only; the rest as before.
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
  if v_uid is null then
    return new;
  end if;
  if new.sport is distinct from old.sport and not public.is_platform_admin() then
    raise exception 'only a platform admin can change the sport' using errcode = '42501';
  end if;
  if new.name is distinct from old.name and not public.is_coach(old.id) then
    raise exception 'only a coach can rename the team' using errcode = '42501';
  end if;
  if new.archived_at is distinct from old.archived_at and not public.is_owner(old.id) then
    raise exception 'only the owner can archive the team' using errcode = '42501';
  end if;
  new.updated_by = v_uid;
  return new;
end;
$$;

-- ---------- admin console ----------
create or replace function public.admin_list_teams()
returns table (
  id uuid, name text, sport public.sport, owner_id uuid, owner_name text, owner_email text,
  coaches int, assistants int, parents int, pending int, players int,
  created_at timestamptz, archived_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.name, t.sport, t.owner_id,
         coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)),
         u.email::text,
         (select count(*)::int from public.team_members m where m.team_id = t.id and m.status = 'active' and m.role = 'coach'),
         (select count(*)::int from public.team_members m where m.team_id = t.id and m.status = 'active' and m.role = 'assistant'),
         (select count(*)::int from public.team_members m where m.team_id = t.id and m.status = 'active' and m.role = 'parent'),
         (select count(*)::int from public.team_members m where m.team_id = t.id and m.status = 'pending'),
         (select count(*)::int from public.players pl where pl.team_id = t.id and pl.archived_at is null),
         t.created_at, t.archived_at
  from public.teams t
  join auth.users u on u.id = t.owner_id
  left join public.profiles p on p.id = t.owner_id
  where public.is_platform_admin()
  order by t.archived_at nulls first, t.created_at desc;
$$;

create or replace function public.admin_list_users()
returns table (
  user_id uuid, display_name text, email text, created_at timestamptz, is_platform_admin boolean, teams jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id,
         coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)),
         u.email::text,
         u.created_at,
         coalesce(p.is_platform_admin, false),
         coalesce((
           select jsonb_agg(jsonb_build_object('team_id', t.id, 'name', t.name, 'sport', t.sport, 'role', m.role, 'status', m.status)
                            order by t.name)
           from public.team_members m join public.teams t on t.id = m.team_id
           where m.user_id = u.id and m.status <> 'removed'
         ), '[]'::jsonb)
  from auth.users u
  left join public.profiles p on p.id = u.id
  where public.is_platform_admin()
  order by u.created_at desc;
$$;

-- Admin only: an active membership for an existing account, by email.
create or replace function public.admin_add_member(p_team_id uuid, p_email text, p_role public.member_role)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin only' using errcode = '42501';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'no account with that email' using errcode = 'P0002';
  end if;
  insert into public.team_members (team_id, user_id, role, status, requested_role, approved_by, approved_at)
  values (p_team_id, v_user, p_role, 'active', p_role, (select auth.uid()), now())
  on conflict (team_id, user_id) do update
    set role = excluded.role, status = 'active', approved_by = excluded.approved_by, approved_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- Admin only: change a team's sport. Lineups (template and any live game), formations (team shape)
-- and skill tests reset for the new sport; players, games and members are kept. Tests with results
-- are hidden rather than deleted so history survives.
create or replace function public.admin_change_sport(
  p_team_id uuid,
  p_sport public.sport,
  p_side_size int,
  p_has_gk boolean,
  p_periods_count int,
  p_colors jsonb,
  p_template jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period jsonb;
  v_slot jsonb;
  v_lineup uuid;
  v_i int := 0;
  v_j int;
  v_test jsonb;
  v_order int;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin only' using errcode = '42501';
  end if;
  if p_sport = 'football' then
    raise exception 'football is not enabled yet' using errcode = '22023';
  end if;
  if jsonb_typeof(p_template) <> 'array' or jsonb_array_length(p_template) <> p_periods_count then
    raise exception 'template must have one lineup per period' using errcode = '22023';
  end if;

  update public.teams
  set sport = p_sport, side_size = p_side_size, has_gk = p_has_gk, periods_count = p_periods_count,
      colors = coalesce(p_colors, '{}'::jsonb), last_batter_player_id = null
  where id = p_team_id;

  -- lineups: template and live games go; completed games keep theirs as history
  delete from public.lineups l
  where l.team_id = p_team_id
    and (l.game_id is null or exists (select 1 from public.games g where g.id = l.game_id and g.status = 'live'));
  for v_period in select * from jsonb_array_elements(p_template) loop
    insert into public.lineups (team_id, game_id, period_index, formation_name)
    values (p_team_id, null, v_i, coalesce(v_period ->> 'formation_name', ''))
    returning id into v_lineup;
    v_j := 0;
    for v_slot in select * from jsonb_array_elements(coalesce(v_period -> 'slots', '[]'::jsonb)) loop
      insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code)
      values (v_lineup, v_j, coalesce(v_slot ->> 'position_role', ''), coalesce(v_slot ->> 'position_code', ''));
      v_j := v_j + 1;
    end loop;
    v_i := v_i + 1;
  end loop;

  -- skill tests: drop the ones without results, hide the ones with history, seed the new sport's set
  delete from public.skill_tests t
  where t.team_id = p_team_id and not exists (select 1 from public.skill_results r where r.skill_test_id = t.id);
  update public.skill_tests set is_active = false where team_id = p_team_id;
  select coalesce(max(sort_order), -1) + 1 into v_order from public.skill_tests where team_id = p_team_id;
  for v_test in select * from jsonb_array_elements(public.default_skill_tests(p_sport)) loop
    insert into public.skill_tests (team_id, key, name, instructions, metric, unit, has_sides, higher_is_better, attempts, sort_order, updated_by)
    values (p_team_id, v_test ->> 'key', v_test ->> 'name', coalesce(v_test ->> 'instructions', ''),
            (v_test ->> 'metric')::public.skill_metric, nullif(v_test ->> 'unit', ''),
            coalesce((v_test ->> 'has_sides')::boolean, false), coalesce((v_test ->> 'higher_is_better')::boolean, true),
            coalesce((v_test ->> 'attempts')::int, 5), v_order, (select auth.uid()))
    on conflict (team_id, key) do nothing;
    v_order := v_order + 1;
  end loop;
end;
$$;

revoke all on function public.admin_list_teams() from public;
revoke all on function public.admin_list_users() from public;
revoke all on function public.admin_add_member(uuid, text, public.member_role) from public;
revoke all on function public.admin_change_sport(uuid, public.sport, int, boolean, int, jsonb, jsonb) from public;
grant execute on function
  public.admin_list_teams(),
  public.admin_list_users(),
  public.admin_add_member(uuid, text, public.member_role),
  public.admin_change_sport(uuid, public.sport, int, boolean, int, jsonb, jsonb)
to authenticated, service_role;
