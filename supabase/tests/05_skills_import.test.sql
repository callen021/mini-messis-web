-- Phase 6/7: skills tests (attempts lock, order, restore), stats games_played, legacy import (pgTAP).
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

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

select pg_temp.mk_user('f2000000-0000-0000-0000-000000000001', 'coach-s@test.com');
select pg_temp.mk_user('f2000000-0000-0000-0000-000000000002', 'parent-s@test.com');
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

-- team creation is admin-only (D48)
update public.profiles set is_platform_admin = true where id = 'f2000000-0000-0000-0000-000000000001';
select pg_temp.login('f2000000-0000-0000-0000-000000000001');
insert into ctx select 'team', public.create_team('Skills FC', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb,
  '[{"key":"juggling","name":"Juggling","metric":"count"},{"key":"passing","name":"Passing accuracy","metric":"made_of_attempted","has_sides":true,"attempts":5},{"key":"sprint","name":"Sprint speed","metric":"time_seconds","higher_is_better":false}]'::jsonb);
select pg_temp.logout();
update public.profiles set is_platform_admin = false where id = 'f2000000-0000-0000-0000-000000000001';
select pg_temp.login('f2000000-0000-0000-0000-000000000001');

select is((select count(*)::int from public.skill_tests where team_id = (select v from ctx where k = 'team')), 3, 'create_team seeds the default tests');
select is((select attempts from public.skill_tests where team_id = (select v from ctx where k = 'team') and key = 'passing'), 5, 'attempts stored');

insert into public.players (id, team_id, first_name) values ('e4000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), 'Ava');
insert into ctx select 'juggling', id from public.skill_tests where team_id = (select v from ctx where k = 'team') and key = 'juggling';
insert into ctx select 'sprint', id from public.skill_tests where team_id = (select v from ctx where k = 'team') and key = 'sprint';

-- metric lock after a result
insert into public.skill_results (player_id, skill_test_id, value) values ('e4000000-0000-0000-0000-000000000001', (select v from ctx where k = 'juggling'), 5);
select is((select recorded_by from public.skill_results limit 1), 'f2000000-0000-0000-0000-000000000001'::uuid, 'recorded_by is the author');
select throws_ok($$update public.skill_tests set attempts = 10 where id = (select v from ctx where k = 'juggling')$$, '23514', null, 'attempts lock once results exist');
select lives_ok($$update public.skill_tests set name = 'Juggles', instructions = 'New text' where id = (select v from ctx where k = 'juggling')$$, 'name and instructions stay editable');
select throws_ok($$delete from public.skill_tests where id = (select v from ctx where k = 'juggling')$$, '23514', 'a test with results cannot be deleted; hide it instead', 'delete refused with history');
select lives_ok($$delete from public.skill_tests where id = (select v from ctx where k = 'sprint')$$, 'a test without results can be deleted');

-- order
select lives_ok($$select public.set_skill_test_order((select v from ctx where k = 'team'),
  array[(select id from public.skill_tests where team_id = (select v from ctx where k = 'team') and key = 'passing'), (select v from ctx where k = 'juggling')])$$, 'set order');
select is((select sort_order from public.skill_tests where key = 'passing' and team_id = (select v from ctx where k = 'team')), 1, 'passing is first');

-- hide + restore
update public.skill_tests set is_active = false where id = (select v from ctx where k = 'juggling');
select is(public.restore_skill_tests((select v from ctx where k = 'team'),
  '[{"key":"juggling","name":"Juggling","metric":"count"},{"key":"sprint","name":"Sprint speed","metric":"time_seconds","higher_is_better":false},{"key":"passing","name":"Passing accuracy","metric":"made_of_attempted"}]'::jsonb), 2, 'restore re-adds the deleted test and un-hides the hidden one');
select is((select is_active from public.skill_tests where id = (select v from ctx where k = 'juggling')), true, 'juggling shown again');
select is((select name from public.skill_tests where id = (select v from ctx where k = 'juggling')), 'Juggles', 'restore does not overwrite edits');

-- defaults seeded server-side: empty list on create_team, restore with no payload, sport sets
select pg_temp.logout();
update public.profiles set is_platform_admin = true where id = 'f2000000-0000-0000-0000-000000000001';
select pg_temp.login('f2000000-0000-0000-0000-000000000001');
insert into ctx select 'team2', public.create_team('Backfill FC', 'baseball', 6, false, 1, '{}'::jsonb,
  '[{"formation_name":"6","slots":[{"position_role":"P","position_code":"P"}]}]'::jsonb, '[]'::jsonb);
select pg_temp.logout();
update public.profiles set is_platform_admin = false where id = 'f2000000-0000-0000-0000-000000000001';
select pg_temp.login('f2000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.skill_tests where team_id = (select v from ctx where k = 'team2')), 6, 'create_team with an empty list seeds the sport defaults');
select is((select attempts from public.skill_tests where team_id = (select v from ctx where k = 'team2') and key = 'throwacc'), 10, 'seeded attempts come from the SQL defaults');
delete from public.skill_tests where team_id = (select v from ctx where k = 'team2');
select is(public.restore_skill_tests((select v from ctx where k = 'team2')), 6, 'restore with no payload seeds a team with zero tests');
select is((select jsonb_array_length(public.default_skill_tests('lacrosse'))), 5, 'lacrosse default set has five tests incl. sprint');

-- legacy import (replace) : players, template, one finished game with goals
select lives_ok($$select public.import_legacy_backup((select v from ctx where k = 'team'), '{
  "replace": true,
  "team": {"side_size": 3, "has_gk": true, "periods_count": 1, "colors": {"GK":"#123456"}},
  "players": [{"key":"p0","first_name":"Nolan","jersey_number":"7","is_available":true},{"key":"p1","first_name":"Teddy","jersey_number":"4","is_available":false}],
  "template": [{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST","player_key":"p0"},{"position_role":"DEF","position_code":"SW","player_key":null},{"position_role":"GK","position_code":"GK","player_key":"p1"}]}],
  "games": [{"opponent":"Mini Tylers","game_date":"2026-10-03","status":"done","created_at":"2026-10-03T14:00:00Z","finished_at":"2026-10-03T15:00:00Z","notes":"Great effort",
     "lineups":[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST","player_key":"p0"},{"position_role":"DEF","position_code":"SW","player_key":"p1"},{"position_role":"GK","position_code":"GK","player_key":null}]}],
     "events":[{"side":"us","period_index":0,"event_type":"goal","scorer_key":"p0","assist_key":"p1"},{"side":"them","period_index":0,"event_type":"goal"}],
     "players":[{"key":"p0","name":"Nolan","number":"7"},{"key":"p1","name":"Teddy","number":"4"}]}]
}'::jsonb)$$, 'import runs');
select is((select count(*)::int from public.players where team_id = (select v from ctx where k = 'team')), 2, 'old players replaced by the imported ones');
select is((select count(*)::int from public.games where team_id = (select v from ctx where k = 'team')), 1, 'one game imported');
select is((select us || '-' || them from public.game_scores gs join public.games g on g.id = gs.game_id where g.team_id = (select v from ctx where k = 'team')), '1-1', 'goals became score events');
select is((select colors ->> 'GK' from public.teams where id = (select v from ctx where k = 'team')), '#123456', 'team colors applied');
select is((select games_played from public.player_season_stats((select v from ctx where k = 'team')) where name = 'Nolan'), 1, 'games_played counted');
select is((select goals || '/' || assists from public.player_season_stats((select v from ctx where k = 'team')) where name = 'Teddy'), '0/1', 'assist credited to the mapped player');
select pg_temp.logout();

select pg_temp.login('f2000000-0000-0000-0000-000000000002');
select throws_ok($$select public.import_legacy_backup((select v from ctx where k = 'team'), '{}'::jsonb)$$, '42501', null, 'non-staff cannot import');
select pg_temp.logout();

select * from finish();
rollback;
