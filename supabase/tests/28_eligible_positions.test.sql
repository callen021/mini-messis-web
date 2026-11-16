-- Eligible positions (pgTAP, D117): staff read and write a player's position preferences;
-- parents, even the player's own confirmed parent, see nothing and cannot write; another team's
-- coach sees nothing; removing the player removes the rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

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

select pg_temp.mk_user('d4000000-0000-0000-0000-000000000001', 'coach-ep@test.com');
select pg_temp.mk_user('d4000000-0000-0000-0000-000000000002', 'assistant-ep@test.com');
select pg_temp.mk_user('d4000000-0000-0000-0000-000000000003', 'parent-ep@test.com');
select pg_temp.mk_user('d4000000-0000-0000-0000-000000000004', 'other-coach-ep@test.com');
select pg_temp.mk_user('d4000000-0000-0000-0000-000000000006', 'admin-ep@test.com');
update public.profiles set is_platform_admin = true where id = 'd4000000-0000-0000-0000-000000000006';
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

select pg_temp.login('d4000000-0000-0000-0000-000000000006');
insert into ctx select 'team', public.create_team('Eligible FC', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
insert into ctx select 'other', public.create_team('Other FC', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select public.admin_add_member((select v from ctx where k = 'team'), 'coach-ep@test.com', 'coach');
select public.admin_add_member((select v from ctx where k = 'team'), 'assistant-ep@test.com', 'assistant');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-ep@test.com', 'parent');
select public.admin_add_member((select v from ctx where k = 'other'), 'other-coach-ep@test.com', 'coach');
select pg_temp.logout();
insert into public.players (id, team_id, first_name) values
  ('e4000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'team'), 'Ann'),
  ('e4000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'team'), 'Bo');
-- the parent is Ann's confirmed parent: still nothing
insert into public.player_guardians (player_id, user_id, status) values
  ('e4000000-0000-0000-0000-00000000000a', 'd4000000-0000-0000-0000-000000000003', 'approved');

-- ---------- the coach marks Ann never in goal, Bo preferred up front ----------
select pg_temp.login('d4000000-0000-0000-0000-000000000001');
select lives_ok($$insert into public.player_position_prefs (player_id, group_key, level) values ('e4000000-0000-0000-0000-00000000000a', 'GK', 'never')$$, 'the coach marks a group never');
select lives_ok($$insert into public.player_position_prefs (player_id, group_key, level) values ('e4000000-0000-0000-0000-00000000000b', 'ST', 'preferred')$$, 'preferred is stored for later');
select throws_ok($$insert into public.player_position_prefs (player_id, group_key, level) values ('e4000000-0000-0000-0000-00000000000b', 'goalie', 'never')$$, '23514', null, 'a group key is an upper-case engine key');
select is((select count(*)::int from public.player_position_prefs), 2, 'the coach reads both rows');
select is((select updated_by from public.player_position_prefs where player_id = 'e4000000-0000-0000-0000-00000000000a'), 'd4000000-0000-0000-0000-000000000001', 'the row is stamped with who set it');
select pg_temp.logout();

-- ---------- the assistant reads and writes too ----------
select pg_temp.login('d4000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.player_position_prefs), 2, 'the assistant reads them');
select lives_ok($$update public.player_position_prefs set level = 'can' where player_id = 'e4000000-0000-0000-0000-00000000000b' and group_key = 'ST'$$, 'the assistant changes one');
select pg_temp.logout();

-- ---------- a parent, even Ann's own confirmed parent, gets nothing ----------
select pg_temp.login('d4000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.player_position_prefs), 0, 'a parent sees no rows');
select throws_ok($$insert into public.player_position_prefs (player_id, group_key, level) values ('e4000000-0000-0000-0000-00000000000a', 'DEF', 'never')$$, '42501', null, 'a parent cannot write');
select pg_temp.logout();

-- ---------- another team's coach ----------
select pg_temp.login('d4000000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.player_position_prefs), 0, 'another team''s coach sees nothing');
select throws_ok($$insert into public.player_position_prefs (player_id, group_key, level) values ('e4000000-0000-0000-0000-00000000000a', 'DEF', 'never')$$, '42501', null, 'and cannot write');
select pg_temp.logout();

-- ---------- the rows go with the player ----------
delete from public.players where id = 'e4000000-0000-0000-0000-00000000000a';
select is((select count(*)::int from public.player_position_prefs), 1, 'removing the player removes their rows');

select * from finish();
rollback;
