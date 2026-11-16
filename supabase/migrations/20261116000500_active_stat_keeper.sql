-- One active stat keeper per live game (D120). Only one person logs scores and stats in a live
-- game at a time: the coach who starts the game is the active keeper (`games.keeper_user_id`,
-- with the name snapshotted for the game bar); a granted stat keeper takes over with
-- `keep_stats`, which hides the score and stat buttons for everyone else, coaches included; any
-- coach or assistant takes it back the same way. `can_log_stats` enforces it in the write
-- policies of `score_events` and `stat_events`, so it holds outside the app too. Once the game
-- is over the staff edit the log as before.

alter table public.games
  add column keeper_user_id uuid references auth.users(id) on delete set null,
  add column keeper_name text;

-- the name a member goes by: the profile's display name, else the local part of the email
create or replace function public.member_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1))
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = p_user_id;
$$;
revoke all on function public.member_display_name(uuid) from public;
grant execute on function public.member_display_name(uuid) to authenticated, service_role;

-- who may log: while the game is live, the active keeper alone (a coach, an assistant or a
-- granted stat keeper); a live game without one falls to the staff; afterwards the staff
create or replace function public.can_log_stats(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when g.status = 'live' then
        (public.is_staff(g.team_id) or public.is_stat_keeper(g.team_id))
        and (g.keeper_user_id = (select auth.uid())
             or (g.keeper_user_id is null and public.is_staff(g.team_id)))
      else public.is_staff(g.team_id)
    end
    from public.games g where g.id = p_game_id
  ), false);
$$;

-- take over (or take back) the scores and stats of a live game
create or replace function public.keep_stats(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype;
begin
  select * into v_g from public.games g where g.id = p_game_id;
  if not found or not (public.is_staff(v_g.team_id) or public.is_stat_keeper(v_g.team_id)) then
    raise exception 'only a coach, an assistant or a stat keeper can keep stats' using errcode = '42501';
  end if;
  if v_g.status <> 'live' then
    raise exception 'stats are kept during a live game' using errcode = '22023';
  end if;
  update public.games
  set keeper_user_id = (select auth.uid()), keeper_name = public.member_display_name((select auth.uid()))
  where id = p_game_id;
end;
$$;
revoke all on function public.keep_stats(uuid) from public;
grant execute on function public.keep_stats(uuid) to authenticated, service_role;

-- ---------- start_game: the coach who starts the game keeps its stats ----------
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
  update public.games
  set status = 'live', started_at = now(), team_name_snapshot = v_team_name,
      -- the one who starts the game keeps its stats (D120)
      keeper_user_id = (select auth.uid()), keeper_name = public.member_display_name((select auth.uid()))
  where id = p_game_id;
  -- start is kickoff (D109): the clock runs from this moment, with the stretch's limit
  if v_mode = 'clock' then
    perform public.clock_start(p_game_id);
  end if;
end;
$$;
