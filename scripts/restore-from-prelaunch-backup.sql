-- =====================================================================================================
-- Restore every public table from the backup_prelaunch schema written by
-- scripts/reset-strikers-for-launch.sql.
--
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run (as `postgres`).
--
-- What it does, in ONE transaction:
--   1. Fails loudly if the backup schema or any of its 18 tables is missing.
--   2. Switches off the user-defined triggers on every public table (updated_at stamps, the
--      keep-a-coach guard, the skill-test lock, validators) so rows go back exactly as they were.
--      Foreign keys stay on, so the inserts run in dependency order. (`disable trigger all` would
--      also switch off foreign-key triggers but needs a real superuser, which the dashboard role
--      is not; `disable trigger user` is enough and is allowed for the table owner.)
--   3. Deletes all current team data (delete from teams cascades to everything team-scoped) and
--      the join-attempt log, then re-inserts every backed-up row.
--      profiles are NOT deleted: they are upserted from the backup, so anyone who signed up after
--      the backup keeps a profile row (auth.users is never touched by these scripts).
--   4. Re-enables the triggers.
--
-- Requirements
--   - Same schema version as when the backup was taken: the copies use `insert ... select *`, so a
--     migration that added a column since the backup makes the matching insert fail (the whole
--     restore then rolls back; nothing is half-restored).
--   - Run it BEFORE deleting any auth users: backed-up rows that reference a deleted user
--     (owner_id, user_id, created_by, ...) would violate a foreign key and roll the restore back.
--
-- Afterwards, once you no longer need the backup:
--     drop schema backup_prelaunch cascade;
-- =====================================================================================================

do $$
declare
  t text;
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'backup_prelaunch') then
    raise exception 'backup_prelaunch schema not found - nothing to restore from';
  end if;
  foreach t in array array[
    'profiles', 'teams', 'seasons', 'team_members', 'players', 'player_guardians',
    'unlisted_child_requests', 'games', 'game_coach_notes', 'game_players', 'lineups', 'lineup_slots',
    'score_events', 'plate_appearances', 'skill_tests', 'skill_results', 'join_attempts', 'practices'
  ] loop
    if not exists (
      select 1 from information_schema.tables where table_schema = 'backup_prelaunch' and table_name = t
    ) then
      raise exception 'backup_prelaunch.% is missing - the backup is incomplete, refusing to restore', t;
    end if;
  end loop;
end;
$$;

begin;

-- 2. user triggers off (foreign keys stay on)
alter table public.profiles                disable trigger user;
alter table public.teams                   disable trigger user;
alter table public.seasons                 disable trigger user;
alter table public.team_members            disable trigger user;
alter table public.players                 disable trigger user;
alter table public.player_guardians        disable trigger user;
alter table public.unlisted_child_requests disable trigger user;
alter table public.games                   disable trigger user;
alter table public.game_coach_notes        disable trigger user;
alter table public.game_players            disable trigger user;
alter table public.lineups                 disable trigger user;
alter table public.lineup_slots            disable trigger user;
alter table public.score_events            disable trigger user;
alter table public.plate_appearances       disable trigger user;
alter table public.skill_tests             disable trigger user;
alter table public.skill_results           disable trigger user;
alter table public.join_attempts           disable trigger user;
alter table public.practices               disable trigger user;

-- 3a. clear current data (cascades: seasons, members (+ unlisted requests), players (+ guardians,
--     skill results), games (+ notes, snapshots, score events, plate appearances, lineups, slots),
--     skill tests, practices; profiles.last_team_id and teams.last_batter_player_id are set null)
delete from public.teams;
delete from public.join_attempts;

-- 3b. re-insert in dependency order
-- teams first without last_batter_player_id (it points at players, which point back at teams)
insert into public.teams (
  id, name, sport, owner_id, join_code, join_code_rotated_at, side_size, has_gk, periods_count,
  colors, last_batter_player_id, archived_at, created_at, updated_at, updated_by
)
select
  b.id, b.name, b.sport, b.owner_id, b.join_code, b.join_code_rotated_at, b.side_size, b.has_gk,
  b.periods_count, b.colors, null, b.archived_at, b.created_at, b.updated_at, b.updated_by
from backup_prelaunch.teams b;

insert into public.seasons                 select * from backup_prelaunch.seasons;
insert into public.team_members            select * from backup_prelaunch.team_members;
insert into public.players                 select * from backup_prelaunch.players;

update public.teams t
set last_batter_player_id = b.last_batter_player_id
from backup_prelaunch.teams b
where b.id = t.id and b.last_batter_player_id is not null;

insert into public.player_guardians        select * from backup_prelaunch.player_guardians;
insert into public.unlisted_child_requests select * from backup_prelaunch.unlisted_child_requests;
insert into public.games                   select * from backup_prelaunch.games;
insert into public.game_coach_notes        select * from backup_prelaunch.game_coach_notes;
insert into public.game_players            select * from backup_prelaunch.game_players;
insert into public.lineups                 select * from backup_prelaunch.lineups;
insert into public.lineup_slots            select * from backup_prelaunch.lineup_slots;
insert into public.score_events            select * from backup_prelaunch.score_events;
insert into public.plate_appearances       select * from backup_prelaunch.plate_appearances;
insert into public.skill_tests             select * from backup_prelaunch.skill_tests;
insert into public.skill_results           select * from backup_prelaunch.skill_results;
insert into public.practices               select * from backup_prelaunch.practices;

-- identity column: keep the original ids, then move the sequence past them
insert into public.join_attempts overriding system value select * from backup_prelaunch.join_attempts;
select setval(
  pg_get_serial_sequence('public.join_attempts', 'id'),
  coalesce((select max(id) from public.join_attempts), 0) + 1,
  false
);

-- profiles: upsert (never delete - a profile belongs to an auth user that may still exist)
insert into public.profiles
select * from backup_prelaunch.profiles
on conflict (id) do update
  set display_name      = excluded.display_name,
      theme             = excluded.theme,
      field_view        = excluded.field_view,
      last_team_id      = excluded.last_team_id,
      is_platform_admin = excluded.is_platform_admin,
      created_at        = excluded.created_at,
      updated_at        = excluded.updated_at;

-- 4. triggers back on
alter table public.profiles                enable trigger user;
alter table public.teams                   enable trigger user;
alter table public.seasons                 enable trigger user;
alter table public.team_members            enable trigger user;
alter table public.players                 enable trigger user;
alter table public.player_guardians        enable trigger user;
alter table public.unlisted_child_requests enable trigger user;
alter table public.games                   enable trigger user;
alter table public.game_coach_notes        enable trigger user;
alter table public.game_players            enable trigger user;
alter table public.lineups                 enable trigger user;
alter table public.lineup_slots            enable trigger user;
alter table public.score_events            enable trigger user;
alter table public.plate_appearances       enable trigger user;
alter table public.skill_tests             enable trigger user;
alter table public.skill_results           enable trigger user;
alter table public.join_attempts           enable trigger user;
alter table public.practices               enable trigger user;

commit;

-- Row counts after the restore, next to what the backup holds (should match except profiles,
-- which may hold extra rows for users who signed up after the backup).
select m.table_name, m.row_count as backed_up,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', m.table_name), false, true, '')))[1]::text::bigint as now_in_public
from backup_prelaunch.backup_meta m
order by m.table_name;

-- =====================================================================================================
-- When you are done with the backup (after the restore, or after launch went well):
--     drop schema backup_prelaunch cascade;
-- That removes the copied tables, the helper functions and the reset_log; nothing in public is touched.
-- =====================================================================================================
