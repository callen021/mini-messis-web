-- Softball (pgTAP, D119): a softball team is created on innings with the baseball skill tests,
-- scores runs, records plate appearances, and its stats read like baseball's.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

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

select pg_temp.mk_user('d6000000-0000-0000-0000-000000000001', 'coach-sb@test.com');
update public.profiles set is_platform_admin = true where id = 'd6000000-0000-0000-0000-000000000001';
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

select pg_temp.login('d6000000-0000-0000-0000-000000000001');
insert into ctx select 'team', public.create_team('Comets', 'softball', 6, false, 2, '{}'::jsonb,
  '[{"formation_name":"Infield only","slots":[{"position_role":"P","position_code":"P"},{"position_role":"C","position_code":"C"},{"position_role":"1B","position_code":"1B"},{"position_role":"2B","position_code":"2B"},{"position_role":"SS","position_code":"SS"},{"position_role":"3B","position_code":"3B"}]},
    {"formation_name":"Infield only","slots":[{"position_role":"P","position_code":"P"},{"position_role":"C","position_code":"C"},{"position_role":"1B","position_code":"1B"},{"position_role":"2B","position_code":"2B"},{"position_role":"SS","position_code":"SS"},{"position_role":"3B","position_code":"3B"}]}]'::jsonb);
select is((select sport::text || '/' || time_mode::text from public.teams where id = (select v from ctx where k = 'team')), 'softball/periods', 'a softball team is created on innings');
select is((select count(*)::int from public.skill_tests where team_id = (select v from ctx where k = 'team')), (select jsonb_array_length(public.default_skill_tests('baseball'))), 'with the baseball skill tests');
select is((select name from public.skill_tests where team_id = (select v from ctx where k = 'team') and key = 'tee'), 'Tee contact', 'tee contact among them');

insert into public.players (id, team_id, first_name) values
  ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'team'), 'Mia'),
  ('e6000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'team'), 'Zoe');
insert into public.games (id, team_id, season_id, opponent) values
  ('a6000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), (select id from public.seasons where team_id = (select v from ctx where k = 'team')), 'Stars');
select public.start_game('a6000000-0000-0000-0000-000000000001');

select lives_ok($$insert into public.score_events (game_id, side, period_index, event_type, scorer_player_id) values ('a6000000-0000-0000-0000-000000000001', 'us', 0, 'run', 'e6000000-0000-0000-0000-00000000000a')$$, 'a run scores');
select is((select points from public.score_events where game_id = 'a6000000-0000-0000-0000-000000000001'), 1::smallint, 'one point');
select throws_ok($$insert into public.score_events (game_id, side, period_index, event_type) values ('a6000000-0000-0000-0000-000000000001', 'us', 0, 'goal')$$, '23514', null, 'a goal is not a softball event');
select lives_ok($$insert into public.plate_appearances (game_id, player_id, inning, sequence, result, rbi) values ('a6000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-00000000000b', 1, 0, 'double', 1)$$, 'a plate appearance is recorded');
select is((select runs || '/' || hits || '/' || doubles from public.player_season_stats((select v from ctx where k = 'team')) where player_id = 'e6000000-0000-0000-0000-00000000000b'), '0/1/1', 'the batting stats read like baseball''s');
select is((select runs from public.player_season_stats((select v from ctx where k = 'team')) where player_id = 'e6000000-0000-0000-0000-00000000000a'), 1, 'and the run is Mia''s');
select pg_temp.logout();

select * from finish();
rollback;
