-- Phase 4: atomic multi-row writes for lineups and roster changes that touch lineups.

-- Replace a plan (template when p_game_id is null, otherwise a live game's lineups).
-- p_periods: [{ "period_index": 0, "formation_name": "3-3",
--               "slots": [{ "position_role": "ST", "position_code": "LW", "player_id": uuid|null, "auto_picked": bool }, ...] }, ...]
-- Lineups not present in p_periods are deleted (period count shrank). Completed games are never touched.
create or replace function public.save_lineups(p_team_id uuid, p_game_id uuid default null, p_periods jsonb default '[]'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period jsonb;
  v_slot jsonb;
  v_lineup uuid;
  v_idx int;
  v_j int;
  v_status public.game_status;
begin
  if not public.is_staff(p_team_id) then
    raise exception 'only a coach or assistant can edit lineups' using errcode = '42501';
  end if;
  if p_game_id is not null then
    select g.status into v_status from public.games g where g.id = p_game_id and g.team_id = p_team_id;
    if v_status is null then
      raise exception 'game not found' using errcode = 'P0002';
    end if;
    if v_status = 'done' then
      raise exception 'a completed game cannot be changed' using errcode = '23514';
    end if;
  end if;
  if jsonb_typeof(p_periods) <> 'array' then
    raise exception 'periods must be an array' using errcode = '22023';
  end if;

  -- drop lineups beyond the new period count
  delete from public.lineups l
  where l.team_id = p_team_id and l.game_id is not distinct from p_game_id
    and l.period_index >= jsonb_array_length(p_periods);

  for v_period in select * from jsonb_array_elements(p_periods) loop
    v_idx := (v_period ->> 'period_index')::int;
    insert into public.lineups (team_id, game_id, period_index, formation_name)
    values (p_team_id, p_game_id, v_idx, coalesce(v_period ->> 'formation_name', ''))
    on conflict (team_id, game_id, period_index) do update set formation_name = excluded.formation_name
    returning id into v_lineup;
    if v_lineup is null then
      select id into v_lineup from public.lineups
      where team_id = p_team_id and game_id is not distinct from p_game_id and period_index = v_idx;
    end if;
    delete from public.lineup_slots where lineup_id = v_lineup;
    v_j := 0;
    for v_slot in select * from jsonb_array_elements(coalesce(v_period -> 'slots', '[]'::jsonb)) loop
      insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code, player_id, auto_picked)
      values (
        v_lineup, v_j,
        coalesce(v_slot ->> 'position_role', ''),
        coalesce(v_slot ->> 'position_code', ''),
        nullif(v_slot ->> 'player_id', '')::uuid,
        coalesce((v_slot ->> 'auto_picked')::boolean, false)
      );
      v_j := v_j + 1;
    end loop;
  end loop;
end;
$$;

-- Null a player out of the template and any live game (never completed games).
create or replace function public.clear_player_from_plans(p_player_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.lineup_slots s
  set player_id = null, auto_picked = false
  from public.lineups l
  left join public.games g on g.id = l.game_id
  where s.lineup_id = l.id
    and s.player_id = p_player_id
    and l.team_id = public.team_of_player(p_player_id)
    and (l.game_id is null or g.status = 'live');
$$;
revoke all on function public.clear_player_from_plans(uuid) from public;

-- Mark a player available/out for this game; marking out clears them from the current plan (legacy behaviour).
create or replace function public.set_player_available(p_player_id uuid, p_available boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid := public.team_of_player(p_player_id);
begin
  if v_team is null or not public.is_staff(v_team) then
    raise exception 'only a coach or assistant can change availability' using errcode = '42501';
  end if;
  update public.players set is_available = p_available, updated_by = (select auth.uid()) where id = p_player_id;
  if not p_available then
    perform public.clear_player_from_plans(p_player_id);
  end if;
end;
$$;

-- Soft-delete a player: past games keep their snapshot; the template and live game drop them.
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
  update public.players set archived_at = now(), updated_by = (select auth.uid()) where id = p_player_id and archived_at is null;
  perform public.clear_player_from_plans(p_player_id);
  update public.teams set last_batter_player_id = null where id = v_team and last_batter_player_id = p_player_id;
end;
$$;

revoke all on function public.save_lineups(uuid, uuid, jsonb) from public;
revoke all on function public.set_player_available(uuid, boolean) from public;
revoke all on function public.archive_player(uuid) from public;
grant execute on function
  public.save_lineups(uuid, uuid, jsonb),
  public.set_player_available(uuid, boolean),
  public.archive_player(uuid)
to authenticated, service_role;
