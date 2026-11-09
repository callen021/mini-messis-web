-- Phase 5: stats function, batting order, parent limits (pgTAP).
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create or replace function pg_temp.mk_user(p_id uuid, p_email text)
returns void language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email, 'x', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
end $$;
create or replace function pg_temp.login(p_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.logout()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;

select pg_temp.mk_user('f1000000-0000-0000-0000-000000000001', 'coach-g@test.com');
select pg_temp.mk_user('f1000000-0000-0000-0000-000000000002', 'parent-g@test.com');
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

-- a baseball team so every stat column gets exercised
select pg_temp.login('f1000000-0000-0000-0000-000000000001');
insert into ctx select 'team', public.create_team('Sluggers', 'baseball', 6, false, 2, '{}'::jsonb,
  '[{"formation_name":"6","slots":[{"position_role":"P","position_code":"P"},{"position_role":"C","position_code":"C"},{"position_role":"1B","position_code":"1B"},{"position_role":"SS","position_code":"SS"},{"position_role":"LF","position_code":"LF"},{"position_role":"RF","position_code":"RF"}]},
    {"formation_name":"6","slots":[{"position_role":"P","position_code":"P"},{"position_role":"C","position_code":"C"},{"position_role":"1B","position_code":"1B"},{"position_role":"SS","position_code":"SS"},{"position_role":"LF","position_code":"LF"},{"position_role":"RF","position_code":"RF"}]}]'::jsonb);
insert into public.players (id, team_id, first_name, jersey_number) values
  ('e3000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), 'Ava', '1'),
  ('e3000000-0000-0000-0000-000000000002', (select v from ctx where k = 'team'), 'Ben', '2'),
  ('e3000000-0000-0000-0000-000000000003', (select v from ctx where k = 'team'), 'Cal', '3');

-- batting order
select lives_ok($$select public.set_batting_order((select v from ctx where k = 'team'),
  array['e3000000-0000-0000-0000-000000000003','e3000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000002']::uuid[])$$, 'set_batting_order works');
select is((select batting_order from public.players where id = 'e3000000-0000-0000-0000-000000000003'), 1, 'first listed bats first');
select is((select batting_order from public.players where id = 'e3000000-0000-0000-0000-000000000002'), 3, 'last listed bats last');

-- a game with lineups, runs and plate appearances
insert into public.games (id, team_id, season_id, opponent, start_time, location, home_away, parent_notes)
values ('a3000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'),
  (select id from public.seasons where team_id = (select v from ctx where k = 'team')), 'Bears', '09:30', 'Field 2', 'home', 'Wear white');
update public.lineup_slots s set player_id = 'e3000000-0000-0000-0000-000000000001'
  from public.lineups l where l.id = s.lineup_id and l.team_id = (select v from ctx where k = 'team') and l.period_index = 0 and s.slot_index = 0;
update public.lineup_slots s set player_id = 'e3000000-0000-0000-0000-000000000001'
  from public.lineups l where l.id = s.lineup_id and l.team_id = (select v from ctx where k = 'team') and l.period_index = 1 and s.slot_index = 1;
select public.start_game('a3000000-0000-0000-0000-000000000001');

insert into public.score_events (game_id, side, period_index, event_type, scorer_player_id) values
  ('a3000000-0000-0000-0000-000000000001', 'us', 0, 'run', 'e3000000-0000-0000-0000-000000000001'),
  ('a3000000-0000-0000-0000-000000000001', 'us', 1, 'run', 'e3000000-0000-0000-0000-000000000001'),
  ('a3000000-0000-0000-0000-000000000001', 'us', 1, 'run', null),
  ('a3000000-0000-0000-0000-000000000001', 'them', 0, 'run', null);
insert into public.plate_appearances (game_id, player_id, inning, sequence, result, rbi) values
  ('a3000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 1, 0, 'single', 0),
  ('a3000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 1, 1, 'walk', 0),
  ('a3000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 2, 2, 'home_run', 2),
  ('a3000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 2, 3, 'strikeout', 0),
  ('a3000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000002', 1, 4, 'none', 0);

select is((select us || '-' || them from public.game_scores where game_id = 'a3000000-0000-0000-0000-000000000001'), '3-1', 'runs sum to the score');
select is((select points from public.game_line_score where game_id = 'a3000000-0000-0000-0000-000000000001' and side = 'us' and period_index = 1), 2, 'line score per inning');

-- stats for the live game (season scope counts live + done)
create temp table st as select * from public.player_season_stats((select v from ctx where k = 'team'));
select is((select count(*)::int from st), 3, 'every roster player has a stats row');
select is((select runs from st where player_id = 'e3000000-0000-0000-0000-000000000001'), 2, 'runs credited to the scorer only');
select is((select periods_played from st where player_id = 'e3000000-0000-0000-0000-000000000001'), 2, 'innings in the field counted once per lineup');
select is((select at_bats || '/' || hits || '/' || home_runs || '/' || walks || '/' || strikeouts || '/' || rbi from st where player_id = 'e3000000-0000-0000-0000-000000000001'),
  '3/2/1/1/1/2', 'batting line: walks are not at-bats');
select is((select plate_appearances from st where player_id = 'e3000000-0000-0000-0000-000000000002'), 1, 'a plain batted tap counts as a plate appearance');
select is((select at_bats from st where player_id = 'e3000000-0000-0000-0000-000000000002'), 0, 'no-result plate appearance is not an at-bat');

-- an archived player stays in history, flagged removed
select public.archive_player('e3000000-0000-0000-0000-000000000001');
select is((select removed from public.player_season_stats((select v from ctx where k = 'team')) where player_id = 'e3000000-0000-0000-0000-000000000001'), true, 'removed player is flagged');
select is((select name from public.player_season_stats((select v from ctx where k = 'team')) where player_id = 'e3000000-0000-0000-0000-000000000001'), 'Ava', 'removed player keeps the snapshot name');

-- single game scope
select is((select count(*)::int from public.player_season_stats((select v from ctx where k = 'team'), null, 'a3000000-0000-0000-0000-000000000001')), 3, 'game scope returns rows');
select pg_temp.logout();

-- parent: can read but not write
select pg_temp.login('f1000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.player_season_stats((select v from ctx where k = 'team'))), 0, 'non-member sees no stats');
select throws_ok($$select public.set_batting_order((select v from ctx where k = 'team'), array[]::uuid[])$$, '42501', null, 'non-staff cannot set the batting order');
select pg_temp.logout();

select * from finish();
rollback;
