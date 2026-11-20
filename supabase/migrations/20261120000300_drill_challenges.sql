-- Daily Drills become timed challenges (D140).
--
--   1. Attempts. Every drill level is a challenge: a countdown in which the parent counts reps
--      (more is better), or a stopwatch over a course (less is better). `home_drill_attempts`
--      keeps every recorded score. `record_drill_attempt` is the only way in: it decides on the
--      server whether the score beat the child's best at that level (a tie does not), marks the
--      drill Done for the day when it is the day's first score (any score counts, zero too), and
--      unlocks the next level when the score meets the level's target.
--
--   2. Personal bests, per child, drill and level: `home_drill_bests`. For the child's confirmed
--      parents and the team's coaches, like the rest of at-home training.
--
--   3. Levels. "One Done moves up a level" is gone. A child's level on a drill is stored
--      (`home_drill_level_overrides`, which already held the levels parents set) and moves up
--      when a score at that level meets its target; Level 3 has no target. A parent can still set
--      it. Every child keeps the level they are on today: it is worked out one last time from
--      their Dones and stored.
--
--   4. The ten drills: each level gets its challenge (`challenge`: mode, seconds, target), an
--      instruction without a fixed count that says what one count is, the parent's job, and what
--      used to be the parent's job as "Make it harder" (`harder`). Cone Dribbling is four cones
--      about 3 yards apart at every level, with a diagram.
--
--   5. The old Cone Dribbling times (five cones) are copied into the attempts as `old_course`
--      rows: kept in the history, never a personal best. `home_drill_times` stays as it is,
--      unused and no longer written.

-- ---------- 1. attempts ----------
create table public.home_drill_attempts (
  id                     uuid primary key default gen_random_uuid(),
  player_id              uuid not null references public.players(id) on delete cascade,
  item_id                uuid not null references public.library_items(id) on delete cascade,
  level                  int not null check (level between 1 and 3),
  kind                   text not null check (kind in ('reps', 'time')),
  reps                   int check (reps between 0 and 9999),
  seconds                numeric(7, 2) check (seconds > 0 and seconds < 3600),
  mode                   public.drill_mode not null default 'parent',
  done_on                date not null,
  recorded_by            uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  -- the child's best at this level before this attempt; null when it was the first
  previous_best_reps     int,
  previous_best_seconds  numeric(7, 2),
  -- it beat that best (a first score and a tie do not)
  is_record              boolean not null default false,
  -- the level this score unlocked, when it met the target at the child's current level
  unlocked_level         int check (unlocked_level between 2 and 3),
  -- a time on the five-cone course Cone Dribbling had before D140: history only
  old_course             boolean not null default false,
  check ((kind = 'reps' and reps is not null and seconds is null)
      or (kind = 'time' and seconds is not null and reps is null))
);
create index home_drill_attempts_player_idx
  on public.home_drill_attempts (player_id, item_id, level, created_at desc);

alter table public.home_drill_attempts enable row level security;
create policy home_drill_attempts_read on public.home_drill_attempts for select to authenticated
  using (public.can_see_training(player_id));
-- nobody writes rows directly: record_drill_attempt and delete_drill_attempt are the only paths
revoke insert, update, delete on public.home_drill_attempts from anon, authenticated;

-- ---------- 5. the old five-cone times, kept as history ----------
insert into public.home_drill_attempts
  (player_id, item_id, level, kind, seconds, mode, done_on, recorded_by, created_at, old_course)
select t.player_id, t.item_id, t.level, 'time', t.seconds, 'parent', t.run_on, t.recorded_by, t.created_at, true
  from public.home_drill_times t;

drop policy if exists home_drill_times_insert on public.home_drill_times;
revoke insert on public.home_drill_times from anon, authenticated;

-- ---------- 3. levels: stored, and every child keeps today's ----------
-- The D138 rule one last time: from the level a parent set (or 1), each Done at the current level
-- since then moved the child up one, to Level 3 at most.
do $$
declare
  r record;
  c record;
  v_level int;
  v_since timestamptz;
begin
  for r in select distinct k.player_id, k.item_id from public.home_drill_completions k loop
    v_level := 1;
    v_since := '-infinity';
    select o.level, o.set_at into v_level, v_since
      from public.home_drill_level_overrides o
     where o.player_id = r.player_id and o.item_id = r.item_id;
    if not found then
      v_level := 1;
      v_since := '-infinity';
    end if;
    for c in
      select k.level as done_level from public.home_drill_completions k
       where k.player_id = r.player_id and k.item_id = r.item_id and k.created_at > v_since
       order by k.done_on, k.created_at, k.id
    loop
      if c.done_level = v_level and v_level < 3 then
        v_level := v_level + 1;
      end if;
    end loop;
    if v_level > 1 then
      insert into public.home_drill_level_overrides (player_id, item_id, level)
      values (r.player_id, r.item_id, v_level)
      on conflict (player_id, item_id) do update set level = excluded.level;
    end if;
  end loop;
end $$;

comment on table public.home_drill_level_overrides is
  'A child''s level on an at-home drill (D140): set by a parent, or moved up by a score that met the level''s target. No row means Level 1.';

-- A child's level on each of the team's at-home drills, and the day of their first Done of the
-- drill. For the child's confirmed parent and the team's coaches.
drop function if exists public.home_drill_levels(uuid);
create function public.home_drill_levels(p_player_id uuid)
returns table (item_id uuid, level int, first_done_on date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_team uuid := public.team_of_player(p_player_id);
begin
  if not public.can_see_training(p_player_id) then
    raise exception 'you cannot see this player''s training' using errcode = '42501';
  end if;
  return query
    select i.id,
           coalesce((select o.level from public.home_drill_level_overrides o
                      where o.player_id = p_player_id and o.item_id = i.id), 1),
           (select min(k.done_on) from public.home_drill_completions k
             where k.player_id = p_player_id and k.item_id = i.id)
      from public.library_items i
      join public.teams t on t.id = v_team
     where i.category = 'home' and i.is_published and i.sport = t.sport
     order by i.sort_order;
end;
$$;
revoke all on function public.home_drill_levels(uuid) from public, anon;
grant execute on function public.home_drill_levels(uuid) to authenticated, service_role;

-- ---------- 1. recording a score ----------
-- Exactly one of p_reps (a timer level) and p_seconds (a stopwatch level) is given; which one the
-- level takes is in its content. Returns the new attempt's id: the results page reads the row.
create or replace function public.record_drill_attempt(
  p_player_id uuid,
  p_item_id uuid,
  p_level int,
  p_reps int default null,
  p_seconds numeric default null,
  p_mode public.drill_mode default 'parent'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_team uuid := public.team_of_player(p_player_id);
  v_content jsonb;
  v_challenge jsonb;
  v_kind text;
  v_target numeric;
  v_seconds numeric(7, 2);
  v_prev_reps int;
  v_prev_seconds numeric(7, 2);
  v_record boolean := false;
  v_met boolean := false;
  v_current int;
  v_unlocked int;
  v_id uuid;
begin
  if v_team is null or not public.can_train(p_player_id) then
    raise exception 'you can only do this for your own player' using errcode = '42501';
  end if;
  if p_level is null or p_level not between 1 and 3 then
    raise exception 'there are three levels' using errcode = '22023';
  end if;
  select i.content into v_content
    from public.library_items i
    join public.teams t on t.id = v_team
   where i.id = p_item_id and i.category = 'home' and i.is_published and i.sport = t.sport;
  if v_content is null then
    raise exception 'That is not one of the team''s at-home drills' using errcode = '22023';
  end if;
  v_challenge := v_content #> array['home', 'levels', (p_level - 1)::text, 'challenge'];
  v_kind := case v_challenge ->> 'mode' when 'timer' then 'reps' when 'stopwatch' then 'time' end;
  if v_kind is null then
    raise exception 'That drill level has no challenge' using errcode = '22023';
  end if;
  if jsonb_typeof(v_challenge -> 'target') = 'number' then
    v_target := (v_challenge ->> 'target')::numeric;
  end if;

  if v_kind = 'reps' then
    if p_reps is null or p_seconds is not null or p_reps not between 0 and 9999 then
      raise exception 'This level is scored in reps' using errcode = '22023';
    end if;
    select max(a.reps) into v_prev_reps
      from public.home_drill_attempts a
     where a.player_id = p_player_id and a.item_id = p_item_id and a.level = p_level
       and a.kind = 'reps' and not a.old_course;
    v_record := v_prev_reps is not null and p_reps > v_prev_reps;
    v_met := v_target is not null and p_reps >= v_target;
  else
    v_seconds := round(p_seconds, 2);
    if p_seconds is null or p_reps is not null or v_seconds <= 0 or v_seconds >= 3600 then
      raise exception 'This level is scored by its time' using errcode = '22023';
    end if;
    select min(a.seconds) into v_prev_seconds
      from public.home_drill_attempts a
     where a.player_id = p_player_id and a.item_id = p_item_id and a.level = p_level
       and a.kind = 'time' and not a.old_course;
    v_record := v_prev_seconds is not null and v_seconds < v_prev_seconds;
    v_met := v_target is not null and v_seconds <= v_target;
  end if;

  -- the target unlocks the next level only from the level the child is on
  select coalesce((select o.level from public.home_drill_level_overrides o
                    where o.player_id = p_player_id and o.item_id = p_item_id), 1) into v_current;
  if v_met and p_level = v_current and p_level < 3 then
    v_unlocked := p_level + 1;
    insert into public.home_drill_level_overrides (player_id, item_id, level, set_at, set_by)
    values (p_player_id, p_item_id, v_unlocked, now(), v_uid)
    on conflict (player_id, item_id) do update
      set level = excluded.level, set_at = excluded.set_at, set_by = excluded.set_by;
  end if;

  insert into public.home_drill_attempts
    (player_id, item_id, level, kind, reps, seconds, mode, done_on, recorded_by,
     previous_best_reps, previous_best_seconds, is_record, unlocked_level)
  values
    (p_player_id, p_item_id, p_level, v_kind,
     case when v_kind = 'reps' then p_reps end, case when v_kind = 'time' then v_seconds end,
     coalesce(p_mode, 'parent'), public.team_today(v_team), v_uid,
     v_prev_reps, v_prev_seconds, v_record, v_unlocked)
  returning id into v_id;

  -- the day's first score is the drill Done for the day; later ones change nothing there
  insert into public.home_drill_completions (player_id, item_id, level, mode)
  values (p_player_id, p_item_id, p_level, coalesce(p_mode, 'parent'))
  on conflict (player_id, item_id, done_on) do nothing;

  return v_id;
end;
$$;
revoke all on function public.record_drill_attempt(uuid, uuid, int, int, numeric, public.drill_mode) from public, anon;
grant execute on function public.record_drill_attempt(uuid, uuid, int, int, numeric, public.drill_mode) to authenticated, service_role;

-- Take a score back: the parent who recorded it, the same day. When it was the day's only score
-- of the drill, the Done goes with it. A level it unlocked stays (a parent can set the level).
create or replace function public.delete_drill_attempt(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.home_drill_attempts%rowtype;
  v_today date;
begin
  select * into v_a from public.home_drill_attempts a where a.id = p_attempt_id;
  if v_a.id is null or not public.can_train(v_a.player_id) then
    raise exception 'you can only do this for your own player' using errcode = '42501';
  end if;
  v_today := public.team_today(public.team_of_player(v_a.player_id));
  if v_a.recorded_by is distinct from (select auth.uid()) or v_a.done_on <> v_today then
    raise exception 'A score can be deleted the day it was recorded, by whoever recorded it'
      using errcode = '42501';
  end if;
  delete from public.home_drill_attempts a where a.id = p_attempt_id;
  if not exists (
    select 1 from public.home_drill_attempts a
     where a.player_id = v_a.player_id and a.item_id = v_a.item_id and a.done_on = v_today
  ) then
    delete from public.home_drill_completions c
     where c.player_id = v_a.player_id and c.item_id = v_a.item_id and c.done_on = v_today;
  end if;
end;
$$;
revoke all on function public.delete_drill_attempt(uuid) from public, anon;
grant execute on function public.delete_drill_attempt(uuid) to authenticated, service_role;

-- ---------- 2. personal bests ----------
create or replace function public.home_drill_bests(p_player_id uuid)
returns table (item_id uuid, level int, best_reps int, best_seconds numeric, attempts int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_see_training(p_player_id) then
    raise exception 'you cannot see this player''s training' using errcode = '42501';
  end if;
  return query
    select a.item_id, a.level, max(a.reps), min(a.seconds)::numeric, count(*)::int
      from public.home_drill_attempts a
     where a.player_id = p_player_id and not a.old_course
     group by a.item_id, a.level;
end;
$$;
revoke all on function public.home_drill_bests(uuid) from public, anon;
grant execute on function public.home_drill_bests(uuid) to authenticated, service_role;

-- ---------- 4. the ten drills ----------
-- `text` is read aloud and says what one count is; `parent_job` is the parent's one line;
-- `harder` is "Make it harder" under More; `challenge` is the mode, the countdown's length and
-- the score that unlocks the next level (none at Level 3). The targets are first estimates.
create or replace function pg_temp.set_home_levels(p_slug text, p_levels jsonb)
returns void
language sql
as $$
  update public.library_items i
     set content = jsonb_set(i.content, '{home,levels}', p_levels)
   where i.slug = p_slug and i.category = 'home';
$$;

select pg_temp.set_home_levels('toe-taps', $json$[
  {"text": "Tap the top of the ball with one foot, then the other. Count every tap.",
   "parent_job": "Tap + for every clean one.",
   "challenge": {"mode": "timer", "seconds": 60, "target": 40}},
  {"text": "Tap the top of the ball with one foot, then the other, looking up at me, not down at the ball. Count every tap.",
   "parent_job": "Tap + for every clean one.",
   "harder": "Hold up fingers; your child calls out the number without stopping.",
   "challenge": {"mode": "timer", "seconds": 60, "target": 70}},
  {"text": "Keep tapping the top of the ball while you move in a circle around it. Count every tap.",
   "parent_job": "Tap + for every clean one.",
   "harder": "Call \"freeze\" now and then; your child stops the ball with the sole.",
   "challenge": {"mode": "timer", "seconds": 60}}
]$json$::jsonb);

select pg_temp.set_home_levels('inside-inside-touches', $json$[
  {"text": "Knock the ball side to side between the insides of your feet. Count every touch.",
   "parent_job": "Tap + for every clean one.",
   "challenge": {"mode": "timer", "seconds": 60, "target": 40}},
  {"text": "Knock the ball side to side between the insides of your feet, looking up at me, not down at the ball. Count every touch.",
   "parent_job": "Tap + for every clean one.",
   "harder": "Hold up fingers; your child calls out the number without stopping.",
   "challenge": {"mode": "timer", "seconds": 60, "target": 70}},
  {"text": "Knock the ball side to side between your feet while you move forward and back. Count every touch.",
   "parent_job": "Tap + for every clean one.",
   "harder": "Call \"freeze\" now and then; your child stops the ball with the sole.",
   "challenge": {"mode": "timer", "seconds": 60}}
]$json$::jsonb);

select pg_temp.set_home_levels('sole-rolls', $json$[
  {"text": "Roll the bottom of your foot across the top of the ball, then roll it back with the other foot. Count every roll.",
   "parent_job": "Tap + for every clean one.",
   "challenge": {"mode": "timer", "seconds": 60, "target": 20}},
  {"text": "Roll the ball across and back with the bottom of your feet, without stopping. Count every roll.",
   "parent_job": "Tap + for every clean one.",
   "harder": "Hold up fingers; your child calls out the number without stopping.",
   "challenge": {"mode": "timer", "seconds": 60, "target": 35}},
  {"text": "Roll the ball sideways along a line and back, using both feet. Count every roll.",
   "parent_job": "Tap + for every clean one.",
   "harder": "Step left or right; your child rolls the ball the same way to follow you.",
   "challenge": {"mode": "timer", "seconds": 60}}
]$json$::jsonb);

select pg_temp.set_home_levels('v-cuts', $json$[
  {"text": "Push the ball forward, pull it back with the bottom of your foot, then push it out the other way. Switch feet each time. Count every V-cut.",
   "parent_job": "Tap + for every clean one.",
   "harder": "Stand in front like a defender, but don't go for the ball.",
   "challenge": {"mode": "timer", "seconds": 60, "target": 10}},
  {"text": "Using only your weaker foot, push the ball forward, pull it back with the bottom of your foot, then push it out the other way. Count every V-cut.",
   "parent_job": "Tap + for every clean one.",
   "harder": "Stand one step in front and point which way to go.",
   "challenge": {"mode": "timer", "seconds": 60, "target": 15}},
  {"text": "Push the ball forward, pull it back with the bottom of your foot, push it out the other way, then speed up for 3 yards. Count every V-cut.",
   "parent_job": "Tap + for every clean one.",
   "harder": "Stand in front like a defender, but don't go for the ball.",
   "challenge": {"mode": "timer", "seconds": 60}}
]$json$::jsonb);

select pg_temp.set_home_levels('l-drags', $json$[
  {"text": "Pull the ball back with the bottom of your foot, tap it behind your standing leg, and turn. Switch feet each time. Count every L-drag.",
   "parent_job": "Tap + for every clean one.",
   "harder": "Stand in front like a defender, but don't go for the ball.",
   "challenge": {"mode": "timer", "seconds": 60, "target": 8}},
  {"text": "Using only your weaker foot, pull the ball back with the bottom of your foot, tap it behind your standing leg, and turn. Count every L-drag.",
   "parent_job": "Tap + for every clean one.",
   "harder": "Stand in front and point which way to turn.",
   "challenge": {"mode": "timer", "seconds": 60, "target": 12}},
  {"text": "Dribble at me, pull the ball back with the bottom of your foot, tap it behind your standing leg, then speed up for 3 yards. Count every L-drag.",
   "parent_job": "Tap + for every clean one.",
   "harder": "Stand in front like a defender, but don't go for the ball.",
   "challenge": {"mode": "timer", "seconds": 60}}
]$json$::jsonb);

select pg_temp.set_home_levels('cone-dribbling', $json$[
  {"text": "Weave the ball through 4 cones set about 3 yards apart, down and back, without knocking one over.",
   "parent_job": "Run the stopwatch.",
   "harder": "Swap so your child times you.",
   "challenge": {"mode": "stopwatch", "target": 10.0}},
  {"text": "Weave the ball through 4 cones set about 3 yards apart, down and back, using only your stronger foot.",
   "parent_job": "Run the stopwatch.",
   "harder": "Call out the time to beat.",
   "challenge": {"mode": "stopwatch", "target": 8.0}},
  {"text": "Weave the ball through 4 cones set about 3 yards apart, down and back, using only your weaker foot.",
   "parent_job": "Run the stopwatch.",
   "challenge": {"mode": "stopwatch"}}
]$json$::jsonb);

select pg_temp.set_home_levels('inside-outside-touches', $json$[
  {"text": "With one foot, touch the ball with the inside, then the outside, as you walk. Switch feet when you turn. Count every touch.",
   "parent_job": "Tap + for every clean one.",
   "harder": "Walk backward in front of your child.",
   "challenge": {"mode": "timer", "seconds": 60, "target": 30}},
  {"text": "Go 10 yards with one foot, inside then outside, and come back with the other foot, without stopping. Count every touch.",
   "parent_job": "Tap + for every clean one.",
   "harder": "Walk backward in front holding up fingers; your child calls out the number.",
   "challenge": {"mode": "timer", "seconds": 60, "target": 45}},
  {"text": "Jog 10 yards touching the ball with the inside, then the outside, of one foot, and come back with the other. Count every touch.",
   "parent_job": "Tap + for every clean one.",
   "harder": "Jog backward in front holding up fingers; your child calls out the number.",
   "challenge": {"mode": "timer", "seconds": 60}}
]$json$::jsonb);

select pg_temp.set_home_levels('wall-passing-and-first-touch', $json$[
  {"text": "Pass the ball against the wall, stop it when it comes back, then pass again. Count every pass.",
   "parent_job": "Tap + for every clean one.",
   "challenge": {"mode": "timer", "seconds": 60, "target": 12}},
  {"text": "Pass against the wall and stop it, using the other foot each time. Count every pass.",
   "parent_job": "Tap + for every clean one.",
   "harder": "Call \"left\" or \"right\" for the next foot.",
   "challenge": {"mode": "timer", "seconds": 60, "target": 16}},
  {"text": "Pass against the wall, and let your first touch move the ball to the side before you pass again. Count every pass.",
   "parent_job": "Tap + for every clean one.",
   "harder": "Call \"left\" or \"right\" for which side the first touch goes.",
   "challenge": {"mode": "timer", "seconds": 60}}
]$json$::jsonb);

select pg_temp.set_home_levels('juggling', $json$[
  {"text": "Drop the ball from your hands, kick it up once, and catch it. Count every catch.",
   "parent_job": "Tap + for every clean one.",
   "challenge": {"mode": "timer", "seconds": 60, "target": 12}},
  {"text": "Drop the ball, touch it twice with your foot or thigh, and catch it. Count every catch.",
   "parent_job": "Tap + for every clean one.",
   "challenge": {"mode": "timer", "seconds": 60, "target": 8}},
  {"text": "Keep the ball up with your feet and thighs. One bounce between touches is fine. Count every touch.",
   "parent_job": "Tap + for every clean one.",
   "challenge": {"mode": "timer", "seconds": 60}}
]$json$::jsonb);

select pg_temp.set_home_levels('first-touch-and-passing-with-a-parent', $json$[
  {"text": "Stand 5 yards apart. Pass the ball to me, and stop it before you pass it back. Count every pass you make.",
   "parent_job": "Tap + for every clean one.",
   "challenge": {"mode": "timer", "seconds": 60, "target": 12}},
  {"text": "Stand 5 yards apart. Pass back and forth with me, using the other foot each time. Count every pass you make.",
   "parent_job": "Tap + for every clean one.",
   "harder": "Call \"left\" or \"right\" as you pass.",
   "challenge": {"mode": "timer", "seconds": 60, "target": 16}},
  {"text": "Pass the ball to me through two cones set 2 yards apart. Count every pass that goes through the cones.",
   "parent_job": "Tap + for every clean one.",
   "challenge": {"mode": "timer", "seconds": 60},
   "type": "accuracy"}
]$json$::jsonb);

-- Cone Dribbling's course, drawn: four cones in a line, the weave, and the spacing
update public.library_items
   set content = jsonb_set(content, '{home,diagram}', $json$
{
  "elements": [
    {"type": "cones", "id": "c", "from": [0, 0], "step": [1, 0], "count": 4},
    {"type": "measure", "from": "c0", "to": "c1", "label": "About 3 yd (9 ft)", "side": "above"},
    {"type": "player", "id": "start", "role": "attacker", "label": "Start", "at": ["c0", -0.75, 0]},
    {"type": "arrow", "kind": "dribble", "from": "start", "to": ["c0", 0.5, 0.3]},
    {"type": "arrow", "kind": "dribble", "from": ["c0", 0.5, 0.3], "to": ["c1", 0.5, -0.3]},
    {"type": "arrow", "kind": "dribble", "from": ["c1", 0.5, -0.3], "to": ["c2", 0.5, 0.3]},
    {"type": "arrow", "kind": "dribble", "from": ["c2", 0.5, 0.3], "to": ["c3", 0.45, -0.05]}
  ]
}
$json$::jsonb)
 where slug = 'cone-dribbling' and category = 'home';
