-- Rule 12 (D93): removing (archiving) a player removes any parent whose only linked child on the
-- team was that player, in the same transaction. A parent with another child stays; coaches and
-- assistants keep their staff role. parents_losing_access() previews who that would be so the
-- confirmation can name them. The player's history (games, stats) is kept as before.

-- ---------- rule 12: removing a player removes their parents ----------
-- Shared core with no permission check: archive_player (staff) and start_season (D94) call it.
create or replace function public.archive_player_core(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid := public.team_of_player(p_player_id);
  r record;
begin
  if v_team is null then
    return;
  end if;
  update public.players set archived_at = now(), updated_by = (select auth.uid())
    where id = p_player_id and archived_at is null;
  perform public.clear_player_from_plans(p_player_id);
  update public.teams set last_batter_player_id = null where id = v_team and last_batter_player_id = p_player_id;
  -- the bench queues of the template and any live game drop the player
  for r in
    select l.id from public.lineups l
    left join public.games g on g.id = l.game_id
    where l.team_id = v_team and (l.game_id is null or g.status = 'live')
  loop
    perform public.bench_normalize(r.id);
  end loop;
  -- parents whose only linked child on this team was this player lose their membership;
  -- a parent with another child stays; coaches and assistants keep their staff role
  for r in select g.user_id from public.player_guardians g where g.player_id = p_player_id loop
    if not exists (
      select 1 from public.player_guardians g2
      join public.players p2 on p2.id = g2.player_id
      where g2.user_id = r.user_id and p2.team_id = v_team and p2.archived_at is null and g2.player_id <> p_player_id
    ) then
      update public.team_members
        set status = 'removed'
        where team_id = v_team and user_id = r.user_id and role = 'parent' and status = 'active';
    end if;
  end loop;
  delete from public.player_guardians where player_id = p_player_id;
end;
$$;
revoke all on function public.archive_player_core(uuid) from public;

create or replace function public.archive_player(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid := public.team_of_player(p_player_id);
begin
  if v_team is null or not public.is_staff(v_team) then
    raise exception 'only a coach or assistant can remove players' using errcode = '42501';
  end if;
  perform public.archive_player_core(p_player_id);
end;
$$;

-- The parents who would lose access if these players were removed (for the confirmation text).
create or replace function public.parents_losing_access(p_player_ids uuid[])
returns table (user_id uuid, display_name text, children text[])
language sql
stable
security definer
set search_path = ''
as $$
  with scope as (
    select distinct p.team_id from public.players p where p.id = any (p_player_ids)
  ),
  linked as (
    select g.user_id, p.team_id, p.id as player_id, p.first_name
    from public.player_guardians g
    join public.players p on p.id = g.player_id
    where p.archived_at is null and p.team_id in (select team_id from scope)
  )
  select m.user_id,
         coalesce(nullif(pr.display_name, ''), split_part(u.email, '@', 1)),
         array_agg(distinct l.first_name order by l.first_name)
  from public.team_members m
  join linked l on l.user_id = m.user_id and l.team_id = m.team_id
  join auth.users u on u.id = m.user_id
  left join public.profiles pr on pr.id = m.user_id
  where m.status = 'active' and m.role = 'parent'
    and public.is_staff(m.team_id)
    and not exists (
      select 1 from linked l2
      where l2.user_id = m.user_id and l2.team_id = m.team_id and not (l2.player_id = any (p_player_ids))
    )
  group by m.user_id, pr.display_name, u.email;
$$;
revoke all on function public.parents_losing_access(uuid[]) from public;
grant execute on function public.parents_losing_access(uuid[]) to authenticated, service_role;
