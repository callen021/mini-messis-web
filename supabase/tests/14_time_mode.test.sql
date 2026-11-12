-- Time mode setting (pgTAP, D65): defaults, staff-only, locked while a game is live.
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

select pg_temp.mk_user('f8000000-0000-0000-0000-000000000001', 'coach-tm@test.com');
select pg_temp.mk_user('f8000000-0000-0000-0000-000000000002', 'parent-tm@test.com');
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

update public.profiles set is_platform_admin = true where id = 'f8000000-0000-0000-0000-000000000001';
select pg_temp.login('f8000000-0000-0000-0000-000000000001');
insert into ctx select 'team', public.create_team('Clock FC', 'soccer', 3, true, 4, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]},{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]},{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]},{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-tm@test.com', 'parent');
select pg_temp.logout();
update public.profiles set is_platform_admin = false where id = 'f8000000-0000-0000-0000-000000000001';

-- ---------- defaults ----------
select is((select time_mode::text from public.teams where id = (select v from ctx where k = 'team')), 'clock', 'a new soccer team starts on the clock (D87)');
select is((select clock_periods from public.teams where id = (select v from ctx where k = 'team')), 2, 'clock mode defaults to two halves');
select is((select period_minutes from public.teams where id = (select v from ctx where k = 'team')), null, 'no period length by default');
update public.teams set time_mode = 'periods' where id = (select v from ctx where k = 'team');  -- the rest walks the switch from periods
select is(public.team_period_count((select v from ctx where k = 'team')), 4, 'period count follows the mode (periods)');

-- ---------- staff set it; parents cannot ----------
select pg_temp.login('f8000000-0000-0000-0000-000000000001');
select lives_ok($$update public.teams set time_mode = 'clock', period_minutes = 25 where id = (select v from ctx where k = 'team')$$, 'the coach switches to the clock');
select is(public.team_period_count((select v from ctx where k = 'team')), 2, 'period count follows the mode (clock)');
select throws_ok($$update public.teams set period_minutes = 0 where id = (select v from ctx where k = 'team')$$, '23514', null, 'period length must be at least a minute');
select is((select periods_count from public.teams where id = (select v from ctx where k = 'team')), 4, 'the period-mode count is untouched by the switch');
select pg_temp.logout();
select pg_temp.login('f8000000-0000-0000-0000-000000000002');
update public.teams set time_mode = 'periods' where id = (select v from ctx where k = 'team');
select pg_temp.logout();
select is((select time_mode::text from public.teams where id = (select v from ctx where k = 'team')), 'clock', 'a parent cannot change the mode (RLS no-op)');

-- ---------- locked while a game is live ----------
select pg_temp.login('f8000000-0000-0000-0000-000000000001');
insert into public.games (id, team_id, season_id, opponent)
values ('a8000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'),
  (select id from public.seasons where team_id = (select v from ctx where k = 'team')), 'Bears');
select public.start_game('a8000000-0000-0000-0000-000000000001');
select throws_ok($$update public.teams set time_mode = 'periods' where id = (select v from ctx where k = 'team')$$, 'P0006', null, 'the mode is locked while a game is live');
select throws_ok($$update public.teams set clock_periods = 4 where id = (select v from ctx where k = 'team')$$, 'P0006', null, 'so is the clock period count');
select lives_ok($$update public.teams set period_minutes = 30 where id = (select v from ctx where k = 'team')$$, 'the period length may still change');
select pg_temp.logout();

select * from finish();
rollback;
