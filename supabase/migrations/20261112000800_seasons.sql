-- Seasons (D94): a coach (or a platform admin) starts a new season on the same team, in one
-- transaction: the new season becomes current; players marked not returning are archived with
-- rule 12 applied to their parents; the template lineup and its bench order are cleared. Everything
-- else carries over (returning players with numbers, details and contacts, parents, team settings,
-- skill tests and results, the board, the invite link). Not available while a game is live. A
-- platform admin can switch the current season back (set_current_season). Past seasons stay as
-- they were: stats and games are keyed by season_id.

create or replace function public.start_season(
  p_team_id uuid,
  p_name text,
  p_starts_on date default null,
  p_ends_on date default null,
  p_not_returning uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season uuid;
  v_pid uuid;
begin
  if not (public.is_coach(p_team_id) or public.is_platform_admin()) then
    raise exception 'only a coach can start a new season' using errcode = '42501';
  end if;
  if exists (select 1 from public.games g where g.team_id = p_team_id and g.status = 'live') then
    raise exception 'finish the game in progress before starting a new season' using errcode = 'P0006';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'give the season a name' using errcode = '22023';
  end if;
  if p_starts_on is not null and p_ends_on is not null and p_ends_on < p_starts_on then
    raise exception 'the season cannot end before it starts' using errcode = '22023';
  end if;

  update public.seasons set is_current = false where team_id = p_team_id and is_current;
  insert into public.seasons (team_id, name, starts_on, ends_on, is_current)
  values (p_team_id, left(trim(p_name), 40), p_starts_on, p_ends_on, true)
  returning id into v_season;

  foreach v_pid in array coalesce(p_not_returning, '{}') loop
    if public.team_of_player(v_pid) = p_team_id then
      perform public.archive_player_core(v_pid);
    end if;
  end loop;

  -- a clean template: every spot open, the bench back to roster order
  update public.lineup_slots s set player_id = null, auto_picked = false
    from public.lineups l
    where s.lineup_id = l.id and l.team_id = p_team_id and l.game_id is null;
  update public.lineups set bench_order = '{}' where team_id = p_team_id and game_id is null;

  return v_season;
end;
$$;
revoke all on function public.start_season(uuid, text, date, date, uuid[]) from public;
grant execute on function public.start_season(uuid, text, date, date, uuid[]) to authenticated, service_role;

-- Admin only: make an earlier season current again (a season started by mistake).
create or replace function public.set_current_season(p_team_id uuid, p_season_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.seasons s where s.id = p_season_id and s.team_id = p_team_id) then
    raise exception 'that season is not on this team' using errcode = 'P0002';
  end if;
  update public.seasons set is_current = false where team_id = p_team_id and is_current;
  update public.seasons set is_current = true where id = p_season_id;
end;
$$;
revoke all on function public.set_current_season(uuid, uuid) from public;
grant execute on function public.set_current_season(uuid, uuid) to authenticated, service_role;
