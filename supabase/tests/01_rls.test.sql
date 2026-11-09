-- RLS tests (pgTAP). Run with `supabase test db` against a freshly reset local database.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- ---------- helpers ----------
create or replace function pg_temp.mk_user(p_id uuid, p_email text, p_confirmed boolean default true)
returns void language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email, 'x', case when p_confirmed then now() end, '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
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

-- users
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000001', 'coach-a@test.com');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000002', 'assist-a@test.com');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000003', 'parent-a@test.com');
select pg_temp.mk_user('a0000000-0000-0000-0000-000000000004', 'pending-a@test.com');
select pg_temp.mk_user('b0000000-0000-0000-0000-000000000001', 'coach-b@test.com');
select pg_temp.mk_user('c0000000-0000-0000-0000-000000000001', 'unverified@test.com', false);

-- template with one 3-slot period (enough for the tests)
create temp table ctx (k text primary key, v uuid);

-- ---------- team A, created by coach A ----------
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
insert into ctx select 'team_a', public.create_team('Team A', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select pg_temp.logout();

-- players X and Y on team A (as postgres, bypassing RLS for setup)
insert into public.players (id, team_id, first_name, jersey_number) values
  ('e0000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'team_a'), 'Child X', '1'),
  ('e0000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'team_a'), 'Child Y', '2');
-- a skill test with results for both children
insert into public.skill_tests (id, team_id, key, name, metric) values
  ('f0000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team_a'), 'juggling', 'Juggling', 'count');
insert into public.skill_results (player_id, skill_test_id, value) values
  ('e0000000-0000-0000-0000-00000000000a', 'f0000000-0000-0000-0000-000000000001', 5),
  ('e0000000-0000-0000-0000-00000000000b', 'f0000000-0000-0000-0000-000000000001', 9);

-- ---------- team B, created by coach B ----------
select pg_temp.login('b0000000-0000-0000-0000-000000000001');
insert into ctx select 'team_b', public.create_team('Team B', 'basketball', 3, false, 2, '{}'::jsonb,
  '[{"formation_name":"1-2","slots":[]},{"formation_name":"1-2","slots":[]}]'::jsonb);
select pg_temp.logout();
insert into public.players (id, team_id, first_name) values
  ('e0000000-0000-0000-0000-0000000000b1', (select v from ctx where k = 'team_b'), 'B Kid');

-- ---------- join flow: assistant, parent (child X), and a pending user ----------
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select lives_ok(
  $$select public.request_join((select join_code from public.teams where name = 'Team A'), 'assistant')$$,
  'assistant can request to join team A');
select pg_temp.logout();

select pg_temp.login('a0000000-0000-0000-0000-000000000003');
select lives_ok(
  $$select public.request_join((select join_code from public.teams where name = 'Team A'), 'parent', array['e0000000-0000-0000-0000-00000000000a'::uuid])$$,
  'parent can request to join team A linking child X');
select is((select count(*)::int from public.players), 0, 'pending parent reads no players');
select is((select count(*)::int from public.teams), 0, 'pending parent reads no teams');
select pg_temp.logout();

select pg_temp.login('a0000000-0000-0000-0000-000000000004');
select lives_ok(
  $$select public.request_join((select join_code from public.teams where name = 'Team A'), 'parent', '{}', 'Unlisted Kid')$$,
  'another parent requests with an unlisted child');
select pg_temp.logout();

-- coach A approves assistant and parent
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.team_members where team_id = (select v from ctx where k = 'team_a') and status = 'pending'), 3, 'coach sees three pending requests');
select lives_ok(
  $$select public.approve_member((select id from public.team_members where user_id = 'a0000000-0000-0000-0000-000000000002'), 'assistant')$$,
  'coach approves the assistant');
select lives_ok(
  $$select public.approve_member((select id from public.team_members where user_id = 'a0000000-0000-0000-0000-000000000003'), 'parent', array['e0000000-0000-0000-0000-00000000000a'::uuid])$$,
  'coach approves the parent with child X');
select is((select status::text from public.player_guardians where user_id = 'a0000000-0000-0000-0000-000000000003'), 'approved', 'guardian link approved');
select pg_temp.logout();

-- ---------- parent: read-only, scoped ----------
select pg_temp.login('a0000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.players), 2, 'parent reads the whole roster of team A');
select is((select count(*)::int from public.teams), 1, 'parent reads only team A');
select throws_ok(
  $$insert into public.players (team_id, first_name) values ((select id from public.teams limit 1), 'Hacker')$$,
  '42501', null, 'parent cannot insert players');
select is((select count(*)::int from public.players where first_name = 'Hacker'), 0, 'no player was inserted');
select is((select count(*) from public.players where id = 'e0000000-0000-0000-0000-00000000000a' and (
  select count(*) from public.players p2 where p2.id = 'e0000000-0000-0000-0000-00000000000a' and p2.first_name = 'Child X') = 1)::int, 1, 'sanity');
update public.players set first_name = 'Renamed' where id = 'e0000000-0000-0000-0000-00000000000a';
select is((select first_name from public.players where id = 'e0000000-0000-0000-0000-00000000000a'), 'Child X', 'parent update is a silent no-op under RLS');
select is((select count(*)::int from public.game_coach_notes), 0, 'parent reads no coach notes');
select is((select count(*)::int from public.skill_results), 1, 'parent reads exactly one skill result');
select is((select player_id from public.skill_results), 'e0000000-0000-0000-0000-00000000000a'::uuid, 'and it belongs to their own child');
select throws_ok(
  $$insert into public.skill_results (player_id, skill_test_id, value) values ('e0000000-0000-0000-0000-00000000000a', 'f0000000-0000-0000-0000-000000000001', 7)$$,
  '42501', null, 'parent cannot record skill results');
select throws_ok(
  $$update public.teams set name = 'Pwned' where id = (select v from ctx where k = 'team_a')$$,
  null, null, 'parent cannot rename the team');
select pg_temp.logout();

-- ---------- assistant: writes allowed, coach-only things not ----------
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select lives_ok($$insert into public.players (team_id, first_name) values ((select v from ctx where k = 'team_a'), 'New Kid')$$, 'assistant can add players');
select is((select count(*)::int from public.skill_results), 2, 'assistant reads all skill results');
select throws_ok($$update public.teams set name = 'Assistant Named' where id = (select v from ctx where k = 'team_a')$$, '42501', null, 'assistant cannot rename the team');
select throws_ok(
  $$select public.approve_member((select id from public.team_members where user_id = 'a0000000-0000-0000-0000-000000000004'), 'parent')$$,
  '42501', null, 'assistant cannot approve members');
select is((select count(*)::int from public.team_members), 1, 'assistant sees only their own membership row');
select pg_temp.logout();

-- ---------- cross-team isolation ----------
select pg_temp.login('b0000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.players), 1, 'coach B sees only team B players');
select is((select count(*)::int from public.skill_results), 0, 'coach B sees no team A skill results');
select throws_ok(
  $$select public.rotate_join_code((select v from ctx where k = 'team_a'))$$,
  '42501', null, 'coach B cannot rotate team A join code');
select pg_temp.logout();

-- ---------- owner-only ----------
select pg_temp.login('a0000000-0000-0000-0000-000000000002');
select throws_ok(
  $$select public.transfer_ownership((select v from ctx where k = 'team_a'), 'a0000000-0000-0000-0000-000000000002')$$,
  '42501', null, 'non-owner cannot transfer ownership');
delete from public.teams where id = (select v from ctx where k = 'team_a');
select pg_temp.logout();
select is((select count(*)::int from public.teams where name = 'Team A'), 1, 'non-owner delete is a no-op');

-- ---------- unverified users cannot be approved ----------
select pg_temp.login('c0000000-0000-0000-0000-000000000001');
select lives_ok($$select public.request_join((select join_code from public.teams where name = 'Team A'), 'parent')$$, 'unverified user can request');
select pg_temp.logout();
select pg_temp.login('a0000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.approve_member((select id from public.team_members where user_id = 'c0000000-0000-0000-0000-000000000001'), 'parent')$$,
  'P0003', null, 'coach cannot approve an unverified email');
select pg_temp.logout();

select * from finish();
rollback;
