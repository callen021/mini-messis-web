-- Daily Drills made simple for a brand-new parent (D138).
--
--   1. The streak: a day counts when a home drill is marked Done, when the child played in a
--      started game, or when a parent tapped "We went" for a practice or (new) a game. There are
--      no days off any more: a missed day ends the streak. Today is never a miss until it is over.
--      No child's streak goes down because of the change: what each child had under the old rule
--      is carried, and the strict rule starts from the day this migration runs.
--   2. "We went" for a game, working like the one for a practice.
--   3. Levels: each child starts every drill at Level 1 and moves up after one Done at a level,
--      to Level 3 at most (with a ten-day rotation, more Dones per level would take months).
--      A parent can set the level. The level is worked out from the Dones when read, so taking
--      a Done back takes its progress back too. A child who had already marked a higher level
--      Done starts from the highest one.
--   4. The ten drills reworded for the simpler card: one instruction per level a parent can read
--      aloud and one line for the parent's job. Each level has a picture slot, `image` (an object
--      path in the practice-library bucket); none is set yet and nothing shows without one.

-- ---------- 1a. carry every child's streak as the old rule counts it ----------
alter table public.player_training
  add column carried_streak int not null default 0 check (carried_streak >= 0),
  add column carried_from date;
comment on column public.player_training.carried_streak is
  'The streak before carried_from, as the rule with days off counted it (D130). The strict rule (D138) counts on from there.';

do $$
declare
  r record;
  v_today date;
  v_days date[];
  v_before int;
begin
  for r in select p.id, p.team_id from public.players p loop
    select coalesce(array_agg(d), '{}') into v_days from public.training_active_days(r.id) d;
    if cardinality(v_days) = 0 then
      continue;
    end if;
    v_today := public.team_today(r.team_id);
    -- the old count, less today when today already counted: today is counted again from here on
    select s.current_streak - (case when v_today = any (v_days) then 1 else 0 end) into v_before
      from public.streak_from_days(v_days, v_today) s;
    if v_before > 0 then
      insert into public.player_training (player_id, longest_streak, carried_streak, carried_from)
      values (r.id, v_before, v_before, v_today)
      on conflict (player_id) do update
        set carried_streak = excluded.carried_streak,
            carried_from = excluded.carried_from,
            longest_streak = greatest(public.player_training.longest_streak, excluded.longest_streak),
            updated_at = now();
    end if;
  end loop;
end $$;

-- ---------- 2. "We went" for a game ----------
create table public.game_checkins (
  game_id     uuid not null references public.games(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,
  set_by      uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (game_id, player_id)
);
create index game_checkins_player_idx on public.game_checkins (player_id);

alter table public.game_checkins enable row level security;
create policy game_checkins_read on public.game_checkins for select to authenticated
  using (public.can_see_training(player_id));
-- nobody writes rows directly: set_game_went is the only path
revoke insert, update, delete on public.game_checkins from anon, authenticated;

-- A parent says their child went to a game. Only once the game has started (its date and start
-- time, or the start of its date when it has no time). Taking it back: the parent who tapped it,
-- the same day they tapped it.
create or replace function public.set_game_went(p_game_id uuid, p_player_id uuid, p_went boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_team uuid := public.team_of_player(p_player_id);
  v_g public.games%rowtype;
  v_tz text;
  v_row public.game_checkins%rowtype;
begin
  if v_team is null or not public.can_train(p_player_id) then
    raise exception 'you can only do this for your own player' using errcode = '42501';
  end if;
  select * into v_g from public.games g where g.id = p_game_id;
  if v_g.id is null or v_g.team_id <> v_team then
    raise exception 'that game belongs to another team' using errcode = '22023';
  end if;
  select coalesce(t.timezone, 'UTC') into v_tz from public.teams t where t.id = v_team;

  if p_went then
    if (v_g.game_date + coalesce(v_g.start_time, time '00:00')) > (now() at time zone v_tz) then
      raise exception 'You can mark this once the game has started' using errcode = 'P0005';
    end if;
    insert into public.game_checkins (game_id, player_id, set_by)
    values (p_game_id, p_player_id, v_uid)
    on conflict (game_id, player_id) do nothing;
  else
    select * into v_row from public.game_checkins c
     where c.game_id = p_game_id and c.player_id = p_player_id;
    if v_row.game_id is null then
      return;
    end if;
    if v_row.set_by is distinct from v_uid
       or (v_row.created_at at time zone v_tz)::date <> public.team_today(v_team) then
      raise exception 'This can only be taken back the same day, by the parent who marked it' using errcode = 'P0005';
    end if;
    delete from public.game_checkins c
     where c.game_id = p_game_id and c.player_id = p_player_id;
  end if;
end;
$$;
revoke all on function public.set_game_went(uuid, uuid, boolean) from public;
grant execute on function public.set_game_went(uuid, uuid, boolean) to authenticated, service_role;

-- ---------- the days that count: playing time stays, "We went" for a game is added ----------
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
  select g.game_date
    from public.game_checkins k
    join public.games g on g.id = k.game_id
   where k.player_id = p_player_id
  union
  select pr.practice_date
    from public.practice_checkins k
    join public.practices pr on pr.id = k.practice_id
   where k.player_id = p_player_id and pr.status <> 'cancelled';
$$;
revoke all on function public.training_active_days(uuid) from public, anon, authenticated;

-- ---------- 1b. the strict count ----------
-- Pure. Walks the days up to today: a day that counted adds one, a missed day before today puts
-- the streak back to zero. With a carried streak the walk starts on its date with that number.
drop function public.training_streak(uuid);
drop function public.streak_from_days(date[], date);
create function public.streak_from_days(
  p_days date[],
  p_today date,
  p_carried int default 0,
  p_carried_from date default null
)
returns table (current_streak int, longest_streak int)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_day date;
  v_count int := 0;
  v_best int := 0;
begin
  if coalesce(p_carried, 0) > 0 and p_carried_from is not null and p_carried_from <= p_today then
    v_day := p_carried_from;
    v_count := p_carried;
    v_best := p_carried;
  else
    select min(d) into v_day from unnest(p_days) d where d <= p_today;
  end if;
  if v_day is null then
    return query select 0, 0;
    return;
  end if;
  while v_day <= p_today loop
    if v_day = any (p_days) then
      v_count := v_count + 1;
      v_best := greatest(v_best, v_count);
    elsif v_day < p_today then
      v_count := 0;
    end if;
    v_day := v_day + 1;
  end loop;
  return query select v_count, v_best;
end;
$$;
revoke all on function public.streak_from_days(date[], date, int, date) from public;
grant execute on function public.streak_from_days(date[], date, int, date) to authenticated, service_role;

-- A child's streak, for the child's confirmed parent and the team's coaches. Keeps the longest
-- streak, and tells a parent which milestone (if any) is reached and not yet celebrated.
create function public.training_streak(p_player_id uuid)
returns table (current_streak int, longest_streak int, today_counts boolean, celebrate int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_days date[];
  v_cur int;
  v_best int;
  v_stored public.player_training%rowtype;
  v_celebrate int;
begin
  if not public.can_see_training(p_player_id) then
    raise exception 'you cannot see this player''s training' using errcode = '42501';
  end if;
  v_today := public.team_today(public.team_of_player(p_player_id));
  select coalesce(array_agg(d), '{}') into v_days from public.training_active_days(p_player_id) d;
  select * into v_stored from public.player_training t where t.player_id = p_player_id;
  select s.current_streak, s.longest_streak into v_cur, v_best
    from public.streak_from_days(v_days, v_today, coalesce(v_stored.carried_streak, 0), v_stored.carried_from) s;

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
                      v_today = any (v_days), v_celebrate;
end;
$$;
revoke all on function public.training_streak(uuid) from public;
grant execute on function public.training_streak(uuid) to authenticated, service_role;

-- ---------- 3. levels ----------
-- A level a parent chose (or, seeded below, the level a child had already reached). Dones after
-- `set_at` count toward the next level.
create table public.home_drill_level_overrides (
  player_id  uuid not null references public.players(id) on delete cascade,
  item_id    uuid not null references public.library_items(id) on delete cascade,
  level      int not null check (level between 1 and 3),
  set_at     timestamptz not null default now(),
  set_by     uuid references auth.users(id) on delete set null,
  primary key (player_id, item_id)
);
alter table public.home_drill_level_overrides enable row level security;
create policy home_drill_level_overrides_read on public.home_drill_level_overrides for select to authenticated
  using (public.can_see_training(player_id));
-- nobody writes rows directly: set_home_drill_level is the only path
revoke insert, update, delete on public.home_drill_level_overrides from anon, authenticated;

-- nobody is moved back: a child starts each drill from the highest level already marked Done
insert into public.home_drill_level_overrides (player_id, item_id, level)
select c.player_id, c.item_id, max(c.level)
  from public.home_drill_completions c
 group by c.player_id, c.item_id
having max(c.level) > 1;

create or replace function public.set_home_drill_level(p_player_id uuid, p_item_id uuid, p_level int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid := public.team_of_player(p_player_id);
begin
  if v_team is null or not public.can_train(p_player_id) then
    raise exception 'you can only do this for your own player' using errcode = '42501';
  end if;
  if p_level is null or p_level not between 1 and 3 then
    raise exception 'there are three levels' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.library_items i
    join public.teams t on t.id = v_team
    where i.id = p_item_id and i.category = 'home' and i.is_published and i.sport = t.sport
  ) then
    raise exception 'That is not one of the team''s at-home drills' using errcode = '22023';
  end if;
  insert into public.home_drill_level_overrides (player_id, item_id, level, set_at, set_by)
  values (p_player_id, p_item_id, p_level, now(), (select auth.uid()))
  on conflict (player_id, item_id) do update
    set level = excluded.level, set_at = excluded.set_at, set_by = excluded.set_by;
end;
$$;
revoke all on function public.set_home_drill_level(uuid, uuid, int) from public;
grant execute on function public.set_home_drill_level(uuid, uuid, int) to authenticated, service_role;

-- A child's level on each of the team's at-home drills, how many Dones they have at that level
-- (one moves them up, so this is only ever above zero at Level 3), and the day of their first
-- Done of the drill. Dones are walked a day at a time: a drill is Done at most once a day. For
-- the child's confirmed parent and the team's coaches.
create or replace function public.home_drill_levels(p_player_id uuid)
returns table (item_id uuid, level int, dones_at_level int, first_done_on date)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_team uuid := public.team_of_player(p_player_id);
  r record;
  c record;
  v_level int;
  v_since timestamptz;
  v_n int;
begin
  if not public.can_see_training(p_player_id) then
    raise exception 'you cannot see this player''s training' using errcode = '42501';
  end if;
  for r in
    select i.id from public.library_items i
    join public.teams t on t.id = v_team
    where i.category = 'home' and i.is_published and i.sport = t.sport
    order by i.sort_order
  loop
    v_level := 1;
    v_since := '-infinity';
    select o.level, o.set_at into v_level, v_since
      from public.home_drill_level_overrides o
     where o.player_id = p_player_id and o.item_id = r.id;
    if not found then
      v_level := 1;
      v_since := '-infinity';
    end if;
    v_n := 0;
    for c in
      select k.level as done_level from public.home_drill_completions k
       where k.player_id = p_player_id and k.item_id = r.id and k.created_at > v_since
       order by k.done_on, k.created_at, k.id
    loop
      if c.done_level = v_level then
        v_n := v_n + 1;
        if v_level < 3 then
          v_level := v_level + 1;
          v_n := 0;
        end if;
      end if;
    end loop;
    item_id := r.id;
    level := v_level;
    dones_at_level := v_n;
    first_done_on := (
      select min(k.done_on) from public.home_drill_completions k
       where k.player_id = p_player_id and k.item_id = r.id
    );
    return next;
  end loop;
end;
$$;
revoke all on function public.home_drill_levels(uuid) from public;
grant execute on function public.home_drill_levels(uuid) to authenticated, service_role;

-- ---------- 4. the ten drills, reworded ----------
-- Each level: `text` is the instruction a parent reads aloud, standing on its own; `parent_job`
-- is the parent's one line. The intro, the two modes' text, the notes and the tips are kept and
-- sit behind "More". Two cross-references by number become the drills' names.
create or replace function pg_temp.set_home_levels(p_slug text, p_levels jsonb)
returns void
language sql
as $$
  update public.library_items i
     set content = jsonb_set(i.content, '{home,levels}', p_levels)
   where i.slug = p_slug and i.category = 'home';
$$;

select pg_temp.set_home_levels('toe-taps', $json$[
  {"text": "Tap the top of the ball with one foot, then the other. 20 times.",
   "parent_job": "Count the touches out loud together."},
  {"text": "Tap the top of the ball with one foot, then the other. 40 times without stopping.",
   "parent_job": "Hold up fingers; your child calls out the number without stopping."},
  {"text": "Keep tapping the top of the ball while you move in a circle around it. 30 taps.",
   "parent_job": "Call \"freeze\" now and then; your child stops the ball with the sole."}
]$json$::jsonb);

select pg_temp.set_home_levels('inside-inside-touches', $json$[
  {"text": "Knock the ball side to side between the insides of your feet. 20 times.",
   "parent_job": "Count the touches out loud together."},
  {"text": "Knock the ball side to side between your feet with your knees bent. 40 times.",
   "parent_job": "Hold up fingers; your child calls out the number without stopping."},
  {"text": "Knock the ball side to side between your feet while you move forward 10 yards and back.",
   "parent_job": "Call \"freeze\" now and then; your child stops the ball with the sole."}
]$json$::jsonb);

select pg_temp.set_home_levels('sole-rolls', $json$[
  {"text": "Roll the bottom of your foot across the top of the ball, then roll it back with the other foot. 10 times each foot.",
   "parent_job": "Count the rolls out loud together."},
  {"text": "Roll the ball across and back with the bottom of your feet. 20 times without stopping.",
   "parent_job": "Hold up fingers; your child calls out the number without stopping."},
  {"text": "Roll the ball sideways along a line for 5 yards and back, using both feet.",
   "parent_job": "Step left or right; your child rolls the ball the same way to follow you."}
]$json$::jsonb);

select pg_temp.set_home_levels('v-cuts', $json$[
  {"text": "Push the ball forward, pull it back with the bottom of your foot, then push it out the other way. 5 times each foot, slowly.",
   "parent_job": "Stand in front like a defender, but don't go for the ball."},
  {"text": "Push the ball forward, pull it back with the bottom of your foot, then push it out the other way. 10 times each foot, without stopping in between.",
   "parent_job": "Stand one step in front and point which way to go."},
  {"text": "Push the ball forward, pull it back with the bottom of your foot, push it out the other way, then speed up for 3 yards. 5 times each foot.",
   "parent_job": "Stand in front like a defender, but don't go for the ball."}
]$json$::jsonb);

select pg_temp.set_home_levels('l-drags', $json$[
  {"text": "Pull the ball back with the bottom of your foot, tap it behind your standing leg, and turn. 5 times each foot, slowly.",
   "parent_job": "Stand in front like a defender, but don't go for the ball."},
  {"text": "Pull the ball back with the bottom of your foot, tap it behind your standing leg, and turn. 10 times each foot, without stopping in between.",
   "parent_job": "Stand in front and point which way to turn."},
  {"text": "Dribble at me, pull the ball back with the bottom of your foot, tap it behind your standing leg, then speed up for 3 yards. 5 times.",
   "parent_job": "Stand in front like a defender, but don't go for the ball."}
]$json$::jsonb);

select pg_temp.set_home_levels('cone-dribbling', $json$[
  {"text": "Weave the ball through 5 cones set 3 yards apart, down and back, without knocking one over.",
   "parent_job": "Run the stopwatch, then swap so your child times you."},
  {"text": "Weave the ball through 5 cones set 2 yards apart, down and back.",
   "parent_job": "Run the stopwatch and call out the time to beat."},
  {"text": "Weave through 5 cones set 3 yards apart, down and back, using only your weaker foot.",
   "parent_job": "Run the stopwatch and watch that only the weaker foot touches the ball."}
]$json$::jsonb);

select pg_temp.set_home_levels('inside-outside-touches', $json$[
  {"text": "With one foot, touch the ball with the inside, then the outside, as you walk. 10 touches each foot.",
   "parent_job": "Walk backward in front and count the touches out loud together."},
  {"text": "Go 10 yards with one foot, inside then outside, and come back with the other foot, without stopping.",
   "parent_job": "Walk backward in front holding up fingers; your child calls out the number."},
  {"text": "Jog 10 yards touching the ball with the inside, then the outside, of one foot, and come back with the other foot. Look up every few touches.",
   "parent_job": "Jog backward in front holding up fingers; your child calls out the number."}
]$json$::jsonb);

select pg_temp.set_home_levels('wall-passing-and-first-touch', $json$[
  {"text": "Pass the ball against the wall, stop it when it comes back, then pass again. 10 passes.",
   "parent_job": "Count the passes out loud together."},
  {"text": "Pass against the wall and stop it, using the other foot each time. 20 passes.",
   "parent_job": "Stand to the side and call \"left\" or \"right\" for the next foot."},
  {"text": "Pass against the wall, and let your first touch move the ball to the side before you pass again. 10 passes, both sides.",
   "parent_job": "Call \"left\" or \"right\" for which side the first touch goes."}
]$json$::jsonb);

select pg_temp.set_home_levels('juggling', $json$[
  {"text": "Drop the ball from your hands, kick it up once, and catch it. 10 times.",
   "parent_job": "Count the catches out loud together."},
  {"text": "Drop the ball, touch it twice with your foot or thigh, and catch it. 5 times.",
   "parent_job": "Count the catches out loud together."},
  {"text": "Keep the ball up as many times in a row as you can. One bounce between touches is fine.",
   "parent_job": "Count the touches out loud and remember the best number."}
]$json$::jsonb);

select pg_temp.set_home_levels('first-touch-and-passing-with-a-parent', $json$[
  {"text": "Pass the ball to me, and stop it before you pass it back. 10 passes.",
   "parent_job": "Stand 5 yards away, pass back, and count out loud together."},
  {"text": "Pass back and forth with me, using the other foot each time. 20 passes.",
   "parent_job": "Stand 5 yards away and call \"left\" or \"right\" as you pass."},
  {"text": "Pass the ball through the two cones to me. Try to get 8 out of 10.",
   "parent_job": "Set two cones 2 yards apart, stand behind them, and keep score out loud.",
   "type": "accuracy"}
]$json$::jsonb);

-- the drills are no longer numbered on screen: name the drill a line points to
update public.library_items
   set content = jsonb_set(content, '{home,notes}', $json$[
     {"title": "No wall", "text": "Use First Touch and Passing With a Parent instead. Pick a wall away from windows and cars."}
   ]$json$::jsonb)
 where slug = 'wall-passing-and-first-touch' and category = 'home';
update public.library_items
   set content = jsonb_set(content, '{home,on_my_own}', '"Use Wall Passing and First Touch against a wall."'::jsonb)
 where slug = 'first-touch-and-passing-with-a-parent' and category = 'home';
