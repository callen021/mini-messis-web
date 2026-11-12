-- Team creation is platform-admin only (pgTAP, D48): create_team() and a direct insert both refuse
-- an ordinary user; an admin creates the team and becomes its owner and coach.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

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

select pg_temp.mk_user('f5000000-0000-0000-0000-000000000001', 'wannabe-coach@test.com');
select pg_temp.mk_user('f5000000-0000-0000-0000-000000000002', 'admin-t@test.com');
update public.profiles set is_platform_admin = true where id = 'f5000000-0000-0000-0000-000000000002';
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

-- an ordinary signed-in user
select pg_temp.login('f5000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.create_team('My Team', 'soccer', 3, true, 1, '{}'::jsonb,
      '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"}]}]'::jsonb)$$,
  '42501', 'only a platform admin can create a team', 'a non-admin cannot call create_team');
select throws_ok(
  $$insert into public.teams (name, sport, owner_id, join_code, side_size, periods_count)
    values ('Direct', 'soccer', 'f5000000-0000-0000-0000-000000000001', 'ABCDEFGH', 3, 1)$$,
  '42501', null, 'a non-admin cannot insert into teams directly');
select is((select count(*)::int from public.teams where name in ('My Team', 'Direct')), 0, 'nothing was created');
select pg_temp.logout();

-- signed out: no JWT at all
select throws_ok(
  $$select public.create_team('Nobody FC', 'soccer', 3, true, 1, '{}'::jsonb, '[{"formation_name":"1-1","slots":[]}]'::jsonb)$$,
  '42501', null, 'a signed-out caller cannot create a team');

-- the platform admin
select pg_temp.login('f5000000-0000-0000-0000-000000000002');
select lives_ok(
  $$insert into ctx select 'team', public.create_team('Admin FC', 'soccer', 3, true, 1, '{}'::jsonb,
      '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb)$$,
  'an admin creates a team');
select is((select owner_id from public.teams where id = (select v from ctx where k = 'team')), 'f5000000-0000-0000-0000-000000000002', 'the admin owns the new team');
select is((select role::text || '/' || status::text from public.team_members where team_id = (select v from ctx where k = 'team')), 'coach/active', 'the admin is its active coach');
select is((select count(*)::int from public.seasons where team_id = (select v from ctx where k = 'team') and is_current), 1, 'one current season');
-- defaults for new teams (D87): the clock wherever it applies, periods for baseball; approval off
select is((select time_mode::text from public.teams where id = (select v from ctx where k = 'team')), 'clock', 'a new soccer team tracks playing time by the clock');
select is((select require_approval from public.teams where id = (select v from ctx where k = 'team')), false, 'and does not ask for approval before parents join (D91)');
insert into ctx select 'bb', public.create_team('Sluggers', 'baseball', 6, false, 1, '{}'::jsonb, '[{"formation_name":"6","slots":[{"position_role":"P","position_code":"P"}]}]'::jsonb);
select is((select time_mode::text from public.teams where id = (select v from ctx where k = 'bb')), 'periods', 'a new baseball team stays on periods (the clock does not apply)');
select throws_ok($$select public.create_team('Gridiron', 'football', 11, false, 4, '{}'::jsonb, '[]'::jsonb)$$, '22023', null, 'football teams cannot be created even by an admin (disabled sport)');
select lives_ok(
  $$select public.admin_add_member((select v from ctx where k = 'team'), 'wannabe-coach@test.com', 'coach')$$,
  'the admin hands the team to a coach by email');
select pg_temp.logout();

select * from finish();
rollback;
