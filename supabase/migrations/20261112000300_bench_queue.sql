-- The bench is a queue, not a sort (D79). Every lineup row (a period card in period mode, a clock
-- period of a game, the template) keeps an explicit `bench_order`: the available players who are
-- not on the field, left to right, the leftmost next in line. A player who comes off is appended
-- at the right; one who goes on is removed and the gap closes; a player marked out leaves the
-- queue and joins the right end when marked back in. Undo restores the previous order too.

alter table public.lineups add column if not exists bench_order uuid[] not null default '{}';
alter table public.clock_ops add column if not exists bench_before uuid[];

-- Keep a lineup's queue honest: drop anyone on the field, archived or marked out, keep the rest in
-- their order, then append every other available player in roster order.
create or replace function public.bench_normalize(p_lineup_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
  v_order uuid[];
  v_kept uuid[] := '{}';
  v_id uuid;
begin
  select l.team_id, l.bench_order into v_team, v_order from public.lineups l where l.id = p_lineup_id;
  if v_team is null then return; end if;
  foreach v_id in array coalesce(v_order, '{}'::uuid[]) loop
    if not (v_id = any (v_kept))
       and exists (select 1 from public.players p where p.id = v_id and p.team_id = v_team and p.archived_at is null and p.is_available)
       and not exists (select 1 from public.lineup_slots s where s.lineup_id = p_lineup_id and s.player_id = v_id) then
      v_kept := v_kept || v_id;
    end if;
  end loop;
  for v_id in
    select p.id from public.players p
    where p.team_id = v_team and p.archived_at is null and p.is_available
      and not (p.id = any (v_kept))
      and not exists (select 1 from public.lineup_slots s where s.lineup_id = p_lineup_id and s.player_id = p.id)
    order by p.sort_order, p.created_at, p.id
  loop
    v_kept := v_kept || v_id;
  end loop;
  update public.lineups set bench_order = v_kept where id = p_lineup_id and bench_order is distinct from v_kept;
end;
$$;
revoke all on function public.bench_normalize(uuid) from public;

-- Remove some players from a queue and append others at the right (then normalize).
create or replace function public.bench_apply(p_lineup_id uuid, p_remove uuid[], p_append uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order uuid[];
  v_id uuid;
begin
  select coalesce(l.bench_order, '{}') into v_order from public.lineups l where l.id = p_lineup_id;
  if v_order is null then return; end if;
  v_order := array(select x from unnest(v_order) as x where not (x = any (coalesce(p_remove, '{}'::uuid[]))));
  foreach v_id in array coalesce(p_append, '{}'::uuid[]) loop
    if not (v_id = any (v_order)) then v_order := v_order || v_id; end if;
  end loop;
  update public.lineups set bench_order = v_order where id = p_lineup_id;
  perform public.bench_normalize(p_lineup_id);
end;
$$;
revoke all on function public.bench_apply(uuid, uuid[], uuid[]) from public;

create or replace function public.lineup_of(p_game_id uuid, p_period int)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.id from public.lineups l where l.game_id = p_game_id and l.period_index = p_period;
$$;
revoke all on function public.lineup_of(uuid, int) from public;

-- ---------- save_lineups: the payload may carry "bench_order" per period ----------
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
  v_bench uuid[];
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
    if v_period ? 'bench_order' and jsonb_typeof(v_period -> 'bench_order') = 'array' then
      v_bench := array(select x::uuid from jsonb_array_elements_text(v_period -> 'bench_order') as x where x <> '');
      update public.lineups set bench_order = v_bench where id = v_lineup;
    end if;
    perform public.bench_normalize(v_lineup);
  end loop;
end;
$$;

-- ---------- copy_lineups carries the queue ----------
create or replace function public.copy_lineups(p_team_id uuid, p_from_game uuid, p_to_game uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_new uuid;
begin
  delete from public.lineups where team_id = p_team_id and game_id is not distinct from p_to_game;
  for r in select * from public.lineups l where l.team_id = p_team_id and l.game_id is not distinct from p_from_game order by l.period_index loop
    insert into public.lineups (team_id, game_id, period_index, formation_name, bench_order)
    values (p_team_id, p_to_game, r.period_index, r.formation_name, r.bench_order)
    returning id into v_new;
    insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code, player_id, auto_picked)
    select v_new, s.slot_index, s.position_role, s.position_code,
           case when p.id is not null and p.archived_at is null and p.is_available then s.player_id end,
           s.auto_picked and p.id is not null and p.archived_at is null and p.is_available
    from public.lineup_slots s
    left join public.players p on p.id = s.player_id
    where s.lineup_id = r.id;
    perform public.bench_normalize(v_new);
  end loop;
end;
$$;

-- ---------- availability keeps every live queue and the template honest ----------
create or replace function public.set_player_available(p_player_id uuid, p_available boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid := public.team_of_player(p_player_id);
  r record;
begin
  if v_team is null or not public.is_staff(v_team) then
    raise exception 'only a coach or assistant can change availability' using errcode = '42501';
  end if;
  update public.players set is_available = p_available, updated_by = (select auth.uid()) where id = p_player_id;
  if not p_available then
    perform public.clear_player_from_plans(p_player_id);
  end if;
  for r in select l.id from public.lineups l
           left join public.games g on g.id = l.game_id
           where l.team_id = v_team and (l.game_id is null or g.status = 'live') loop
    perform public.bench_normalize(r.id);
  end loop;
end;
$$;

-- ---------- the clock functions maintain the queue and undo restores it ----------
create or replace function public.clock_new_op(p_game_id uuid, p_period int, p_kind text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.clock_ops (game_id, period_index, kind, bench_before)
  values (p_game_id, p_period, p_kind, (select l.bench_order from public.lineups l where l.game_id = p_game_id and l.period_index = p_period))
  returning id;
$$;

create or replace function public.clock_sync_lineup(p_game_id uuid, p_period int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lineup uuid;
begin
  select l.id into v_lineup from public.lineups l where l.game_id = p_game_id and l.period_index = p_period;
  if v_lineup is null then return; end if;
  update public.lineup_slots set player_id = null, auto_picked = false where lineup_id = v_lineup;
  update public.lineup_slots s
  set player_id = (select st.player_id from public.stints st
                   where st.game_id = p_game_id and st.period_index = p_period and st.slot_index = s.slot_index and st.clock_end is null),
      auto_picked = false
  where s.lineup_id = v_lineup;
  perform public.bench_normalize(v_lineup);
end;
$$;

create or replace function public.clock_sub(p_game_id uuid, p_off uuid, p_on uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype := public.clock_game(p_game_id);
  v_at int := public.clock_elapsed(v_g.clock_seconds, v_g.clock_running_since);
  v_off public.stints%rowtype := public.clock_open_stint_of(p_game_id, p_off);
  v_op uuid;
begin
  if p_off = p_on then
    raise exception 'pick two different players' using errcode = '22023';
  end if;
  perform public.clock_check_bench(v_g, p_on);
  v_op := public.clock_new_op(p_game_id, v_g.clock_period, 'sub');
  perform public.clock_close_stint(v_off, v_at, v_op);
  perform public.clock_open_stint(p_game_id, p_on, v_off.period_index, v_off.slot_index, v_off.position_role, v_off.position_code, v_at, v_op);
  perform public.bench_apply(public.lineup_of(p_game_id, v_g.clock_period), array[p_on], array[p_off]);
  perform public.clock_sync_lineup(p_game_id, v_g.clock_period);
end;
$$;

create or replace function public.clock_empty(p_game_id uuid, p_off uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype := public.clock_game(p_game_id);
  v_at int := public.clock_elapsed(v_g.clock_seconds, v_g.clock_running_since);
  v_off public.stints%rowtype := public.clock_open_stint_of(p_game_id, p_off);
  v_op uuid;
begin
  v_op := public.clock_new_op(p_game_id, v_g.clock_period, 'empty');
  perform public.clock_close_stint(v_off, v_at, v_op);
  perform public.bench_apply(public.lineup_of(p_game_id, v_g.clock_period), '{}', array[p_off]);
  perform public.clock_sync_lineup(p_game_id, v_g.clock_period);
end;
$$;

create or replace function public.clock_fill(p_game_id uuid, p_player uuid, p_slot int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype := public.clock_game(p_game_id);
  v_at int := public.clock_elapsed(v_g.clock_seconds, v_g.clock_running_since);
  v_p int := v_g.clock_period;
  v_cur public.stints%rowtype;
  v_role text;
  v_code text;
  v_op uuid;
begin
  if exists (select 1 from public.stints s where s.game_id = p_game_id and s.period_index = v_p and s.slot_index = p_slot and s.clock_end is null) then
    raise exception 'that spot is taken' using errcode = 'P0013';
  end if;
  select o_role, o_code into v_role, v_code from public.clock_spot(p_game_id, v_p, p_slot);
  select * into v_cur from public.stints s where s.game_id = p_game_id and s.player_id = p_player and s.clock_end is null;
  v_op := public.clock_new_op(p_game_id, v_p, 'fill');
  if found then
    perform public.clock_close_stint(v_cur, v_at, v_op);
  else
    perform public.clock_check_bench(v_g, p_player);
  end if;
  perform public.clock_open_stint(p_game_id, p_player, v_p, p_slot, v_role, v_code, v_at, v_op);
  perform public.bench_apply(public.lineup_of(p_game_id, v_p), array[p_player], '{}');
  perform public.clock_sync_lineup(p_game_id, v_p);
end;
$$;

create or replace function public.clock_set_lineup(p_game_id uuid, p_formation_name text, p_slots jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype := public.clock_game(p_game_id);
  v_p int := v_g.clock_period;
  v_lineup uuid;
  v_slot jsonb;
  v_j int := 0;
  v_pid uuid;
  v_op uuid;
  v_s public.stints%rowtype;
  v_was uuid[];
  v_now uuid[] := '{}';
begin
  if public.clock_elapsed(v_g.clock_seconds, v_g.clock_running_since) > 0 then
    raise exception 'the lineup can only be rewritten before the clock starts' using errcode = 'P0014';
  end if;
  if v_p >= public.team_period_count(v_g.team_id) then
    raise exception 'the game clock has reached full time' using errcode = 'P0012';
  end if;
  v_op := public.clock_new_op(p_game_id, v_p, 'lineup');
  v_was := array(select s.player_id from public.stints s where s.game_id = p_game_id and s.period_index = v_p and s.clock_end is null order by s.slot_index);
  for v_s in select * from public.stints s where s.game_id = p_game_id and s.period_index = v_p and s.clock_end is null loop
    perform public.clock_close_stint(v_s, 0, v_op);
  end loop;
  select l.id into v_lineup from public.lineups l where l.game_id = p_game_id and l.period_index = v_p;
  if v_lineup is null then
    insert into public.lineups (team_id, game_id, period_index, formation_name)
    values (v_g.team_id, p_game_id, v_p, p_formation_name) returning id into v_lineup;
  else
    update public.lineups set formation_name = p_formation_name where id = v_lineup;
  end if;
  delete from public.lineup_slots where lineup_id = v_lineup;
  for v_slot in select * from jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) loop
    v_pid := nullif(v_slot ->> 'player_id', '')::uuid;
    insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code, player_id, auto_picked)
    values (v_lineup, v_j, coalesce(v_slot ->> 'position_role', ''), coalesce(v_slot ->> 'position_code', ''), v_pid,
            coalesce((v_slot ->> 'auto_picked')::boolean, false));
    if v_pid is not null then
      perform public.clock_check_bench(v_g, v_pid);
      perform public.clock_open_stint(p_game_id, v_pid, v_p, v_j, coalesce(v_slot ->> 'position_role', ''), coalesce(v_slot ->> 'position_code', ''), 0, v_op);
      v_now := v_now || v_pid;
    end if;
    v_j := v_j + 1;
  end loop;
  -- whoever left the field joins the right end, in the order they stood; whoever came on leaves the queue
  perform public.bench_apply(v_lineup, v_now, array(select x from unnest(v_was) as x where not (x = any (v_now))));
end;
$$;

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
    for v_row in select * from jsonb_array_elements(v_on) loop
      perform public.clock_open_stint(p_game_id, (v_row ->> 'player_id')::uuid, v_p + 1, (v_row ->> 'slot_index')::int,
                                      v_row ->> 'position_role', v_row ->> 'position_code', 0, v_op);
    end loop;
    -- the queue carries over as it stands
    update public.lineups n set bench_order = c.bench_order
    from public.lineups c
    where n.game_id = p_game_id and n.period_index = v_p + 1 and c.game_id = p_game_id and c.period_index = v_p;
    perform public.clock_sync_lineup(p_game_id, v_p + 1);
  end if;
end;
$$;

-- Tapping two bench jerseys swaps their places in the queue (undoable).
create or replace function public.clock_bench_swap(p_game_id uuid, p_a uuid, p_b uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype := public.clock_game(p_game_id);
  v_lineup uuid := public.lineup_of(p_game_id, v_g.clock_period);
  v_order uuid[];
  v_ia int;
  v_ib int;
begin
  if p_a = p_b then
    raise exception 'pick two different players' using errcode = '22023';
  end if;
  perform public.bench_normalize(v_lineup);
  select l.bench_order into v_order from public.lineups l where l.id = v_lineup;
  v_ia := array_position(v_order, p_a);
  v_ib := array_position(v_order, p_b);
  if v_ia is null or v_ib is null then
    raise exception 'both players must be on the bench' using errcode = 'P0016';
  end if;
  perform public.clock_new_op(p_game_id, v_g.clock_period, 'bench');
  v_order[v_ia] := p_b;
  v_order[v_ib] := p_a;
  update public.lineups set bench_order = v_order where id = v_lineup;
end;
$$;

alter table public.clock_ops drop constraint if exists clock_ops_kind_check;
alter table public.clock_ops add constraint clock_ops_kind_check
  check (kind in ('sub', 'swap', 'empty', 'fill', 'lineup', 'end_period', 'bench'));

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
begin
  -- the latest change still in effect (undo steps back through the period, D79)
  select * into v_op from public.clock_ops o where o.game_id = p_game_id and o.undone_at is null order by o.seq desc limit 1;
  if not found or v_op.kind = 'end_period' or v_op.period_index <> v_g.clock_period then
    raise exception 'nothing to undo' using errcode = 'P0015';
  end if;
  delete from public.stints where opened_by_op = v_op.id;
  update public.stints set clock_end = null, closed_by_op = null where closed_by_op = v_op.id;
  for v_row in select * from jsonb_array_elements(v_op.deleted_stints) loop
    insert into public.stints (id, game_id, player_id, period_index, slot_index, position_role, position_code, clock_start, clock_end, opened_by_op, created_at, created_by)
    values ((v_row ->> 'id')::uuid, p_game_id, (v_row ->> 'player_id')::uuid, (v_row ->> 'period_index')::int,
            (v_row ->> 'slot_index')::int, v_row ->> 'position_role', v_row ->> 'position_code',
            (v_row ->> 'clock_start')::int, null, nullif(v_row ->> 'opened_by_op', '')::uuid,
            (v_row ->> 'created_at')::timestamptz, nullif(v_row ->> 'created_by', '')::uuid);
  end loop;
  update public.clock_ops set undone_at = now() where id = v_op.id;
  if v_op.bench_before is not null then
    update public.lineups set bench_order = v_op.bench_before where game_id = p_game_id and period_index = v_g.clock_period;
  end if;
  perform public.clock_sync_lineup(p_game_id, v_g.clock_period);
  return v_op.kind;
end;
$$;

-- start_game (clock branch) seeds every period's queue from the template's first period
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
             case when i = 0 and p.id is not null and p.archived_at is null and p.is_available then s.player_id end,
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
end;
$$;

revoke all on function public.clock_bench_swap(uuid, uuid, uuid) from public;
grant execute on function public.clock_bench_swap(uuid, uuid, uuid) to authenticated, service_role;
