-- Platform admin (pgTAP): admins reach every team; nobody else gains anything.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

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

select pg_temp.mk_user('f3000000-0000-0000-0000-000000000001', 'coach-a@test.com');
select pg_temp.mk_user('f3000000-0000-0000-0000-000000000002', 'coach-b@test.com');
select pg_temp.mk_user('f3000000-0000-0000-0000-000000000003', 'admin@test.com');
select pg_temp.mk_user('f3000000-0000-0000-0000-000000000004', 'newbie@test.com');
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

-- the flag is set in the SQL editor (no JWT); the app can never set it
update public.profiles set is_platform_admin = true where id = 'f3000000-0000-0000-0000-000000000003';

select pg_temp.login('f3000000-0000-0000-0000-000000000001');
insert into ctx select 'a', public.create_team('Team A', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
insert into public.players (team_id, first_name) values ((select v from ctx where k = 'a'), 'Ava');
select throws_ok($$update public.profiles set is_platform_admin = true where id = 'f3000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'a user cannot make themselves a platform admin');
select is(public.is_platform_admin(), false, 'coach A is not an admin');
select pg_temp.logout();

select pg_temp.login('f3000000-0000-0000-0000-000000000002');
insert into ctx select 'b', public.create_team('Team B', 'baseball', 6, false, 1, '{}'::jsonb,
  '[{"formation_name":"6","slots":[{"position_role":"P","position_code":"P"}]}]'::jsonb);
select is((select count(*)::int from public.teams), 1, 'coach B sees only their own team');
select is((select count(*)::int from public.admin_list_teams()), 0, 'admin_list_teams returns nothing for a coach');
select is((select count(*)::int from public.admin_list_users()), 0, 'admin_list_users returns nothing for a coach');
select throws_ok($$select public.admin_add_member((select v from ctx where k = 'b'), 'newbie@test.com', 'parent')$$, '42501', null, 'coach cannot use admin_add_member');
select throws_ok($$select public.admin_change_sport((select v from ctx where k = 'b'), 'soccer', 7, true, 1, '{}'::jsonb, '[{"formation_name":"3-3","slots":[]}]'::jsonb)$$, '42501', null, 'coach cannot use admin_change_sport');
select throws_ok($$update public.teams set sport = 'soccer' where id = (select v from ctx where k = 'b')$$, '42501', null, 'coach cannot change their own team sport');
select throws_ok($$select public.rotate_join_code((select v from ctx where k = 'a'))$$, '42501', null, 'coach B cannot rotate team A code');
select pg_temp.logout();

-- admin
select pg_temp.login('f3000000-0000-0000-0000-000000000003');
select is(public.is_platform_admin(), true, 'admin flag read');
select is((select count(*)::int from public.teams), 2, 'admin reads every team');
select is((select count(*)::int from public.team_members where team_id = (select v from ctx where k = 'a')), 1, 'admin reads memberships of a team they are not on');
select is((select count(*)::int from public.admin_list_teams()), 2, 'admin_list_teams lists both teams');
select is((select coaches from public.admin_list_teams() where id = (select v from ctx where k = 'a')), 1, 'counts per team');
select ok((select count(*) from public.admin_list_users()) >= 4, 'admin_list_users lists every account');
select lives_ok($$select public.rotate_join_code((select v from ctx where k = 'a'))$$, 'admin rotates any team code');
select lives_ok($$update public.teams set name = 'Team A renamed' where id = (select v from ctx where k = 'a')$$, 'admin renames any team');
select lives_ok($$update public.teams set archived_at = now() where id = (select v from ctx where k = 'b')$$, 'admin archives any team');
insert into ctx select 'm', public.admin_add_member((select v from ctx where k = 'a'), 'newbie@test.com', 'assistant');
select is((select role::text || '/' || status::text from public.team_members where id = (select v from ctx where k = 'm')), 'assistant/active', 'admin adds an active member by email');
select lives_ok($$select public.admin_change_sport((select v from ctx where k = 'a'), 'basketball', 5, false, 4, '{}'::jsonb,
  '[{"formation_name":"1-2-2","slots":[{"position_role":"PG","position_code":"PG"}]},{"formation_name":"1-2-2","slots":[]},{"formation_name":"1-2-2","slots":[]},{"formation_name":"1-2-2","slots":[]}]'::jsonb)$$,
  'admin changes the sport');
select is((select sport::text || '/' || periods_count from public.teams where id = (select v from ctx where k = 'a')), 'basketball/4', 'sport and shape updated');
select is((select count(*)::int from public.lineups where team_id = (select v from ctx where k = 'a') and game_id is null), 4, 'template rebuilt for the new sport');
select is((select count(*)::int from public.skill_tests where team_id = (select v from ctx where k = 'a') and key = 'ft'), 1, 'skill tests replaced by the new sport defaults');
select is((select count(*)::int from public.players where team_id = (select v from ctx where k = 'a')), 1, 'players kept');
select pg_temp.logout();

select * from finish();
rollback;
