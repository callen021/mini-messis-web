-- Load example team (D90). The hosted API role (`authenticator`) preloads pg-safeupdate, which
-- refuses any DELETE without a WHERE clause; import_legacy_backup emptied its temp map table with
-- a bare `delete from _legacy_map`, so "Load example team" failed with "DELETE requires a WHERE
-- clause" (pgTAP runs as postgres and never saw it). The map is now truncated. The example team is
-- also restricted: a payload flagged `"example": true` is accepted only from a platform admin and
-- only onto a team with no players.

create or replace function public.import_legacy_backup(p_team_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_season uuid;
  v_player jsonb;
  v_game jsonb;
  v_period jsonb;
  v_slot jsonb;
  v_ev jsonb;
  v_snap jsonb;
  v_pid uuid;
  v_gid uuid;
  v_lineup uuid;
  v_i int;
  v_j int;
  v_players int := 0;
  v_games int := 0;
  v_events int := 0;
begin
  if not public.is_staff(p_team_id) then
    raise exception 'only a coach or assistant can import a backup' using errcode = '42501';
  end if;
  if coalesce((p_data ->> 'example')::boolean, false) then
    if not public.is_platform_admin() then
      raise exception 'only a platform admin can load the example team' using errcode = '42501';
    end if;
    if exists (select 1 from public.players p where p.team_id = p_team_id and p.archived_at is null) then
      raise exception 'the example team can only be loaded onto a team with no players' using errcode = 'P0008';
    end if;
  end if;
  create temp table if not exists _legacy_map (key text primary key, id uuid) on commit drop;
  truncate _legacy_map;  -- never a bare DELETE: pg-safeupdate refuses it on the API role

  if coalesce((p_data ->> 'replace')::boolean, false) then
    update public.teams set last_batter_player_id = null where id = p_team_id;
    delete from public.games where team_id = p_team_id;
    delete from public.lineups where team_id = p_team_id;
    delete from public.players where team_id = p_team_id;
  end if;

  select s.id into v_season from public.seasons s where s.team_id = p_team_id and s.is_current limit 1;
  if v_season is null then
    insert into public.seasons (team_id, name, starts_on, is_current)
    values (p_team_id, to_char(now(), 'YYYY') || ' season', current_date, true)
    returning id into v_season;
  end if;

  if p_data ? 'team' then
    update public.teams
    set side_size = coalesce((p_data -> 'team' ->> 'side_size')::int, side_size),
        has_gk = coalesce((p_data -> 'team' ->> 'has_gk')::boolean, has_gk),
        periods_count = coalesce((p_data -> 'team' ->> 'periods_count')::int, periods_count),
        colors = coalesce(p_data -> 'team' -> 'colors', colors)
    where id = p_team_id;
  end if;

  v_i := 0;
  for v_player in select * from jsonb_array_elements(coalesce(p_data -> 'players', '[]'::jsonb)) loop
    insert into public.players (team_id, first_name, jersey_number, is_available, batting_order, sort_order, updated_by)
    values (p_team_id, left(coalesce(nullif(trim(v_player ->> 'first_name'), ''), 'Player'), 40),
            nullif(left(v_player ->> 'jersey_number', 3), ''), coalesce((v_player ->> 'is_available')::boolean, true),
            (v_player ->> 'batting_order')::int, v_i, v_uid)
    returning id into v_pid;
    insert into _legacy_map (key, id) values (v_player ->> 'key', v_pid) on conflict do nothing;
    v_i := v_i + 1;
    v_players := v_players + 1;
  end loop;

  -- template
  if p_data ? 'template' then
    delete from public.lineups where team_id = p_team_id and game_id is null;
    v_i := 0;
    for v_period in select * from jsonb_array_elements(p_data -> 'template') loop
      insert into public.lineups (team_id, game_id, period_index, formation_name)
      values (p_team_id, null, v_i, coalesce(v_period ->> 'formation_name', ''))
      returning id into v_lineup;
      v_j := 0;
      for v_slot in select * from jsonb_array_elements(coalesce(v_period -> 'slots', '[]'::jsonb)) loop
        insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code, player_id, auto_picked)
        values (v_lineup, v_j, coalesce(v_slot ->> 'position_role', ''), coalesce(v_slot ->> 'position_code', ''),
                (select m.id from _legacy_map m where m.key = v_slot ->> 'player_key'),
                coalesce((v_slot ->> 'auto_picked')::boolean, false));
        v_j := v_j + 1;
      end loop;
      v_i := v_i + 1;
    end loop;
  end if;

  -- games
  for v_game in select * from jsonb_array_elements(coalesce(p_data -> 'games', '[]'::jsonb)) loop
    insert into public.games (team_id, season_id, opponent, game_date, status, created_at, started_at, finished_at, team_name_snapshot, updated_by)
    values (p_team_id, v_season, left(coalesce(nullif(v_game ->> 'opponent', ''), 'Opponent'), 40),
            coalesce((v_game ->> 'game_date')::date, current_date),
            coalesce((v_game ->> 'status')::public.game_status, 'done'),
            coalesce((v_game ->> 'created_at')::timestamptz, now()),
            (v_game ->> 'started_at')::timestamptz, (v_game ->> 'finished_at')::timestamptz,
            nullif(v_game ->> 'team_name', ''), v_uid)
    returning id into v_gid;
    v_games := v_games + 1;
    v_i := 0;
    for v_period in select * from jsonb_array_elements(coalesce(v_game -> 'lineups', '[]'::jsonb)) loop
      insert into public.lineups (team_id, game_id, period_index, formation_name)
      values (p_team_id, v_gid, v_i, coalesce(v_period ->> 'formation_name', ''))
      returning id into v_lineup;
      v_j := 0;
      for v_slot in select * from jsonb_array_elements(coalesce(v_period -> 'slots', '[]'::jsonb)) loop
        insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code, player_id, auto_picked)
        values (v_lineup, v_j, coalesce(v_slot ->> 'position_role', ''), coalesce(v_slot ->> 'position_code', ''),
                (select m.id from _legacy_map m where m.key = v_slot ->> 'player_key'),
                coalesce((v_slot ->> 'auto_picked')::boolean, false));
        v_j := v_j + 1;
      end loop;
      v_i := v_i + 1;
    end loop;
    for v_ev in select * from jsonb_array_elements(coalesce(v_game -> 'events', '[]'::jsonb)) loop
      insert into public.score_events (game_id, side, period_index, event_type, points, scorer_player_id, assist_player_id, occurred_at, created_by)
      values (v_gid, coalesce((v_ev ->> 'side')::public.score_side, 'us'), coalesce((v_ev ->> 'period_index')::int, 0),
              coalesce(v_ev ->> 'event_type', 'goal'), 1,
              (select m.id from _legacy_map m where m.key = v_ev ->> 'scorer_key'),
              (select m.id from _legacy_map m where m.key = v_ev ->> 'assist_key'),
              coalesce((v_ev ->> 'occurred_at')::timestamptz, now()), v_uid);
      v_events := v_events + 1;
    end loop;
    for v_snap in select * from jsonb_array_elements(coalesce(v_game -> 'players', '[]'::jsonb)) loop
      select m.id into v_pid from _legacy_map m where m.key = v_snap ->> 'key';
      if v_pid is not null then
        insert into public.game_players (game_id, player_id, name_snapshot, number_snapshot, available)
        values (v_gid, v_pid, coalesce(v_snap ->> 'name', ''), nullif(v_snap ->> 'number', ''), true)
        on conflict do nothing;
      end if;
    end loop;
    if nullif(v_game ->> 'notes', '') is not null then
      insert into public.game_coach_notes (game_id, notes) values (v_gid, left(v_game ->> 'notes', 4000));
    end if;
  end loop;

  if nullif(p_data ->> 'last_batter_key', '') is not null then
    update public.teams set last_batter_player_id = (select m.id from _legacy_map m where m.key = p_data ->> 'last_batter_key')
    where id = p_team_id;
  end if;

  return jsonb_build_object('players', v_players, 'games', v_games, 'events', v_events);
end;
$$;
