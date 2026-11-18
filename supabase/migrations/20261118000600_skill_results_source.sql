-- At-home Training (D132): skill test results recorded at home.
--
-- A parent can record a result on one of the team's existing skill tests for their own confirmed
-- child. Every result now carries its source, Coach or Home, and optional test conditions
-- ("backyard, size 3 ball"). The two are shown together and labelled, and never mixed into one
-- best or trend: the coach's screens compute from Coach results only.
--
-- Who writes what:
--   · coaches and assistant coaches record, edit and delete Coach results, as before, and cannot
--     edit or delete a Home result;
--   · a parent records a Home result for their own confirmed child, and edits or deletes only
--     the Home results they recorded themselves;
--   · the source of a result never changes.
-- Reading is unchanged: the team's coaches, and the child's confirmed parent.

create type public.skill_source as enum ('coach', 'home');

alter table public.skill_results
  add column source public.skill_source not null default 'coach',
  add column conditions text check (conditions is null or length(conditions) <= 200);

-- ---------- policies ----------
drop policy skill_results_write_staff on public.skill_results;
create policy skill_results_insert_staff on public.skill_results for insert to authenticated
  with check (source = 'coach' and public.is_staff(public.team_of_player(player_id)));
create policy skill_results_update_staff on public.skill_results for update to authenticated
  using (source = 'coach' and public.is_staff(public.team_of_player(player_id)))
  with check (source = 'coach' and public.is_staff(public.team_of_player(player_id)));
create policy skill_results_delete_staff on public.skill_results for delete to authenticated
  using (source = 'coach' and public.is_staff(public.team_of_player(player_id)));

create policy skill_results_insert_home on public.skill_results for insert to authenticated
  with check (source = 'home' and recorded_by = (select auth.uid()) and public.can_train(player_id));
create policy skill_results_update_home on public.skill_results for update to authenticated
  using (source = 'home' and recorded_by = (select auth.uid()) and public.can_train(player_id))
  with check (source = 'home' and recorded_by = (select auth.uid()) and public.can_train(player_id));
create policy skill_results_delete_home on public.skill_results for delete to authenticated
  using (source = 'home' and recorded_by = (select auth.uid()) and public.can_train(player_id));

-- ---------- the stamp: the source is fixed; a Home result is checked ----------
create or replace function public.skill_results_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
begin
  if tg_op = 'UPDATE' then
    new.recorded_by := old.recorded_by;
    new.created_at := old.created_at;
    new.source := old.source;
    new.player_id := old.player_id;
  end if;
  if new.source = 'home' then
    v_team := public.team_of_player(new.player_id);
    if not exists (
      select 1 from public.skill_tests t
      where t.id = new.skill_test_id and t.team_id = v_team and t.is_active
    ) then
      raise exception 'That is not one of the team''s skill tests' using errcode = '23514';
    end if;
    if new.tested_on > public.team_today(v_team) then
      raise exception 'A result cannot be dated in the future' using errcode = '23514';
    end if;
    new.conditions := nullif(trim(new.conditions), '');
  end if;
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

-- ---------- copying a team keeps each result's source and conditions ----------
create or replace function public.duplicate_team(p_source uuid, p_name text, p_owner uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := coalesce(p_owner, (select auth.uid()));
  v_src public.teams%rowtype;
  v_new uuid;
  v_code text;
  v_season_old uuid;
  v_season_new uuid;
  r record;
  v_id uuid;
begin
  if (select auth.uid()) is not null and not public.is_platform_admin() then
    raise exception 'only a platform admin can duplicate a team' using errcode = '42501';
  end if;
  if v_uid is null then
    raise exception 'an owner is required (pass p_owner when there is no signed-in user)' using errcode = '22023';
  end if;
  select * into v_src from public.teams t where t.id = p_source;
  if not found then
    raise exception 'source team not found' using errcode = 'P0002';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 40 then
    raise exception 'the new name must be 1–40 characters' using errcode = '22023';
  end if;

  -- id maps (temp tables; truncated so the function can run twice in one transaction)
  create temp table if not exists map_players (old uuid primary key, new uuid not null);
  create temp table if not exists map_tests (old uuid primary key, new uuid not null);
  create temp table if not exists map_games (old uuid primary key, new uuid not null);
  create temp table if not exists map_lineups (old uuid primary key, new uuid not null);
  truncate pg_temp.map_players, pg_temp.map_tests, pg_temp.map_games, pg_temp.map_lineups;

  -- ---------- team ----------
  loop
    v_code := public.generate_join_code();
    exit when not exists (select 1 from public.teams t where t.join_code = v_code);
  end loop;
  insert into public.teams (name, sport, owner_id, join_code, join_enabled, side_size, has_gk, periods_count, colors,
                            timezone, parent_stats, time_mode, clock_periods, period_minutes, updated_by)
  values (trim(p_name), v_src.sport, v_uid, v_code, false, v_src.side_size, v_src.has_gk, v_src.periods_count, v_src.colors,
          v_src.timezone, v_src.parent_stats, v_src.time_mode, v_src.clock_periods, v_src.period_minutes, v_uid)
  returning id into v_new;
  insert into public.team_members (team_id, user_id, role, status, approved_by, approved_at)
  values (v_new, v_uid, 'coach', 'active', v_uid, now());

  -- ---------- the current season ----------
  select s.id into v_season_old from public.seasons s where s.team_id = p_source and s.is_current limit 1;
  if v_season_old is null then
    select s.id into v_season_old from public.seasons s where s.team_id = p_source order by s.created_at desc limit 1;
  end if;
  if v_season_old is not null then
    insert into public.seasons (team_id, name, starts_on, ends_on, is_current)
    select v_new, s.name, s.starts_on, s.ends_on, true from public.seasons s where s.id = v_season_old
    returning id into v_season_new;
  else
    insert into public.seasons (team_id, name, is_current) values (v_new, extract(year from now())::text || ' season', true)
    returning id into v_season_new;
  end if;

  -- ---------- players, details, contacts ----------
  for r in select * from public.players p where p.team_id = p_source order by p.sort_order, p.created_at loop
    insert into public.players (team_id, first_name, last_name, jersey_number, is_available, batting_order, sort_order, archived_at, updated_by)
    values (v_new, r.first_name, r.last_name, r.jersey_number, r.is_available, r.batting_order, r.sort_order, r.archived_at, v_uid)
    returning id into v_id;
    insert into pg_temp.map_players (old, new) values (r.id, v_id);
  end loop;
  insert into public.player_details (player_id, birthdate, shirt_size, updated_by)
  select m.new, d.birthdate, d.shirt_size, v_uid
  from public.player_details d join pg_temp.map_players m on m.old = d.player_id;
  insert into public.player_contacts (player_id, name, relationship, email, phone, user_id, sort_order, share_with_team, updated_by)
  select m.new, c.name, c.relationship, c.email, c.phone, null, c.sort_order, c.share_with_team, v_uid
  from public.player_contacts c join pg_temp.map_players m on m.old = c.player_id;
  update public.teams set last_batter_player_id = (select m.new from pg_temp.map_players m where m.old = v_src.last_batter_player_id)
  where id = v_new and v_src.last_batter_player_id is not null;

  -- ---------- skills ----------
  for r in select * from public.skill_tests t where t.team_id = p_source order by t.sort_order, t.created_at loop
    insert into public.skill_tests (team_id, key, name, instructions, metric, unit, has_sides, higher_is_better, sort_order, is_active, updated_by)
    values (v_new, r.key, r.name, r.instructions, r.metric, r.unit, r.has_sides, r.higher_is_better, r.sort_order, r.is_active, v_uid)
    returning id into v_id;
    insert into pg_temp.map_tests (old, new) values (r.id, v_id);
  end loop;
  insert into public.skill_results (player_id, skill_test_id, tested_on, value, attempts, side, note, recorded_by, created_at, updated_by, source, conditions)
  select mp.new, mt.new, s.tested_on, s.value, s.attempts, s.side, s.note, s.recorded_by, s.created_at, v_uid, s.source, s.conditions
  from public.skill_results s
  join pg_temp.map_players mp on mp.old = s.player_id
  join pg_temp.map_tests mt on mt.old = s.skill_test_id;

  -- ---------- games of the season ----------
  for r in select * from public.games g where g.team_id = p_source and (v_season_old is null or g.season_id = v_season_old) order by g.created_at loop
    insert into public.games (team_id, season_id, opponent, game_date, start_time, location, address, home_away, parent_notes, status,
                              team_name_snapshot, started_at, finished_at, clock_period, clock_seconds, clock_running_since,
                              clock_period_lengths, created_at, updated_by)
    values (v_new, v_season_new, r.opponent, r.game_date, r.start_time, r.location, r.address, r.home_away, r.parent_notes, r.status,
            r.team_name_snapshot, r.started_at, r.finished_at, r.clock_period, r.clock_seconds, r.clock_running_since,
            r.clock_period_lengths, r.created_at, v_uid)
    returning id into v_id;
    insert into pg_temp.map_games (old, new) values (r.id, v_id);
  end loop;
  insert into public.game_players (game_id, player_id, name_snapshot, number_snapshot, available)
  select mg.new, mp.new, gp.name_snapshot, gp.number_snapshot, gp.available
  from public.game_players gp
  join pg_temp.map_games mg on mg.old = gp.game_id
  join pg_temp.map_players mp on mp.old = gp.player_id;
  insert into public.score_events (game_id, side, period_index, event_type, points, scorer_player_id, assist_player_id, occurred_at,
                                   created_by, created_at, clock_seconds)
  select mg.new, e.side, e.period_index, e.event_type, e.points,
         (select m.new from pg_temp.map_players m where m.old = e.scorer_player_id),
         (select m.new from pg_temp.map_players m where m.old = e.assist_player_id),
         e.occurred_at, e.created_by, e.created_at, e.clock_seconds
  from public.score_events e join pg_temp.map_games mg on mg.old = e.game_id
  order by e.occurred_at, e.created_at;
  insert into public.plate_appearances (game_id, player_id, inning, sequence, result, rbi, occurred_at, created_by, created_at)
  select mg.new, mp.new, pa.inning, pa.sequence, pa.result, pa.rbi, pa.occurred_at, pa.created_by, pa.created_at
  from public.plate_appearances pa
  join pg_temp.map_games mg on mg.old = pa.game_id
  join pg_temp.map_players mp on mp.old = pa.player_id;
  insert into public.stints (game_id, player_id, period_index, slot_index, position_role, position_code, clock_start, clock_end, created_at, created_by)
  select mg.new, mp.new, s.period_index, s.slot_index, s.position_role, s.position_code, s.clock_start, s.clock_end, s.created_at, s.created_by
  from public.stints s
  join pg_temp.map_games mg on mg.old = s.game_id
  join pg_temp.map_players mp on mp.old = s.player_id;

  -- ---------- lineups: the template and every copied game's, with the bench queue ----------
  for r in select l.* from public.lineups l
           where l.team_id = p_source and (l.game_id is null or l.game_id in (select old from pg_temp.map_games))
           order by l.game_id nulls first, l.period_index loop
    insert into public.lineups (team_id, game_id, period_index, formation_name, bench_order)
    values (v_new, (select mg.new from pg_temp.map_games mg where mg.old = r.game_id), r.period_index, r.formation_name,
            coalesce(array(select m.new from unnest(r.bench_order) with ordinality as b(old, ord)
                           join pg_temp.map_players m on m.old = b.old order by b.ord), '{}'))
    returning id into v_id;
    insert into pg_temp.map_lineups (old, new) values (r.id, v_id);
  end loop;
  insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code, player_id, auto_picked)
  select ml.new, s.slot_index, s.position_role, s.position_code,
         (select m.new from pg_temp.map_players m where m.old = s.player_id), s.auto_picked
  from public.lineup_slots s join pg_temp.map_lineups ml on ml.old = s.lineup_id;

  -- ---------- practices of the season ----------
  insert into public.practices (team_id, season_id, practice_date, start_time, end_time, location, address, notes, status, created_at, created_by, updated_by)
  select v_new, v_season_new, p.practice_date, p.start_time, p.end_time, p.location, p.address, p.notes, p.status, p.created_at, p.created_by, v_uid
  from public.practices p
  where p.team_id = p_source and (v_season_old is null or p.season_id = v_season_old);

  return v_new;
end;
$$;
