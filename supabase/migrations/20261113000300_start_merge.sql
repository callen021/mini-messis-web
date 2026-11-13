-- Start is kickoff (D109). "Start game" and "start the clock" were two taps; a coach who tapped
-- the first at the whistle lost the seconds until the second, and one who tapped it early had no
-- way back. Now start_game on a clock team sets the game live AND starts the clock in the same
-- transaction (clock_running_since = now(), the stretch limit per clock_limit_for, no safety
-- note), so the first tap is kickoff. Period mode is unchanged.
--
-- For a start that was too early there is clock_reset: in the first period, with the clock
-- paused and no score recorded, it puts the clock back to 0:00 and clears the minutes so far:
-- the period's ops are discarded (nothing from before the reset can be undone), closed first-
-- period stints are deleted, and every open one restarts at 0 as a fresh shift. The lineup row,
-- its slots and the bench queue stay as they stand, so the players on the field at the reset are
-- the starters. A reset at 0:00 with nothing to clear is allowed and harmless.

-- ---------- start_game: the clock starts with the game ----------
create or replace function public.start_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype;
  v_team_name text;
  v_mode public.time_mode;
  v_n int;
  v_tpl uuid;
  v_new uuid;
  i int;
  r record;
begin
  select * into v_g from public.games g where g.id = p_game_id;
  if not found or not public.is_staff(v_g.team_id) then
    raise exception 'only a coach or assistant can start a game' using errcode = '42501';
  end if;
  if v_g.status <> 'upcoming' then
    raise exception 'only an upcoming game can be started' using errcode = '22023';
  end if;
  if exists (select 1 from public.games g where g.team_id = v_g.team_id and g.status = 'live') then
    raise exception 'finish the current game first' using errcode = 'P0004';
  end if;
  select t.name, t.time_mode into v_team_name, v_mode from public.teams t where t.id = v_g.team_id;
  if v_mode = 'clock' then
    v_n := public.team_period_count(v_g.team_id);
    delete from public.lineups where team_id = v_g.team_id and game_id = p_game_id;
    select l.id into v_tpl from public.lineups l where l.team_id = v_g.team_id and l.game_id is null and l.period_index = 0;
    for i in 0..(v_n - 1) loop
      insert into public.lineups (team_id, game_id, period_index, formation_name, bench_order)
      select v_g.team_id, p_game_id, i, coalesce((select formation_name from public.lineups where id = v_tpl), ''),
             coalesce((select bench_order from public.lineups where id = v_tpl), '{}')
      returning id into v_new;
      insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code, player_id, auto_picked)
      select v_new, s.slot_index, s.position_role, s.position_code,
             case when i = 0 and p.id is not null and p.archived_at is null and p.is_available
                       and not public.rsvp_out_for_game(p_game_id, p.id) then s.player_id end,
             false
      from public.lineup_slots s
      left join public.players p on p.id = s.player_id
      where s.lineup_id = v_tpl;
      perform public.bench_normalize(v_new);
    end loop;
    update public.games
    set clock_period = 0, clock_seconds = 0, clock_running_since = null, clock_period_lengths = '{}'
    where id = p_game_id;
    for r in select s.* from public.lineup_slots s join public.lineups l on l.id = s.lineup_id
             where l.game_id = p_game_id and l.period_index = 0 and s.player_id is not null loop
      insert into public.stints (game_id, player_id, period_index, slot_index, position_role, position_code, clock_start)
      values (p_game_id, r.player_id, 0, r.slot_index, r.position_role, r.position_code, 0);
    end loop;
  else
    perform public.copy_lineups(v_g.team_id, null, p_game_id);
  end if;
  perform public.snapshot_game_players(p_game_id, v_g.team_id);
  update public.games set status = 'live', started_at = now(), team_name_snapshot = v_team_name where id = p_game_id;
  -- start is kickoff (D109): the clock runs from this moment, with the stretch's limit
  if v_mode = 'clock' then
    perform public.clock_start(p_game_id);
  end if;
end;
$$;

-- ---------- clock_reset: an early start goes back to 0:00 ----------
create or replace function public.clock_reset(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype := public.clock_game(p_game_id);   -- staff + live + clock mode, settled
begin
  if v_g.clock_period <> 0 then
    raise exception 'the clock can only be reset in the first period' using errcode = 'P0019';
  end if;
  if v_g.clock_running_since is not null then
    raise exception 'pause the clock before resetting it' using errcode = 'P0020';
  end if;
  if exists (select 1 from public.score_events e where e.game_id = p_game_id) then
    raise exception 'the clock cannot be reset once a score is recorded' using errcode = 'P0021';
  end if;
  update public.games
  set clock_seconds = 0, clock_running_since = null, clock_limit = null, clock_auto_paused = false
  where id = p_game_id;
  -- the period's changes are discarded with its minutes: nothing from before the reset is undoable
  delete from public.clock_ops where game_id = p_game_id and period_index = 0;
  -- the minutes played so far go; whoever is on the field now starts the game at 0:00
  delete from public.stints where game_id = p_game_id and period_index = 0 and clock_end is not null;
  update public.stints
  set clock_start = 0, continues = false, opened_by_op = null
  where game_id = p_game_id and period_index = 0 and clock_end is null;
end;
$$;
revoke all on function public.clock_reset(uuid) from public;
grant execute on function public.clock_reset(uuid) to authenticated, service_role;
