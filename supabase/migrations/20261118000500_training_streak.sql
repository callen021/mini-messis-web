-- At-home Training (D130): the streak.
--
-- The streak belongs to the child and is counted in days; a day adds at most one, however much
-- was done. A day counts when any one of these is true:
--   a. at least one home drill was marked Done that day;
--   b. a game that day in which the child has playing time: a stint (clock mode) or a place in a
--      period of the game's lineup (period mode), in a game that was started;
--   c. a practice that day a parent marked "We went" (below). There is no coach attendance for
--      practices, so this is the only way a practice counts.
-- Opening the app never counts, and a scheduled event with none of the above never counts.
--
-- Missed days: up to two in a Monday-to-Sunday week do not break the streak. It goes back to zero
-- on the third missed day of one week, or on three missed days in a row, whichever comes first.
-- Today is never a miss until it is over. Days are the team's timezone days.
--
-- The streak is computed when read, from the rows above; only the longest streak and the
-- milestones already celebrated (5, 10, 25, 50, 100) are stored, in `player_training`.

-- ---------- "We went" ----------
create table public.practice_checkins (
  practice_id  uuid not null references public.practices(id) on delete cascade,
  player_id    uuid not null references public.players(id) on delete cascade,
  set_by       uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (practice_id, player_id)
);
create index practice_checkins_player_idx on public.practice_checkins (player_id);

alter table public.practice_checkins enable row level security;
create policy practice_checkins_read on public.practice_checkins for select to authenticated
  using (public.can_see_training(player_id));
-- nobody writes rows directly: set_practice_went is the only path
revoke insert, update, delete on public.practice_checkins from anon, authenticated;

-- A parent says their child went to a practice. Only after the practice has started (its date,
-- when it has no start time), never for a cancelled one. Taking it back: the parent who tapped
-- it, the same day they tapped it.
create or replace function public.set_practice_went(p_practice_id uuid, p_player_id uuid, p_went boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_team uuid := public.team_of_player(p_player_id);
  v_p public.practices%rowtype;
  v_tz text;
  v_row public.practice_checkins%rowtype;
begin
  if v_team is null or not public.can_train(p_player_id) then
    raise exception 'you can only do this for your own player' using errcode = '42501';
  end if;
  select * into v_p from public.practices pr where pr.id = p_practice_id;
  if v_p.id is null or v_p.team_id <> v_team then
    raise exception 'that practice belongs to another team' using errcode = '22023';
  end if;
  select coalesce(t.timezone, 'UTC') into v_tz from public.teams t where t.id = v_team;

  if p_went then
    if v_p.status = 'cancelled' then
      raise exception 'That practice was cancelled' using errcode = 'P0005';
    end if;
    if (v_p.practice_date + coalesce(v_p.start_time, time '00:00')) > (now() at time zone v_tz) then
      raise exception 'You can mark this once the practice has started' using errcode = 'P0005';
    end if;
    insert into public.practice_checkins (practice_id, player_id, set_by)
    values (p_practice_id, p_player_id, v_uid)
    on conflict (practice_id, player_id) do nothing;
  else
    select * into v_row from public.practice_checkins c
     where c.practice_id = p_practice_id and c.player_id = p_player_id;
    if v_row.practice_id is null then
      return;
    end if;
    if v_row.set_by is distinct from v_uid
       or (v_row.created_at at time zone v_tz)::date <> public.team_today(v_team) then
      raise exception 'This can only be taken back the same day, by the parent who marked it' using errcode = 'P0005';
    end if;
    delete from public.practice_checkins c
     where c.practice_id = p_practice_id and c.player_id = p_player_id;
  end if;
end;
$$;
revoke all on function public.set_practice_went(uuid, uuid, boolean) from public;
grant execute on function public.set_practice_went(uuid, uuid, boolean) to authenticated, service_role;

-- ---------- what is stored ----------
create table public.player_training (
  player_id       uuid primary key references public.players(id) on delete cascade,
  longest_streak  int not null default 0 check (longest_streak >= 0),
  milestones      int[] not null default '{}',
  updated_at      timestamptz not null default now()
);
alter table public.player_training enable row level security;
create policy player_training_read on public.player_training for select to authenticated
  using (public.can_see_training(player_id));
revoke insert, update, delete on public.player_training from anon, authenticated;

-- ---------- the days that count ----------
-- Internal (not granted to anyone): callers are checked by training_streak.
create or replace function public.training_active_days(p_player_id uuid)
returns setof date
language sql
stable
security definer
set search_path = ''
as $$
  select c.done_on
    from public.home_drill_completions c
   where c.player_id = p_player_id
  union
  select g.game_date
    from public.games g
   where g.team_id = public.team_of_player(p_player_id)
     and g.status in ('live', 'done')
     and (
       exists (select 1 from public.stints s where s.game_id = g.id and s.player_id = p_player_id)
       or exists (
         select 1 from public.lineups l
         join public.lineup_slots ls on ls.lineup_id = l.id
         where l.game_id = g.id and ls.player_id = p_player_id
       )
     )
  union
  select pr.practice_date
    from public.practice_checkins k
    join public.practices pr on pr.id = k.practice_id
   where k.player_id = p_player_id and pr.status <> 'cancelled';
$$;
revoke all on function public.training_active_days(uuid) from public, anon, authenticated;

-- ---------- the count ----------
-- Pure: the same days and the same "today" always give the same answer. Walks the days from the
-- first one that counted to today. `misses` is the days off used so far in today's week.
create or replace function public.streak_from_days(p_days date[], p_today date)
returns table (current_streak int, longest_streak int, misses int)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_first date;
  v_day date;
  v_count int := 0;
  v_best int := 0;
  v_week int := 0;   -- missed days in the Monday-to-Sunday week of v_day
  v_row int := 0;    -- missed days in a row
begin
  select min(d) into v_first from unnest(p_days) d where d <= p_today;
  if v_first is null then
    return query select 0, 0, 0;
    return;
  end if;
  v_day := v_first;
  while v_day <= p_today loop
    if extract(isodow from v_day) = 1 then
      v_week := 0;
    end if;
    if v_day = any (p_days) then
      v_count := v_count + 1;
      v_row := 0;
      v_best := greatest(v_best, v_count);
    elsif v_day < p_today then
      v_week := v_week + 1;
      v_row := v_row + 1;
      if v_week >= 3 or v_row >= 3 then
        v_count := 0;
      end if;
    end if;
    v_day := v_day + 1;
  end loop;
  return query select v_count, v_best, v_week;
end;
$$;
revoke all on function public.streak_from_days(date[], date) from public;
grant execute on function public.streak_from_days(date[], date) to authenticated, service_role;

-- ---------- a child's streak ----------
-- For the child's confirmed parent and the team's coaches. Keeps the longest streak, and tells a
-- parent which milestone (if any) is reached and not yet celebrated.
create or replace function public.training_streak(p_player_id uuid)
returns table (current_streak int, longest_streak int, today_counts boolean, misses int, celebrate int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_days date[];
  v_cur int;
  v_best int;
  v_miss int;
  v_stored public.player_training%rowtype;
  v_celebrate int;
begin
  if not public.can_see_training(p_player_id) then
    raise exception 'you cannot see this player''s training' using errcode = '42501';
  end if;
  v_today := public.team_today(public.team_of_player(p_player_id));
  select coalesce(array_agg(d), '{}') into v_days from public.training_active_days(p_player_id) d;
  select s.current_streak, s.longest_streak, s.misses into v_cur, v_best, v_miss
    from public.streak_from_days(v_days, v_today) s;

  select * into v_stored from public.player_training t where t.player_id = p_player_id;
  if v_best > coalesce(v_stored.longest_streak, 0) then
    insert into public.player_training (player_id, longest_streak)
    values (p_player_id, v_best)
    on conflict (player_id) do update set longest_streak = excluded.longest_streak, updated_at = now();
  end if;

  if public.can_train(p_player_id) then
    select max(m) into v_celebrate
      from unnest(array[5, 10, 25, 50, 100]) m
     where m <= v_cur and not (m = any (coalesce(v_stored.milestones, '{}')));
  end if;

  return query select v_cur, greatest(v_best, coalesce(v_stored.longest_streak, 0)),
                      v_today = any (v_days), v_miss, v_celebrate;
end;
$$;
revoke all on function public.training_streak(uuid) from public;
grant execute on function public.training_streak(uuid) to authenticated, service_role;

-- A milestone was shown to the parent: remember it (and any smaller one), so each is celebrated once.
create or replace function public.celebrate_training_milestone(p_player_id uuid, p_milestone int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_train(p_player_id) then
    raise exception 'you can only do this for your own player' using errcode = '42501';
  end if;
  if not (p_milestone = any (array[5, 10, 25, 50, 100])) then
    raise exception 'not a milestone' using errcode = '22023';
  end if;
  if p_milestone > coalesce((select t.longest_streak from public.player_training t where t.player_id = p_player_id), 0) then
    raise exception 'that streak has not been reached' using errcode = '22023';
  end if;
  update public.player_training t
     set milestones = (
           select coalesce(array_agg(distinct m order by m), '{}')
             from unnest(t.milestones || array(select x from unnest(array[5, 10, 25, 50, 100]) x where x <= p_milestone)) m
         ),
         updated_at = now()
   where t.player_id = p_player_id;
end;
$$;
revoke all on function public.celebrate_training_milestone(uuid, int) from public;
grant execute on function public.celebrate_training_milestone(uuid, int) to authenticated, service_role;
