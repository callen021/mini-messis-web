-- =====================================================================================================
-- Reset the Strikers for launch.
--
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste this whole file -> Run.
-- The editor runs as the `postgres` role: RLS does not apply, but triggers still fire (handled below).
--
-- What it does
--   Step 1  Backs up EVERY public table into a schema called backup_prelaunch (create table ... as
--           select). A table that is already in the backup is left alone, so re-running never
--           overwrites the first backup. To take a fresh backup, drop the schema first (see the end).
--   Step 2  Logs, per table, how many rows will be deleted and how many kept.
--   Step 3  In ONE transaction:
--             - deletes every team except the Strikers, with all of their rows;
--             - on the Strikers: deletes all score events, plate appearances, coach notes, game
--               player snapshots, game-scoped lineups (+ slots), skill results, guardian links,
--               unlisted-child requests, and every membership except the owner's coach row;
--             - resets every Strikers game to 'upcoming' (started_at / finished_at / name snapshot
--               cleared) and empties the template lineup slots (lineups + formations stay);
--             - deletes every join attempt (it is a per-user rate-limit log, not team data).
--           Kept: the Strikers team row and settings, seasons, players, games, practices,
--           skill tests, and every profile. Auth users are NOT touched here (delete test accounts
--           in Authentication -> Users afterwards; see docs/LAUNCH.md).
--   Step 4  Logs the counts again (everything "to delete" should now be 0).
--
-- Where to see the output: the counts are written to backup_prelaunch.reset_log and the last
-- statement selects them, so they appear in the Results panel. They are also emitted with
-- RAISE NOTICE; the SQL editor shows those under the Results/Messages area only sometimes, so
-- trust the table.
--
-- Safety
--   - It fails loudly (nothing deleted) unless there is exactly one team named "Strikers"
--     (case-insensitive) with sport 'soccer'. Rename teams in the app or the Table Editor first.
--   - If Step 3 fails, the transaction rolls back; the backup from Step 1 is kept.
--   - Safe to re-run: the second run backs up nothing new, finds nothing to delete, and does not error.
--   - Undo: scripts/restore-from-prelaunch-backup.sql (run BEFORE deleting any auth users).
--
-- Triggers this script works around (all defined in supabase/migrations):
--   team_members_keep_a_coach  would refuse to delete the last active coach of a team that still
--                              exists. It is disabled for the duration of Step 3 only; the end state
--                              keeps the invariant (other teams are gone, the Strikers keep the owner).
--   skill_tests_guard          refuses to delete a test that has results: results are deleted first.
--   games_stamp / *_updated_at stamp columns; harmless with no JWT (auth.uid() is null).
--   lineup_slots_validate      only checks a non-null player; clearing slots is fine.
--   teams_guard_update         not triggered (the team row is never updated).
-- Foreign keys without cascade that dictate the delete order: games.season_id and
-- practices.season_id (seasons last), game_players.player_id and plate_appearances.player_id
-- (game rows before players), skill_results.skill_test_id is RESTRICT (results before tests).
-- =====================================================================================================

-- ---------------------------------------------------------------------------------------------------
-- Step 0: helpers (live in the backup schema so they disappear with it)
-- ---------------------------------------------------------------------------------------------------
create schema if not exists backup_prelaunch;

-- The one and only Strikers, or an exception listing every team so you can fix the name.
create or replace function backup_prelaunch.strikers_id()
returns uuid
language plpgsql
as $$
declare
  v_n     int;
  v_id    uuid;
  v_teams text;
begin
  select count(*), (array_agg(t.id))[1] into v_n, v_id
  from public.teams t
  where lower(trim(t.name)) = 'strikers' and t.sport = 'soccer';
  if v_n <> 1 then
    select string_agg(format('"%s" (%s%s)', t.name, t.sport, case when t.archived_at is null then '' else ', archived' end), ', ' order by t.name)
      into v_teams
    from public.teams t;
    raise exception 'Expected exactly one team named "Strikers" with sport soccer, found %. Teams in the database: %',
      v_n, coalesce(v_teams, '(none)');
  end if;
  return v_id;
end;
$$;

create table if not exists backup_prelaunch.reset_log (
  run_at     timestamptz not null default clock_timestamp(),
  phase      text        not null,   -- 'before' or 'after'
  table_name text        not null,
  to_delete  bigint      not null,
  to_keep    bigint      not null
);

create table if not exists backup_prelaunch.backup_meta (
  table_name  text        primary key,
  backed_up   timestamptz not null default clock_timestamp(),
  row_count   bigint      not null
);

-- Count, per table, what Step 3 will remove and what it will keep, log it and print it.
create or replace function backup_prelaunch.log_counts(p_phase text)
returns void
language plpgsql
as $$
declare
  v_team  uuid := backup_prelaunch.strikers_id();
  v_owner uuid;
  v_run   timestamptz := clock_timestamp();  -- one stamp for every row of this phase
  r       record;
begin
  select t.owner_id into v_owner from public.teams t where t.id = v_team;

  insert into backup_prelaunch.reset_log (phase, table_name, to_delete, to_keep, run_at)
  select p_phase, v.table_name, v.to_delete, v.to_keep, v_run
  from (values
    ('teams',
      (select count(*) from public.teams t where t.id <> v_team),
      (select count(*) from public.teams t where t.id = v_team)),
    ('seasons',
      (select count(*) from public.seasons s where s.team_id <> v_team),
      (select count(*) from public.seasons s where s.team_id = v_team)),
    ('team_members',
      (select count(*) from public.team_members m where not (m.team_id = v_team and m.user_id = v_owner)),
      (select count(*) from public.team_members m where m.team_id = v_team and m.user_id = v_owner)),
    ('unlisted_child_requests',
      (select count(*) from public.unlisted_child_requests u join public.team_members m on m.id = u.member_id
        where not (m.team_id = v_team and m.user_id = v_owner)),
      (select count(*) from public.unlisted_child_requests u join public.team_members m on m.id = u.member_id
        where m.team_id = v_team and m.user_id = v_owner)),
    ('players',
      (select count(*) from public.players p where p.team_id <> v_team),
      (select count(*) from public.players p where p.team_id = v_team)),
    ('player_guardians',
      (select count(*) from public.player_guardians), 0),
    ('games',
      (select count(*) from public.games g where g.team_id <> v_team),
      (select count(*) from public.games g where g.team_id = v_team)),
    ('game_coach_notes',
      (select count(*) from public.game_coach_notes), 0),
    ('game_players',
      (select count(*) from public.game_players), 0),
    ('score_events',
      (select count(*) from public.score_events), 0),
    ('plate_appearances',
      (select count(*) from public.plate_appearances), 0),
    ('lineups',
      (select count(*) from public.lineups l where l.team_id <> v_team or l.game_id is not null),
      (select count(*) from public.lineups l where l.team_id = v_team and l.game_id is null)),
    ('lineup_slots',
      (select count(*) from public.lineup_slots s join public.lineups l on l.id = s.lineup_id
        where l.team_id <> v_team or l.game_id is not null),
      (select count(*) from public.lineup_slots s join public.lineups l on l.id = s.lineup_id
        where l.team_id = v_team and l.game_id is null)),
    ('skill_tests',
      (select count(*) from public.skill_tests t where t.team_id <> v_team),
      (select count(*) from public.skill_tests t where t.team_id = v_team)),
    ('skill_results',
      (select count(*) from public.skill_results), 0),
    ('practices',
      (select count(*) from public.practices p where p.team_id <> v_team),
      (select count(*) from public.practices p where p.team_id = v_team)),
    ('join_attempts',
      (select count(*) from public.join_attempts), 0),
    ('profiles',
      0, (select count(*) from public.profiles))
  ) as v(table_name, to_delete, to_keep);

  raise notice '---- % ----', p_phase;
  for r in
    select l.table_name, l.to_delete, l.to_keep
    from backup_prelaunch.reset_log l
    where l.phase = p_phase and l.run_at = v_run
    order by l.table_name
  loop
    raise notice '%: delete %, keep %', rpad(r.table_name, 24), r.to_delete, r.to_keep;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Step 1: validate the target and back up every public table (skips tables already backed up)
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  v_team uuid := backup_prelaunch.strikers_id();   -- raises if not exactly one
  t      text;
  v_n    bigint;
begin
  raise notice 'Strikers team id: %', v_team;
  foreach t in array array[
    'profiles', 'teams', 'seasons', 'team_members', 'players', 'player_guardians',
    'unlisted_child_requests', 'games', 'game_coach_notes', 'game_players', 'lineups', 'lineup_slots',
    'score_events', 'plate_appearances', 'skill_tests', 'skill_results', 'join_attempts', 'practices'
  ] loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'backup_prelaunch' and table_name = t
    ) then
      raise notice 'backup_prelaunch.% already exists - kept as is (drop the schema to take a fresh backup)', t;
      continue;
    end if;
    execute format('create table backup_prelaunch.%I as select * from public.%I', t, t);
    execute format('select count(*) from backup_prelaunch.%I', t) into v_n;
    insert into backup_prelaunch.backup_meta (table_name, row_count) values (t, v_n)
      on conflict (table_name) do update set backed_up = clock_timestamp(), row_count = excluded.row_count;
    raise notice 'backed up public.% (% rows)', t, v_n;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Step 2: what will be deleted / kept
-- ---------------------------------------------------------------------------------------------------
select backup_prelaunch.log_counts('before');

-- ---------------------------------------------------------------------------------------------------
-- Step 3: the reset, in one transaction (anything above is already committed when BEGIN runs)
-- ---------------------------------------------------------------------------------------------------
begin;

do $$
declare
  v_team  uuid := backup_prelaunch.strikers_id();
  v_owner uuid;
begin
  select t.owner_id into v_owner from public.teams t where t.id = v_team;

  -- The keep-a-coach guard would refuse to remove the last coach of a team that still exists.
  -- Every team but the Strikers is being removed whole, and the Strikers keep their owner's coach
  -- row, so the invariant holds at the end; switch the guard off just for this transaction.
  alter table public.team_members disable trigger team_members_keep_a_coach;

  -- ---- every other team, in foreign-key order ----
  delete from public.score_events e      using public.games g where e.game_id = g.id and g.team_id <> v_team;
  delete from public.plate_appearances a using public.games g where a.game_id = g.id and g.team_id <> v_team;
  delete from public.game_coach_notes n  using public.games g where n.game_id = g.id and g.team_id <> v_team;
  delete from public.game_players gp     using public.games g where gp.game_id = g.id and g.team_id <> v_team;
  delete from public.lineup_slots s      using public.lineups l where s.lineup_id = l.id and l.team_id <> v_team;
  delete from public.lineups  where team_id <> v_team;
  delete from public.games    where team_id <> v_team;
  delete from public.skill_results r     using public.players p where r.player_id = p.id and p.team_id <> v_team;
  delete from public.skill_tests where team_id <> v_team;          -- guard passes: no results left
  delete from public.player_guardians g  using public.players p where g.player_id = p.id and p.team_id <> v_team;
  delete from public.players  where team_id <> v_team;             -- teams.last_batter_player_id -> set null
  delete from public.practices where team_id <> v_team;
  delete from public.seasons  where team_id <> v_team;
  delete from public.unlisted_child_requests u using public.team_members m where u.member_id = m.id and m.team_id <> v_team;
  delete from public.team_members where team_id <> v_team;
  delete from public.teams    where id <> v_team;                  -- profiles.last_team_id -> set null

  -- ---- the Strikers: wipe game history and people, keep the plan ----
  delete from public.score_events e      using public.games g where e.game_id = g.id and g.team_id = v_team;
  delete from public.plate_appearances a using public.games g where a.game_id = g.id and g.team_id = v_team;
  delete from public.game_coach_notes n  using public.games g where n.game_id = g.id and g.team_id = v_team;
  delete from public.game_players gp     using public.games g where gp.game_id = g.id and g.team_id = v_team;
  delete from public.lineup_slots s      using public.lineups l
    where s.lineup_id = l.id and l.team_id = v_team and l.game_id is not null;
  delete from public.lineups where team_id = v_team and game_id is not null;

  update public.games
  set status = 'upcoming', started_at = null, finished_at = null, team_name_snapshot = null
  where team_id = v_team
    and (status <> 'upcoming' or started_at is not null or finished_at is not null or team_name_snapshot is not null);

  update public.lineup_slots s
  set player_id = null, auto_picked = false
  from public.lineups l
  where s.lineup_id = l.id and l.team_id = v_team and l.game_id is null
    and (s.player_id is not null or s.auto_picked);

  delete from public.skill_results r    using public.players p where r.player_id = p.id and p.team_id = v_team;
  delete from public.player_guardians g using public.players p where g.player_id = p.id and p.team_id = v_team;
  delete from public.unlisted_child_requests u using public.team_members m where u.member_id = m.id and m.team_id = v_team;

  -- the owner's membership must be an active coach row (recreate it if it was ever removed)
  insert into public.team_members (team_id, user_id, role, status, requested_role, approved_by, approved_at)
  values (v_team, v_owner, 'coach', 'active', 'coach', v_owner, now())
  on conflict (team_id, user_id) do update
    set role = 'coach', status = 'active', requested_role = 'coach', note = null;
  delete from public.team_members where team_id = v_team and user_id <> v_owner;

  -- rate-limit log: per user, not per team; nothing to keep
  delete from public.join_attempts;

  alter table public.team_members enable trigger team_members_keep_a_coach;

  -- sanity: the invariant the guard protects
  if not exists (
    select 1 from public.team_members m
    where m.team_id = v_team and m.user_id = v_owner and m.role = 'coach' and m.status = 'active'
  ) then
    raise exception 'owner coach membership missing after reset - rolling back';
  end if;
  if (select count(*) from public.teams) <> 1 then
    raise exception 'expected exactly one team after reset - rolling back';
  end if;
end;
$$;

commit;

-- ---------------------------------------------------------------------------------------------------
-- Step 4: counts again (every "to_delete" should be 0 now), shown in the Results panel
-- ---------------------------------------------------------------------------------------------------
select backup_prelaunch.log_counts('after');

select l.phase, l.table_name, l.to_delete, l.to_keep, l.run_at
from backup_prelaunch.reset_log l
where l.run_at >= (select max(x.run_at) from backup_prelaunch.reset_log x where x.phase = 'before')
order by l.run_at, l.table_name;

-- ---------------------------------------------------------------------------------------------------
-- Afterwards
--   - Delete test accounts in Authentication -> Users (their profiles go with them via cascade).
--   - Keep backup_prelaunch until you are happy with the live app, then drop it:
--       drop schema backup_prelaunch cascade;
--   - To undo everything instead: scripts/restore-from-prelaunch-backup.sql (before deleting users).
-- ---------------------------------------------------------------------------------------------------
