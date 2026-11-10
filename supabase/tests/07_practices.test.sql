-- Practices (pgTAP): members read, staff write, nobody but an admin deletes; audit columns stamped.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

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

select pg_temp.mk_user('f4000000-0000-0000-0000-000000000001', 'coach-p@test.com');
select pg_temp.mk_user('f4000000-0000-0000-0000-000000000002', 'assistant-p@test.com');
select pg_temp.mk_user('f4000000-0000-0000-0000-000000000003', 'parent-p@test.com');
select pg_temp.mk_user('f4000000-0000-0000-0000-000000000004', 'stranger-p@test.com');
select pg_temp.mk_user('f4000000-0000-0000-0000-000000000005', 'admin-p@test.com');
update public.profiles set is_platform_admin = true where id = 'f4000000-0000-0000-0000-000000000005';
create temp table ctx (k text primary key, v uuid);
create temp table txt (k text primary key, v text);
grant all on ctx to authenticated;
grant all on txt to authenticated;

-- team, roster, members
-- team creation is admin-only (D48)
update public.profiles set is_platform_admin = true where id = 'f4000000-0000-0000-0000-000000000001';
select pg_temp.login('f4000000-0000-0000-0000-000000000001');
insert into ctx select 'team', public.create_team('Strikers', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
insert into txt select 'code', join_code from public.teams where id = (select v from ctx where k = 'team');
insert into ctx select 'season', id from public.seasons where team_id = (select v from ctx where k = 'team') and is_current;
select pg_temp.logout();
update public.profiles set is_platform_admin = false where id = 'f4000000-0000-0000-0000-000000000001';

select pg_temp.login('f4000000-0000-0000-0000-000000000002');
select public.request_join((select v from txt where k = 'code'), 'assistant');
select pg_temp.logout();
select pg_temp.login('f4000000-0000-0000-0000-000000000003');
select public.request_join((select v from txt where k = 'code'), 'parent');
select pg_temp.logout();
select pg_temp.login('f4000000-0000-0000-0000-000000000001');
select public.approve_member((select id from public.team_members where user_id = 'f4000000-0000-0000-0000-000000000002'), 'assistant');
select public.approve_member((select id from public.team_members where user_id = 'f4000000-0000-0000-0000-000000000003'), 'parent');

-- coach schedules one
insert into public.practices (id, team_id, season_id, practice_date, start_time, end_time, location, notes)
values ('b4000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), (select v from ctx where k = 'season'),
  '2026-11-11', '18:30', '19:30', 'Field 2', 'Bring water');
select is((select status::text from public.practices where id = 'b4000000-0000-0000-0000-000000000001'), 'scheduled', 'new practice is scheduled');
select is((select created_by from public.practices where id = 'b4000000-0000-0000-0000-000000000001'), 'f4000000-0000-0000-0000-000000000001', 'created_by stamped from the JWT');
select throws_ok($$insert into public.practices (team_id, season_id, practice_date, start_time, end_time)
  values ((select v from ctx where k = 'team'), (select v from ctx where k = 'season'), '2026-11-12', '18:30', '18:00')$$,
  '23514', null, 'end time must follow start time');
select throws_ok($$insert into public.practices (team_id, season_id, practice_date)
  values ((select v from ctx where k = 'team'), gen_random_uuid(), '2026-11-12')$$,
  '23503', null, 'season must belong to the team');
-- coach cannot hard-delete (no policy: zero rows affected)
delete from public.practices where id = 'b4000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.practices where id = 'b4000000-0000-0000-0000-000000000001'), 1, 'coach delete is a no-op; practices are cancelled, not deleted');
select pg_temp.logout();

-- assistant edits and cancels
select pg_temp.login('f4000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.practices), 1, 'assistant reads the practice');
update public.practices set location = 'Field 3', status = 'cancelled' where id = 'b4000000-0000-0000-0000-000000000001';
select is((select location || '/' || status::text from public.practices where id = 'b4000000-0000-0000-0000-000000000001'), 'Field 3/cancelled', 'assistant edits and cancels');
select is((select updated_by from public.practices where id = 'b4000000-0000-0000-0000-000000000001'), 'f4000000-0000-0000-0000-000000000002', 'updated_by follows the editor');
select is((select created_by from public.practices where id = 'b4000000-0000-0000-0000-000000000001'), 'f4000000-0000-0000-0000-000000000001', 'created_by never changes');
update public.practices set team_id = gen_random_uuid() where id = 'b4000000-0000-0000-0000-000000000001';
select is((select team_id from public.practices where id = 'b4000000-0000-0000-0000-000000000001'), (select v from ctx where k = 'team'), 'team_id cannot be moved');
insert into public.practices (id, team_id, season_id, practice_date, start_time)
values ('b4000000-0000-0000-0000-000000000002', (select v from ctx where k = 'team'), (select v from ctx where k = 'season'), '2026-11-18', '18:30');
select is((select count(*)::int from public.practices), 2, 'assistant schedules a practice');
select pg_temp.logout();

-- parent: read only
select pg_temp.login('f4000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.practices), 2, 'parent reads every practice, cancelled included');
select throws_ok($$insert into public.practices (team_id, season_id, practice_date)
  values ((select v from ctx where k = 'team'), (select v from ctx where k = 'season'), '2026-12-01')$$,
  '42501', null, 'parent cannot schedule');
update public.practices set notes = 'hacked' where id = 'b4000000-0000-0000-0000-000000000002';
select is((select notes from public.practices where id = 'b4000000-0000-0000-0000-000000000002'), null, 'parent update is a no-op');
delete from public.practices where id = 'b4000000-0000-0000-0000-000000000002';
select is((select count(*)::int from public.practices), 2, 'parent delete is a no-op');
select pg_temp.logout();

-- stranger: nothing
select pg_temp.login('f4000000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.practices), 0, 'non-member sees no practices');
select throws_ok($$insert into public.practices (team_id, season_id, practice_date)
  values ((select v from ctx where k = 'team'), (select v from ctx where k = 'season'), '2026-12-01')$$,
  '42501', null, 'non-member cannot schedule');
select pg_temp.logout();

-- platform admin: everything, including the only real delete
select pg_temp.login('f4000000-0000-0000-0000-000000000005');
select is((select count(*)::int from public.practices), 2, 'admin reads practices of a team they are not on');
delete from public.practices where id = 'b4000000-0000-0000-0000-000000000002';
select is((select count(*)::int from public.practices), 1, 'admin can hard-delete');
select pg_temp.logout();

select * from finish();
rollback;
