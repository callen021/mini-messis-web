-- Clock-based playing time, part 2 (D66, D67): the game clock and stints.
--
-- The clock is three columns on the game, never a ticking counter: the current period, the seconds
-- accumulated while paused, and the server timestamp it has been running since (null = paused).
-- elapsed = clock_seconds + (now() - clock_running_since). Every device computes the same number.
--
-- Who is on the field is a ledger of stints (game, player, period, spot, clock start, clock end).
-- An open stint (clock_end null) is a player on the field now. Minutes played are derived from
-- stints; the lineup rows of a clock game mirror the open stints so parents' existing views and the
-- game page keep working. Every change goes through a SECURITY DEFINER function that is atomic,
-- staff-only, and records an op so "Undo last sub" can reverse it.

-- ---------- game clock ----------
alter table public.games
  add column if not exists clock_period int not null default 0 check (clock_period between 0 and 12),
  add column if not exists clock_seconds int not null default 0 check (clock_seconds >= 0),
  add column if not exists clock_running_since timestamptz,
  -- final length in seconds of each period ended so far (index = period)
  add column if not exists clock_period_lengths int[] not null default '{}';

-- ---------- stints ----------
create table public.stints (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid not null references public.games(id) on delete cascade,
  player_id      uuid not null references public.players(id) on delete cascade,
  period_index   int not null check (period_index between 0 and 12),
  slot_index     int not null check (slot_index between 0 and 30),
  position_role  text not null,
  position_code  text not null,
  clock_start    int not null check (clock_start >= 0),
  clock_end      int check (clock_end is null or clock_end >= clock_start),
  opened_by_op   uuid,
  closed_by_op   uuid,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id) default auth.uid(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users(id)
);
create index stints_game_idx on public.stints(game_id, period_index, clock_start);
create index stints_player_idx on public.stints(player_id);
-- one open stint per player per game, one open stint per spot per period
create unique index stints_open_player_idx on public.stints(game_id, player_id) where clock_end is null;
create unique index stints_open_slot_idx on public.stints(game_id, period_index, slot_index) where clock_end is null;
create trigger stints_updated_at before update on public.stints
  for each row execute function public.set_updated_at();
create trigger stints_stamp before insert or update on public.stints
  for each row execute function public.stamp_updated_by();

-- Every change made through the functions below, for undo and for the audit trail.
create table public.clock_ops (
  id              uuid primary key default gen_random_uuid(),
  -- strictly increasing within a transaction too (created_at is not): undo takes the highest seq
  seq             bigint generated always as identity,
  game_id         uuid not null references public.games(id) on delete cascade,
  period_index    int not null,
  kind            text not null check (kind in ('sub', 'swap', 'empty', 'fill', 'lineup', 'end_period')),
  -- stints the op deleted outright (zero-length ones), re-inserted by undo
  deleted_stints  jsonb not null default '[]'::jsonb,
  undone_at       timestamptz,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) default auth.uid()
);
create index clock_ops_game_idx on public.clock_ops(game_id, seq desc);

alter table public.stints enable row level security;
alter table public.clock_ops enable row level security;
-- playing time is team-visible, like positions and the rotation (D56 leaves it open to every member)
create policy stints_select_member on public.stints for select to authenticated
  using (public.is_active_member(public.team_of_game(game_id)));
-- no direct writes: the functions below are the only way in
create policy clock_ops_select_staff on public.clock_ops for select to authenticated
  using (public.is_staff(public.team_of_game(game_id)));

alter publication supabase_realtime add table public.stints;
alter table public.stints replica identity full;

-- ---------- helpers ----------
-- (two plain arguments, not the games row: PostgREST would otherwise expose it as a computed column)
create or replace function public.clock_elapsed(p_seconds int, p_running_since timestamptz)
returns int
language sql
stable
set search_path = ''
as $$
  select p_seconds
       + case when p_running_since is null then 0
              else greatest(0, floor(extract(epoch from (now() - p_running_since)))::int) end;
$$;

-- Load the game, check staff + live + clock mode. Returns the row; raises otherwise.
create or replace function public.clock_game(p_game_id uuid)
returns public.games
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype;
  v_mode public.time_mode;
begin
  select * into v_g from public.games g where g.id = p_game_id;
  if not found or not public.is_staff(v_g.team_id) then
    raise exception 'only a coach or assistant can run the clock' using errcode = '42501';
  end if;
  if v_g.status <> 'live' then
    raise exception 'the clock only runs during a live game' using errcode = '22023';
  end if;
  select t.time_mode into v_mode from public.teams t where t.id = v_g.team_id;
  if v_mode <> 'clock' then
    raise exception 'this team tracks playing time by periods, not the clock' using errcode = 'P0007';
  end if;
  return v_g;
end;
$$;
revoke all on function public.clock_game(uuid) from public;

-- Mirror the open stints of a period into that period's lineup row (formation and codes stay).
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
  -- two passes: a swap would otherwise trip the one-player-per-lineup index mid-update
  update public.lineup_slots set player_id = null, auto_picked = false where lineup_id = v_lineup;
  update public.lineup_slots s
  set player_id = (select st.player_id from public.stints st
                   where st.game_id = p_game_id and st.period_index = p_period and st.slot_index = s.slot_index and st.clock_end is null),
      auto_picked = false
  where s.lineup_id = v_lineup;
end;
$$;
revoke all on function public.clock_sync_lineup(uuid, int) from public;

-- Close a stint at `p_at`; a stint that would be zero-length is deleted instead and remembered on the op.
create or replace function public.clock_close_stint(p_stint public.stints, p_at int, p_op uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_at <= p_stint.clock_start then
    update public.clock_ops set deleted_stints = deleted_stints || to_jsonb(p_stint) where id = p_op;
    delete from public.stints where id = p_stint.id;
  else
    update public.stints set clock_end = p_at, closed_by_op = p_op where id = p_stint.id;
  end if;
end;
$$;
revoke all on function public.clock_close_stint(public.stints, int, uuid) from public;

create or replace function public.clock_open_stint(
  p_game_id uuid, p_player uuid, p_period int, p_slot int, p_role text, p_code text, p_at int, p_op uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.stints (game_id, player_id, period_index, slot_index, position_role, position_code, clock_start, opened_by_op)
  values (p_game_id, p_player, p_period, p_slot, p_role, p_code, p_at, p_op);
$$;
revoke all on function public.clock_open_stint(uuid, uuid, int, int, text, text, int, uuid) from public;

create or replace function public.clock_new_op(p_game_id uuid, p_period int, p_kind text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.clock_ops (game_id, period_index, kind) values (p_game_id, p_period, p_kind) returning id;
$$;
revoke all on function public.clock_new_op(uuid, int, text) from public;

-- The player's open stint in the game, or raise.
create or replace function public.clock_open_stint_of(p_game_id uuid, p_player uuid)
returns public.stints
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.stints%rowtype;
begin
  select * into v_s from public.stints s where s.game_id = p_game_id and s.player_id = p_player and s.clock_end is null;
  if not found then
    raise exception 'that player is not on the field' using errcode = 'P0008';
  end if;
  return v_s;
end;
$$;
revoke all on function public.clock_open_stint_of(uuid, uuid) from public;

-- A bench player must be on the team, not archived, not marked out, and not already on the field.
create or replace function public.clock_check_bench(p_game public.games, p_player uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.players p where p.id = p_player and p.team_id = p_game.team_id and p.archived_at is null and p.is_available) then
    raise exception 'that player is not available for this game' using errcode = 'P0009';
  end if;
  if exists (select 1 from public.stints s where s.game_id = p_game.id and s.player_id = p_player and s.clock_end is null) then
    raise exception 'that player is already on the field' using errcode = 'P0010';
  end if;
end;
$$;
revoke all on function public.clock_check_bench(public.games, uuid) from public;

-- Role and code of a spot in the game's lineup for the current period.
create or replace function public.clock_spot(p_game_id uuid, p_period int, p_slot int, out o_role text, out o_code text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  select s.position_role, s.position_code into o_role, o_code
  from public.lineup_slots s join public.lineups l on l.id = s.lineup_id
  where l.game_id = p_game_id and l.period_index = p_period and s.slot_index = p_slot;
  if o_role is null then
    raise exception 'no such spot in this lineup' using errcode = 'P0011';
  end if;
end;
$$;
revoke all on function public.clock_spot(uuid, int, int) from public;

-- What the client needs to draw the clock, with the server's own time for skew correction.
create or replace function public.game_clock(p_game_id uuid)
returns table (
  period_index int, clock_seconds int, running_since timestamptz, elapsed int,
  period_lengths int[], server_now timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.clock_period, g.clock_seconds, g.clock_running_since, public.clock_elapsed(g.clock_seconds, g.clock_running_since),
         g.clock_period_lengths, now()
  from public.games g
  where g.id = p_game_id and public.is_active_member(g.team_id);
$$;

create or replace function public.server_time()
returns timestamptz
language sql
stable
set search_path = ''
as $$ select now(); $$;

-- ---------- the clock ----------
create or replace function public.clock_start(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype := public.clock_game(p_game_id);
  v_n int := public.team_period_count(v_g.team_id);
begin
  if v_g.clock_period >= v_n then
    raise exception 'the game clock has reached full time' using errcode = 'P0012';
  end if;
  if v_g.clock_running_since is null then
    update public.games set clock_running_since = now() where id = p_game_id;
  end if;
end;
$$;

create or replace function public.clock_pause(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype := public.clock_game(p_game_id);
begin
  if v_g.clock_running_since is not null then
    update public.games
    set clock_seconds = public.clock_elapsed(v_g.clock_seconds, v_g.clock_running_since), clock_running_since = null
    where id = p_game_id;
  end if;
end;
$$;

-- End the period: pause, close every open stint, remember the length, and carry the same players
-- into the next period as its starters (new stints at 0). On the last period the clock stops at
-- full time (clock_period = period count) and nothing is carried.
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
  -- who is on the field as the period ends (taken before closing: a zero-length stint is deleted)
  v_on jsonb := (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.stints s where s.game_id = p_game_id and s.clock_end is null);
  v_row jsonb;
begin
  if v_p >= v_n then
    raise exception 'the game clock has reached full time' using errcode = 'P0012';
  end if;
  v_op := public.clock_new_op(p_game_id, v_p, 'end_period');
  -- close everyone on the field at the final second
  for v_s in select * from public.stints s where s.game_id = p_game_id and s.clock_end is null loop
    perform public.clock_close_stint(v_s, v_at, v_op);
  end loop;
  v_lengths[v_p + 1] := v_at;
  update public.games
  set clock_period = v_p + 1, clock_seconds = 0, clock_running_since = null, clock_period_lengths = v_lengths
  where id = p_game_id;
  if v_p + 1 < v_n then
    -- the next period starts with the players who ended this one, in the same spots
    for v_row in select * from jsonb_array_elements(v_on) loop
      perform public.clock_open_stint(p_game_id, (v_row ->> 'player_id')::uuid, v_p + 1, (v_row ->> 'slot_index')::int,
                                      v_row ->> 'position_role', v_row ->> 'position_code', 0, v_op);
    end loop;
    perform public.clock_sync_lineup(p_game_id, v_p + 1);
  end if;
end;
$$;

-- ---------- substitutions ----------
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
  perform public.clock_sync_lineup(p_game_id, v_g.clock_period);
end;
$$;

create or replace function public.clock_swap(p_game_id uuid, p_a uuid, p_b uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype := public.clock_game(p_game_id);
  v_at int := public.clock_elapsed(v_g.clock_seconds, v_g.clock_running_since);
  v_a public.stints%rowtype := public.clock_open_stint_of(p_game_id, p_a);
  v_b public.stints%rowtype := public.clock_open_stint_of(p_game_id, p_b);
  v_op uuid;
begin
  if p_a = p_b then
    raise exception 'pick two different players' using errcode = '22023';
  end if;
  v_op := public.clock_new_op(p_game_id, v_g.clock_period, 'swap');
  perform public.clock_close_stint(v_a, v_at, v_op);
  perform public.clock_close_stint(v_b, v_at, v_op);
  perform public.clock_open_stint(p_game_id, p_a, v_b.period_index, v_b.slot_index, v_b.position_role, v_b.position_code, v_at, v_op);
  perform public.clock_open_stint(p_game_id, p_b, v_a.period_index, v_a.slot_index, v_a.position_role, v_a.position_code, v_at, v_op);
  perform public.clock_sync_lineup(p_game_id, v_g.clock_period);
end;
$$;

-- Take a player off with nobody on (injury).
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
  perform public.clock_sync_lineup(p_game_id, v_g.clock_period);
end;
$$;

-- Put a player into an empty spot: from the bench, or moved from another spot.
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
  perform public.clock_sync_lineup(p_game_id, v_p);
end;
$$;

-- Replace the whole on-field set at once (formation change, auto-fill, suggested starters). Only
-- while the period's clock stands at zero, so no stint has to be cut.
-- p_slots: [{ "position_role", "position_code", "player_id" | null }, ...]
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
begin
  if public.clock_elapsed(v_g.clock_seconds, v_g.clock_running_since) > 0 then
    raise exception 'the lineup can only be rewritten before the clock starts' using errcode = 'P0014';
  end if;
  if v_p >= public.team_period_count(v_g.team_id) then
    raise exception 'the game clock has reached full time' using errcode = 'P0012';
  end if;
  v_op := public.clock_new_op(p_game_id, v_p, 'lineup');
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
    end if;
    v_j := v_j + 1;
  end loop;
end;
$$;

-- Reverse the most recent change in the current period. Ending a period is not undone.
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
  select * into v_op from public.clock_ops o where o.game_id = p_game_id order by o.seq desc limit 1;
  if not found or v_op.undone_at is not null or v_op.kind = 'end_period' or v_op.period_index <> v_g.clock_period then
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
  perform public.clock_sync_lineup(p_game_id, v_g.clock_period);
  return v_op.kind;
end;
$$;

-- ---------- corrections after the game (D67) ----------
create or replace function public.stint_check(p_game_id uuid, p_stint_id uuid, p_player uuid, p_period int, p_start int, p_end int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype;
  v_len int;
begin
  select * into v_g from public.games g where g.id = p_game_id;
  if not found or not public.is_staff(v_g.team_id) then
    raise exception 'only a coach or assistant can correct playing time' using errcode = '42501';
  end if;
  if v_g.status <> 'done' then
    raise exception 'playing time is corrected after the game' using errcode = '22023';
  end if;
  if p_start < 0 or p_end <= p_start then
    raise exception 'a stint must end after it starts' using errcode = '23514';
  end if;
  v_len := v_g.clock_period_lengths[p_period + 1];
  if v_len is null or p_end > v_len then
    raise exception 'a stint must stay inside the period (% seconds)', coalesce(v_len, 0) using errcode = '23514';
  end if;
  if exists (
    select 1 from public.stints s
    where s.game_id = p_game_id and s.player_id = p_player and s.period_index = p_period
      and s.id is distinct from p_stint_id
      and s.clock_start < p_end and coalesce(s.clock_end, v_len) > p_start
  ) then
    raise exception 'that overlaps another stint of the same player' using errcode = '23505';
  end if;
end;
$$;
revoke all on function public.stint_check(uuid, uuid, uuid, int, int, int) from public;

create or replace function public.stint_update(p_stint_id uuid, p_start int, p_end int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.stints%rowtype;
begin
  select * into v_s from public.stints s where s.id = p_stint_id;
  if not found then
    raise exception 'stint not found' using errcode = 'P0002';
  end if;
  perform public.stint_check(v_s.game_id, p_stint_id, v_s.player_id, v_s.period_index, p_start, p_end);
  update public.stints set clock_start = p_start, clock_end = p_end where id = p_stint_id;
end;
$$;

create or replace function public.stint_add(p_game_id uuid, p_player uuid, p_period int, p_code text, p_start int, p_end int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype;
  v_role text;
  v_slot int;
  v_id uuid;
begin
  select * into v_g from public.games g where g.id = p_game_id;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;
  if public.team_of_player(p_player) is distinct from v_g.team_id then
    raise exception 'player is not on this team' using errcode = '23503';
  end if;
  perform public.stint_check(p_game_id, null, p_player, p_period, p_start, p_end);
  select s.position_role, s.slot_index into v_role, v_slot
  from public.lineup_slots s join public.lineups l on l.id = s.lineup_id
  where l.game_id = p_game_id and l.period_index = p_period and s.position_code = p_code
  limit 1;
  insert into public.stints (game_id, player_id, period_index, slot_index, position_role, position_code, clock_start, clock_end)
  values (p_game_id, p_player, p_period, coalesce(v_slot, 0), coalesce(v_role, p_code), p_code, p_start, p_end)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.stint_delete(p_stint_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.stints%rowtype;
  v_g public.games%rowtype;
begin
  select * into v_s from public.stints s where s.id = p_stint_id;
  if not found then
    raise exception 'stint not found' using errcode = 'P0002';
  end if;
  select * into v_g from public.games g where g.id = v_s.game_id;
  if not public.is_staff(v_g.team_id) then
    raise exception 'only a coach or assistant can correct playing time' using errcode = '42501';
  end if;
  if v_g.status <> 'done' then
    raise exception 'playing time is corrected after the game' using errcode = '22023';
  end if;
  delete from public.stints where id = p_stint_id;
end;
$$;

-- ---------- start / finish in clock mode ----------
-- start_game: the template's first period becomes the starters of every clock period, and the
-- starters get their stints at 0. Period-mode teams take the old path untouched.
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
      insert into public.lineups (team_id, game_id, period_index, formation_name)
      select v_g.team_id, p_game_id, i, coalesce((select formation_name from public.lineups where id = v_tpl), '')
      returning id into v_new;
      insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code, player_id, auto_picked)
      select v_new, s.slot_index, s.position_role, s.position_code,
             case when i = 0 and p.id is not null and p.archived_at is null and p.is_available then s.player_id end,
             false
      from public.lineup_slots s
      left join public.players p on p.id = s.player_id
      where s.lineup_id = v_tpl;
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

-- finish_game: in clock mode the clock stops, open stints close, and the STARTING lineup (not the
-- last players on the field) becomes the template for next time (D67). Period mode is unchanged.
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
    -- template := the starters (the game's first-period spots, each with the player who began
    -- the game there), written into every template period
    for r in select l.id from public.lineups l where l.team_id = v_g.team_id and l.game_id is null loop
      update public.lineups
      set formation_name = coalesce((select g.formation_name from public.lineups g where g.game_id = p_game_id and g.period_index = 0), formation_name)
      where id = r.id;
      delete from public.lineup_slots where lineup_id = r.id;
      insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code, player_id, auto_picked)
      select r.id, s.slot_index, s.position_role, s.position_code,
             (select st.player_id from public.stints st
              where st.game_id = p_game_id and st.period_index = 0 and st.clock_start = 0 and st.slot_index = s.slot_index
              order by st.created_at limit 1),
             false
      from public.lineup_slots s join public.lineups g on g.id = s.lineup_id
      where g.game_id = p_game_id and g.period_index = 0;
    end loop;
  else
    update public.games set status = 'done', finished_at = now() where id = p_game_id;
    perform public.copy_lineups(v_g.team_id, p_game_id, null);
  end if;
end;
$$;

-- ---------- scores carry the clock (D68) ----------
alter table public.score_events add column if not exists clock_seconds int check (clock_seconds is null or clock_seconds >= 0);

-- During a live clock game a new event is stamped with the period and clock second unless the
-- caller set them (an edit after the fact keeps what it was given).
create or replace function public.score_events_clock_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g public.games%rowtype;
  v_mode public.time_mode;
begin
  if new.clock_seconds is not null then return new; end if;
  select * into v_g from public.games g where g.id = new.game_id;
  select t.time_mode into v_mode from public.teams t where t.id = v_g.team_id;
  if v_mode = 'clock' and v_g.status = 'live' and v_g.clock_period < public.team_period_count(v_g.team_id) then
    new.period_index := v_g.clock_period;
    new.clock_seconds := public.clock_elapsed(v_g.clock_seconds, v_g.clock_running_since);
  end if;
  return new;
end;
$$;
drop trigger if exists score_events_clock_stamp on public.score_events;
create trigger score_events_clock_stamp before insert on public.score_events
  for each row execute function public.score_events_clock_stamp();

-- game_events (D56) gains the clock second
drop function if exists public.game_events(uuid);
create function public.game_events(p_game_id uuid)
returns table (
  id uuid, game_id uuid, side public.score_side, period_index int, event_type text, points smallint,
  scorer_player_id uuid, assist_player_id uuid, occurred_at timestamptz, created_by uuid,
  created_at timestamptz, updated_at timestamptz, updated_by uuid, hidden boolean, clock_seconds int
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.game_id, e.side, e.period_index, e.event_type, e.points,
         case when public.can_see_player_stats(e.scorer_player_id) then e.scorer_player_id end,
         case when public.can_see_player_stats(e.assist_player_id) then e.assist_player_id end,
         e.occurred_at, e.created_by, e.created_at, e.updated_at, e.updated_by,
         (e.scorer_player_id is not null and not public.can_see_player_stats(e.scorer_player_id)),
         e.clock_seconds
  from public.score_events e
  where e.game_id = p_game_id
    and public.is_active_member(public.team_of_game(p_game_id))
  order by e.occurred_at, e.created_at;
$$;

-- ---------- minutes in the stats (D69) ----------
-- seconds_played: every stint in scope; an open stint counts up to the game's current clock.
drop function if exists public.player_season_stats(uuid, uuid, uuid);
create function public.player_season_stats(
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
    and (public.sees_all_stats(p_team_id) or public.is_guardian_of(i.id));
$$;

-- Season seconds per player and per position group, for Auto-fill in clock mode (staff).
create or replace function public.season_minutes(p_team_id uuid, p_season_id uuid default null)
returns table (player_id uuid, seconds int, by_group jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with scope as (
    select g.id from public.games g
    where g.team_id = p_team_id and g.status <> 'upcoming'
      and g.season_id = coalesce(p_season_id, (select s.id from public.seasons s where s.team_id = p_team_id and s.is_current limit 1))
  ),
  per as (
    select st.player_id, st.position_role,
           sum(greatest(0, coalesce(st.clock_end, case when g.clock_period = st.period_index then public.clock_elapsed(g.clock_seconds, g.clock_running_since) else st.clock_start end) - st.clock_start))::int as secs
    from public.stints st join public.games g on g.id = st.game_id
    where st.game_id in (select id from scope)
    group by st.player_id, st.position_role
  )
  select per.player_id, sum(per.secs)::int, jsonb_object_agg(per.position_role, per.secs)
  from per
  where public.is_staff(p_team_id)
  group by per.player_id;
$$;

-- ---------- grants ----------
revoke all on function public.game_clock(uuid) from public;
revoke all on function public.server_time() from public;
revoke all on function public.clock_start(uuid) from public;
revoke all on function public.clock_pause(uuid) from public;
revoke all on function public.clock_end_period(uuid) from public;
revoke all on function public.clock_sub(uuid, uuid, uuid) from public;
revoke all on function public.clock_swap(uuid, uuid, uuid) from public;
revoke all on function public.clock_empty(uuid, uuid) from public;
revoke all on function public.clock_fill(uuid, uuid, int) from public;
revoke all on function public.clock_set_lineup(uuid, text, jsonb) from public;
revoke all on function public.clock_undo(uuid) from public;
revoke all on function public.stint_update(uuid, int, int) from public;
revoke all on function public.stint_add(uuid, uuid, int, text, int, int) from public;
revoke all on function public.stint_delete(uuid) from public;
revoke all on function public.start_game(uuid) from public;
revoke all on function public.finish_game(uuid) from public;
revoke all on function public.game_events(uuid) from public;
revoke all on function public.player_season_stats(uuid, uuid, uuid) from public;
revoke all on function public.season_minutes(uuid, uuid) from public;
grant execute on function
  public.game_clock(uuid), public.server_time(),
  public.clock_start(uuid), public.clock_pause(uuid), public.clock_end_period(uuid),
  public.clock_sub(uuid, uuid, uuid), public.clock_swap(uuid, uuid, uuid), public.clock_empty(uuid, uuid),
  public.clock_fill(uuid, uuid, int), public.clock_set_lineup(uuid, text, jsonb), public.clock_undo(uuid),
  public.stint_update(uuid, int, int), public.stint_add(uuid, uuid, int, text, int, int), public.stint_delete(uuid),
  public.start_game(uuid), public.finish_game(uuid), public.game_events(uuid),
  public.player_season_stats(uuid, uuid, uuid), public.season_minutes(uuid, uuid)
to authenticated, service_role;
