-- Function and trigger behaviour (pgTAP).
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

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

select pg_temp.mk_user('d0000000-0000-0000-0000-000000000001', 'owner@test.com');
select pg_temp.mk_user('d0000000-0000-0000-0000-000000000002', 'coach2@test.com');
select pg_temp.mk_user('d0000000-0000-0000-0000-000000000003', 'joiner@test.com');

create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

-- profile auto-created on signup
select is((select count(*)::int from public.profiles where id = 'd0000000-0000-0000-0000-000000000001'), 1, 'profile row is created for a new auth user');

-- team creation is admin-only (D48)
update public.profiles set is_platform_admin = true where id = 'd0000000-0000-0000-0000-000000000001';
select pg_temp.login('d0000000-0000-0000-0000-000000000001');
insert into ctx select 'team', public.create_team('Strikers', 'soccer', 3, true, 2, '{"GK":"#14b8a6"}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]},
    {"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select pg_temp.logout();
update public.profiles set is_platform_admin = false where id = 'd0000000-0000-0000-0000-000000000001';
-- a new soccer team starts on the clock (D87); this suite is about period mode
update public.teams set time_mode = 'periods' where id = (select v from ctx where k = 'team');
select pg_temp.login('d0000000-0000-0000-0000-000000000001');

select matches((select join_code from public.teams where id = (select v from ctx where k = 'team')), '^[A-HJ-KM-NP-TV-Z2-9]{8}$', 'join code is 8 unambiguous base32 chars');
select is((select count(*)::int from public.seasons where team_id = (select v from ctx where k = 'team') and is_current), 1, 'create_team makes one current season');
select is((select count(*)::int from public.lineups where team_id = (select v from ctx where k = 'team') and game_id is null), 2, 'create_team makes one template lineup per period');
select is((select count(*)::int from public.lineup_slots s join public.lineups l on l.id = s.lineup_id where l.team_id = (select v from ctx where k = 'team')), 6, 'template slots are created');
select is((select last_team_id from public.profiles where id = 'd0000000-0000-0000-0000-000000000001'), (select v from ctx where k = 'team'), 'creator profile points at the new team');

-- players + template assignment
insert into public.players (id, team_id, first_name, jersey_number) values
  ('e1000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), 'Ava', '1'),
  ('e1000000-0000-0000-0000-000000000002', (select v from ctx where k = 'team'), 'Ben', '2'),
  ('e1000000-0000-0000-0000-000000000003', (select v from ctx where k = 'team'), 'Cal', '3');
update public.lineup_slots s set player_id = 'e1000000-0000-0000-0000-000000000001'
  from public.lineups l where l.id = s.lineup_id and l.team_id = (select v from ctx where k = 'team') and l.period_index = 0 and s.slot_index = 0;
update public.lineup_slots s set player_id = 'e1000000-0000-0000-0000-000000000003', auto_picked = true
  from public.lineups l where l.id = s.lineup_id and l.team_id = (select v from ctx where k = 'team') and l.period_index = 0 and s.slot_index = 2;

-- a player may appear only once per lineup
select throws_ok(
  $$update public.lineup_slots s set player_id = 'e1000000-0000-0000-0000-000000000001' from public.lineups l where l.id = s.lineup_id and l.period_index = 0 and s.slot_index = 1$$,
  '23505', null, 'a player cannot hold two slots in the same lineup');

-- ---------- games ----------
insert into public.games (id, team_id, season_id, opponent)
values ('a1000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), (select id from public.seasons where team_id = (select v from ctx where k = 'team')), 'Rivals');
insert into public.games (id, team_id, season_id, opponent)
values ('a1000000-0000-0000-0000-000000000002', (select v from ctx where k = 'team'), (select id from public.seasons where team_id = (select v from ctx where k = 'team')), 'Others');

select lives_ok($$select public.start_game('a1000000-0000-0000-0000-000000000001')$$, 'start_game works');
select is((select status::text from public.games where id = 'a1000000-0000-0000-0000-000000000001'), 'live', 'game is live');
select is((select count(*)::int from public.lineups where game_id = 'a1000000-0000-0000-0000-000000000001'), 2, 'start_game copied the template lineups into the game');
select is((select player_id from public.lineup_slots s join public.lineups l on l.id = s.lineup_id where l.game_id = 'a1000000-0000-0000-0000-000000000001' and l.period_index = 0 and s.slot_index = 0),
  'e1000000-0000-0000-0000-000000000001'::uuid, 'copied slot keeps the assigned player');
select is((select count(*)::int from public.game_players where game_id = 'a1000000-0000-0000-0000-000000000001'), 3, 'players snapshotted on start');
select throws_ok($$select public.start_game('a1000000-0000-0000-0000-000000000002')$$, 'P0004', null, 'a second game cannot start while one is live');

-- scoring: points derived, opponent events carry no player, wrong type rejected
insert into public.score_events (game_id, side, period_index, event_type, scorer_player_id)
  values ('a1000000-0000-0000-0000-000000000001', 'us', 0, 'goal', 'e1000000-0000-0000-0000-000000000001');
insert into public.score_events (game_id, side, period_index, event_type, scorer_player_id)
  values ('a1000000-0000-0000-0000-000000000001', 'them', 1, 'goal', 'e1000000-0000-0000-0000-000000000001');
select is((select scorer_player_id from public.score_events where side = 'them'), null, 'opponent events drop the player');
select is((select sum(points)::int from public.score_events where game_id = 'a1000000-0000-0000-0000-000000000001'), 2, 'goal = 1 point each');
select throws_ok(
  $$insert into public.score_events (game_id, side, period_index, event_type) values ('a1000000-0000-0000-0000-000000000001', 'us', 0, 'three_pointer')$$,
  '23514', null, 'basketball event types are rejected on a soccer game');
select is((select us || '-' || them from public.game_scores where game_id = 'a1000000-0000-0000-0000-000000000001'), '1-1', 'game_scores view sums the log');
select throws_ok(
  $$insert into public.plate_appearances (game_id, player_id, inning) values ('a1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 1)$$,
  '23514', null, 'plate appearances are baseball only');

-- change the live game's lineup, then finish: final lineup becomes the template
update public.lineup_slots s set player_id = 'e1000000-0000-0000-0000-000000000002'
  from public.lineups l where l.id = s.lineup_id and l.game_id = 'a1000000-0000-0000-0000-000000000001' and l.period_index = 0 and s.slot_index = 1;
select lives_ok($$select public.finish_game('a1000000-0000-0000-0000-000000000001')$$, 'finish_game works');
select is((select player_id from public.lineup_slots s join public.lineups l on l.id = s.lineup_id where l.team_id = (select v from ctx where k = 'team') and l.game_id is null and l.period_index = 0 and s.slot_index = 1),
  'e1000000-0000-0000-0000-000000000002'::uuid, 'the final game lineup was written back to the template');

-- ---------- keep a coach ----------
select throws_ok(
  $$update public.team_members set role = 'parent' where team_id = (select v from ctx where k = 'team') and user_id = 'd0000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'the last active coach cannot be demoted');

select pg_temp.logout();
select * from finish();
rollback;
