-- Mid-game formation change (D108). A soccer coach can change the shape while the clock is
-- paused and has run (at 0:00 the client keeps using clock_set_lineup): the same players stay on
-- the field, each keeps playing, only the spots are redrawn. Playing time is unbroken: every open
-- stint closes at the change and reopens at the same second in the player's new spot with
-- `continues = true`, so the stats add up as before and nothing counts as a new shift. The op is
-- undoable like a sub; the next period carries the new shape; finishing still writes the KICKOFF
-- formation and the kickoff starters to the template, so a tactical change during a game never
-- rewrites next week's plan. formation_changes() lists the changes for the game page.

-- ---------- ops carry the clock second, and a formation op remembers the shape it replaced ----------
alter table public.clock_ops
  add column clock_seconds int,
  add column formation_before text,
  add column slots_before jsonb;
comment on column public.clock_ops.clock_seconds is 'Period second the op happened at (D108). Null on rows older than D108.';
comment on column public.clock_ops.formation_before is 'formation op: the formation name in force before the change (D108).';
comment on column public.clock_ops.slots_before is 'formation op: the period''s lineup_slots before the change, ordered by slot_index (D108).';

alter table public.clock_ops drop constraint if exists clock_ops_kind_check;
alter table public.clock_ops add constraint clock_ops_kind_check
  check (kind in ('sub', 'swap', 'empty', 'fill', 'lineup', 'end_period', 'bench', 'formation'));

-- A stint that continues the previous one of the same player across a formation change.
alter table public.stints add column continues boolean not null default false;
comment on column public.stints.continues is 'This stint continues the player''s previous one after a formation change: not a new shift (D108).';

-- every new op is stamped with the period second it happened at (callers settle the clock first
-- through clock_game, so the capped reading and the raw one agree)
create or replace function public.clock_new_op(p_game_id uuid, p_period int, p_kind text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.clock_ops (game_id, period_index, kind, bench_before, clock_seconds)
  values (p_game_id, p_period, p_kind,
          (select l.bench_order from public.lineups l where l.game_id = p_game_id and l.period_index = p_period),
          (select public.clock_elapsed(g.clock_seconds, g.clock_running_since, g.clock_limit) from public.games g where g.id = p_game_id))
  returning id;
$$;

-- ---------- the change ----------
-- p_slots: [{ "position_role", "position_code", "player_id" | null }, ...] ordered by slot index;
-- the array is the new formation's positions, and its players must be exactly the players on the field.
create or replace function public.clock_change_formation(p_game_id uuid, p_formation_name text, p_slots jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype := public.clock_game(p_game_id);   -- staff + live + clock mode, settled
  v_p int := v_g.clock_period;
  v_sport public.sport;
  v_at int;
  v_lineup uuid;
  v_on uuid[];
  v_new uuid[];
  v_op uuid;
  v_s public.stints%rowtype;
  v_slot jsonb;
  v_j int := 0;
  v_pid uuid;
begin
  if v_p >= public.team_period_count(v_g.team_id) then
    raise exception 'the game clock has reached full time' using errcode = 'P0012';
  end if;
  select t.sport into v_sport from public.teams t where t.id = v_g.team_id;
  if v_sport <> 'soccer' then
    raise exception 'formations can only be changed mid-game for soccer' using errcode = 'P0015';
  end if;
  if v_g.clock_running_since is not null then
    raise exception 'pause the clock to change the formation' using errcode = 'P0016';
  end if;
  v_at := public.clock_elapsed(v_g.clock_seconds, v_g.clock_running_since);
  if v_at <= 0 then
    raise exception 'use the lineup edit while the clock is at zero' using errcode = 'P0017';
  end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) = 0 then
    raise exception 'a formation needs its positions' using errcode = '22023';
  end if;
  -- the same players, each once
  v_new := array(select (e ->> 'player_id')::uuid from jsonb_array_elements(p_slots) as e
                 where nullif(e ->> 'player_id', '') is not null order by 1);
  if (select count(distinct x) from unnest(v_new) as x) <> coalesce(array_length(v_new, 1), 0) then
    raise exception 'a player can only hold one spot' using errcode = '22023';
  end if;
  v_on := array(select s.player_id from public.stints s
                where s.game_id = p_game_id and s.period_index = v_p and s.clock_end is null order by 1);
  if v_new <> v_on then
    raise exception 'a formation change keeps the same players on the field' using errcode = 'P0018';
  end if;
  select l.id into v_lineup from public.lineups l where l.game_id = p_game_id and l.period_index = v_p;
  if v_lineup is null then
    raise exception 'no lineup for this period' using errcode = 'P0011';
  end if;

  v_op := public.clock_new_op(p_game_id, v_p, 'formation');
  update public.clock_ops
  set formation_before = (select l.formation_name from public.lineups l where l.id = v_lineup),
      slots_before = (select coalesce(jsonb_agg(jsonb_build_object(
                        'slot_index', s.slot_index, 'position_role', s.position_role, 'position_code', s.position_code,
                        'player_id', s.player_id, 'auto_picked', s.auto_picked) order by s.slot_index), '[]'::jsonb)
                      from public.lineup_slots s where s.lineup_id = v_lineup)
  where id = v_op;

  -- everyone on the field: close at the change (a stint opened at this very second while paused
  -- is zero-length and gets deleted onto the op instead), then reopen in the new spot
  for v_s in select * from public.stints s where s.game_id = p_game_id and s.period_index = v_p and s.clock_end is null loop
    perform public.clock_close_stint(v_s, v_at, v_op);
  end loop;
  update public.lineups set formation_name = p_formation_name where id = v_lineup;
  delete from public.lineup_slots where lineup_id = v_lineup;
  for v_slot in select * from jsonb_array_elements(p_slots) loop
    v_pid := nullif(v_slot ->> 'player_id', '')::uuid;
    insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code, player_id, auto_picked)
    values (v_lineup, v_j, coalesce(v_slot ->> 'position_role', ''), coalesce(v_slot ->> 'position_code', ''), v_pid, false);
    if v_pid is not null then
      insert into public.stints (game_id, player_id, period_index, slot_index, position_role, position_code, clock_start, opened_by_op, continues)
      values (p_game_id, v_pid, v_p, v_j, coalesce(v_slot ->> 'position_role', ''), coalesce(v_slot ->> 'position_code', ''), v_at, v_op, true);
    end if;
    v_j := v_j + 1;
  end loop;
  -- the bench is the same players as before; keep the queue honest all the same
  perform public.bench_normalize(v_lineup);
end;
$$;
revoke all on function public.clock_change_formation(uuid, text, jsonb) from public;
grant execute on function public.clock_change_formation(uuid, text, jsonb) to authenticated, service_role;

-- ---------- undo: a formation op also puts the shape back ----------
create or replace function public.clock_undo(p_game_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype := public.clock_game(p_game_id);
  v_op public.clock_ops%rowtype;
  v_row jsonb;
  v_lineup uuid;
begin
  -- the latest change still in effect (undo steps back through the period, D79)
  select * into v_op from public.clock_ops o where o.game_id = p_game_id and o.undone_at is null order by o.seq desc limit 1;
  if not found or v_op.kind = 'end_period' or v_op.period_index <> v_g.clock_period then
    raise exception 'nothing to undo' using errcode = 'P0015';
  end if;
  delete from public.stints where opened_by_op = v_op.id;
  update public.stints set clock_end = null, closed_by_op = null where closed_by_op = v_op.id;
  for v_row in select * from jsonb_array_elements(v_op.deleted_stints) loop
    insert into public.stints (id, game_id, player_id, period_index, slot_index, position_role, position_code, clock_start, clock_end, opened_by_op, created_at, created_by, continues)
    values ((v_row ->> 'id')::uuid, p_game_id, (v_row ->> 'player_id')::uuid, (v_row ->> 'period_index')::int,
            (v_row ->> 'slot_index')::int, v_row ->> 'position_role', v_row ->> 'position_code',
            (v_row ->> 'clock_start')::int, null, nullif(v_row ->> 'opened_by_op', '')::uuid,
            (v_row ->> 'created_at')::timestamptz, nullif(v_row ->> 'created_by', '')::uuid,
            coalesce((v_row ->> 'continues')::boolean, false));
  end loop;
  update public.clock_ops set undone_at = now() where id = v_op.id;
  if v_op.kind = 'formation' then
    -- the shape as it was: name and spots (players are mirrored from the reopened stints below)
    select l.id into v_lineup from public.lineups l where l.game_id = p_game_id and l.period_index = v_g.clock_period;
    if v_lineup is not null then
      update public.lineups set formation_name = coalesce(v_op.formation_before, formation_name) where id = v_lineup;
      delete from public.lineup_slots where lineup_id = v_lineup;
      insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code, player_id, auto_picked)
      select v_lineup, (e ->> 'slot_index')::int, coalesce(e ->> 'position_role', ''), coalesce(e ->> 'position_code', ''),
             null, false
      from jsonb_array_elements(coalesce(v_op.slots_before, '[]'::jsonb)) as e;
    end if;
  end if;
  if v_op.bench_before is not null then
    update public.lineups set bench_order = v_op.bench_before where game_id = p_game_id and period_index = v_g.clock_period;
  end if;
  perform public.clock_sync_lineup(p_game_id, v_g.clock_period);
  return v_op.kind;
end;
$$;

-- ---------- end of period: the next period starts in the shape this one ended in ----------
create or replace function public.clock_end_period(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype := public.clock_game(p_game_id);
  v_n int := public.team_period_count(v_g.team_id);
  v_at int := public.clock_elapsed(v_g.clock_seconds, v_g.clock_running_since);
  v_p int := v_g.clock_period;
  v_op uuid;
  v_s public.stints%rowtype;
  v_lengths int[] := v_g.clock_period_lengths;
  v_on jsonb := (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.stints s where s.game_id = p_game_id and s.clock_end is null);
  v_row jsonb;
  v_cur uuid;
  v_next uuid;
begin
  if v_p >= v_n then
    raise exception 'the game clock has reached full time' using errcode = 'P0012';
  end if;
  v_op := public.clock_new_op(p_game_id, v_p, 'end_period');
  for v_s in select * from public.stints s where s.game_id = p_game_id and s.clock_end is null loop
    perform public.clock_close_stint(v_s, v_at, v_op);
  end loop;
  v_lengths[v_p + 1] := v_at;
  update public.games
  set clock_period = v_p + 1, clock_seconds = 0, clock_running_since = null, clock_period_lengths = v_lengths
  where id = p_game_id;
  if v_p + 1 < v_n then
    -- the next period's row takes this period's formation and spots (a mid-game change carries over, D108)
    select l.id into v_cur from public.lineups l where l.game_id = p_game_id and l.period_index = v_p;
    select l.id into v_next from public.lineups l where l.game_id = p_game_id and l.period_index = v_p + 1;
    if v_cur is not null and v_next is not null then
      update public.lineups n set formation_name = c.formation_name, bench_order = c.bench_order
      from public.lineups c where n.id = v_next and c.id = v_cur;
      delete from public.lineup_slots where lineup_id = v_next;
      insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code, player_id, auto_picked)
      select v_next, s.slot_index, s.position_role, s.position_code, null, false
      from public.lineup_slots s where s.lineup_id = v_cur;
    end if;
    -- the players who ended this period start the next, in the same spots, at zero
    for v_row in select * from jsonb_array_elements(v_on) loop
      perform public.clock_open_stint(p_game_id, (v_row ->> 'player_id')::uuid, v_p + 1, (v_row ->> 'slot_index')::int,
                                      v_row ->> 'position_role', v_row ->> 'position_code', 0, v_op);
    end loop;
    perform public.clock_sync_lineup(p_game_id, v_p + 1);
  end if;
end;
$$;

-- ---------- finish: the template gets the KICKOFF shape and the kickoff starters ----------
create or replace function public.finish_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype;
  v_mode public.time_mode;
  v_at int;
  v_lengths int[];
  v_kick_name text;
  v_kick_slots jsonb;
  r record;
begin
  select * into v_g from public.games g where g.id = p_game_id;
  if not found or not public.is_staff(v_g.team_id) then
    raise exception 'only a coach or assistant can finish a game' using errcode = '42501';
  end if;
  if v_g.status <> 'live' then
    raise exception 'only a live game can be finished' using errcode = '22023';
  end if;
  select t.time_mode into v_mode from public.teams t where t.id = v_g.team_id;
  perform public.clock_settle(p_game_id);
  select * into v_g from public.games g where g.id = p_game_id;
  perform public.snapshot_game_players(p_game_id, v_g.team_id);
  if v_mode = 'clock' then
    v_at := public.clock_elapsed(v_g.clock_seconds, v_g.clock_running_since);
    v_lengths := v_g.clock_period_lengths;
    if v_g.clock_period < public.team_period_count(v_g.team_id) and v_at > 0 then
      v_lengths[v_g.clock_period + 1] := v_at;
    end if;
    update public.stints set clock_end = v_at where game_id = p_game_id and clock_end is null and clock_start < v_at;
    delete from public.stints where game_id = p_game_id and clock_end is null;
    update public.games
    set status = 'done', finished_at = now(), clock_seconds = v_at, clock_running_since = null, clock_period_lengths = v_lengths
    where id = p_game_id;
    -- the kickoff shape: what the earliest first-period formation change replaced, else the
    -- first period's row as it stands (D108)
    select o.formation_before, o.slots_before into v_kick_name, v_kick_slots
    from public.clock_ops o
    where o.game_id = p_game_id and o.period_index = 0 and o.kind = 'formation' and o.undone_at is null
    order by o.seq limit 1;
    if not found then
      select l.formation_name,
             (select coalesce(jsonb_agg(jsonb_build_object('slot_index', s.slot_index, 'position_role', s.position_role, 'position_code', s.position_code) order by s.slot_index), '[]'::jsonb)
              from public.lineup_slots s where s.lineup_id = l.id)
      into v_kick_name, v_kick_slots
      from public.lineups l where l.game_id = p_game_id and l.period_index = 0;
    end if;
    -- template := the starters (the kickoff spots, each with the player who began the game
    -- there), written into every template period
    for r in select l.id from public.lineups l where l.team_id = v_g.team_id and l.game_id is null loop
      update public.lineups set formation_name = coalesce(v_kick_name, formation_name) where id = r.id;
      delete from public.lineup_slots where lineup_id = r.id;
      insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code, player_id, auto_picked)
      select r.id, (e ->> 'slot_index')::int, coalesce(e ->> 'position_role', ''), coalesce(e ->> 'position_code', ''),
             (select st.player_id from public.stints st
              where st.game_id = p_game_id and st.period_index = 0 and st.clock_start = 0 and not st.continues
                and st.slot_index = (e ->> 'slot_index')::int
              order by st.created_at limit 1),
             false
      from jsonb_array_elements(coalesce(v_kick_slots, '[]'::jsonb)) as e;
    end loop;
  else
    update public.games set status = 'done', finished_at = now() where id = p_game_id;
    perform public.copy_lineups(v_g.team_id, p_game_id, null);
  end if;
end;
$$;

-- ---------- the game page: formation changes in order ----------
-- to_formation is the shape in force after the op: what the next change in the period replaced,
-- else the period's current formation. Active members of the team only; nothing otherwise.
create or replace function public.formation_changes(p_game_id uuid)
returns table (period_index int, clock_seconds int, from_formation text, to_formation text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.period_index, o.clock_seconds, o.formation_before,
         coalesce(
           (select n.formation_before from public.clock_ops n
            where n.game_id = o.game_id and n.period_index = o.period_index and n.kind = 'formation'
              and n.undone_at is null and n.seq > o.seq
            order by n.seq limit 1),
           (select l.formation_name from public.lineups l where l.game_id = o.game_id and l.period_index = o.period_index))
  from public.clock_ops o
  where o.game_id = p_game_id and o.kind = 'formation' and o.undone_at is null
    and public.is_active_member(public.team_of_game(p_game_id))
  order by o.seq;
$$;
revoke all on function public.formation_changes(uuid) from public;
grant execute on function public.formation_changes(uuid) to authenticated, service_role;
