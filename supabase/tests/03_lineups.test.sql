-- save_lineups / availability / archive (pgTAP).
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

select pg_temp.mk_user('f0000000-0000-0000-0000-000000000001', 'coach-l@test.com');
select pg_temp.mk_user('f0000000-0000-0000-0000-000000000002', 'parent-l@test.com');
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

-- team creation is admin-only (D48)
update public.profiles set is_platform_admin = true where id = 'f0000000-0000-0000-0000-000000000001';
select pg_temp.login('f0000000-0000-0000-0000-000000000001');
insert into ctx select 'team', public.create_team('Lineup FC', 'soccer', 3, true, 2, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]},
    {"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select pg_temp.logout();
update public.profiles set is_platform_admin = false where id = 'f0000000-0000-0000-0000-000000000001';
select pg_temp.login('f0000000-0000-0000-0000-000000000001');
insert into public.players (id, team_id, first_name) values
  ('e2000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), 'Ava'),
  ('e2000000-0000-0000-0000-000000000002', (select v from ctx where k = 'team'), 'Ben');

-- save a full plan
select lives_ok($$select public.save_lineups((select v from ctx where k = 'team'), null,
  '[{"period_index":0,"formation_name":"2","slots":[{"position_role":"ST","position_code":"LS","player_id":"e2000000-0000-0000-0000-000000000001","auto_picked":false},{"position_role":"ST","position_code":"RS","player_id":"e2000000-0000-0000-0000-000000000002","auto_picked":true},{"position_role":"GK","position_code":"GK","player_id":null,"auto_picked":false}]},
    {"period_index":1,"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST","player_id":null},{"position_role":"DEF","position_code":"SW","player_id":"e2000000-0000-0000-0000-000000000001"},{"position_role":"GK","position_code":"GK","player_id":null}]}]'::jsonb)$$,
  'save_lineups replaces the template');
select is((select formation_name from public.lineups where team_id = (select v from ctx where k = 'team') and game_id is null and period_index = 0), '2', 'formation name updated');
select is((select count(*)::int from public.lineup_slots s join public.lineups l on l.id = s.lineup_id where l.team_id = (select v from ctx where k = 'team')), 6, 'slots rewritten');
select is((select auto_picked from public.lineup_slots s join public.lineups l on l.id = s.lineup_id where l.period_index = 0 and s.slot_index = 1), true, 'auto flag stored');

-- shrink to one period
select lives_ok($$select public.save_lineups((select v from ctx where k = 'team'), null,
  '[{"period_index":0,"formation_name":"2","slots":[{"position_role":"ST","position_code":"LS","player_id":"e2000000-0000-0000-0000-000000000001"},{"position_role":"ST","position_code":"RS","player_id":null},{"position_role":"GK","position_code":"GK","player_id":null}]}]'::jsonb)$$,
  'save_lineups with fewer periods');
select is((select count(*)::int from public.lineups where team_id = (select v from ctx where k = 'team') and game_id is null), 1, 'extra period deleted');

-- a duplicate player in one lineup is rejected
select throws_ok($$select public.save_lineups((select v from ctx where k = 'team'), null,
  '[{"period_index":0,"formation_name":"2","slots":[{"position_role":"ST","position_code":"LS","player_id":"e2000000-0000-0000-0000-000000000001"},{"position_role":"ST","position_code":"RS","player_id":"e2000000-0000-0000-0000-000000000001"},{"position_role":"GK","position_code":"GK","player_id":null}]}]'::jsonb)$$,
  '23505', null, 'a player cannot be in two slots');

-- availability clears the plan
select lives_ok($$select public.set_player_available('e2000000-0000-0000-0000-000000000001', false)$$, 'mark out');
select is((select count(*)::int from public.lineup_slots s join public.lineups l on l.id = s.lineup_id where l.team_id = (select v from ctx where k = 'team') and s.player_id = 'e2000000-0000-0000-0000-000000000001'), 0, 'out player removed from the plan');
select is((select is_available from public.players where id = 'e2000000-0000-0000-0000-000000000001'), false, 'player flagged out');

-- archive keeps the row (for history) but hides it
select lives_ok($$select public.archive_player('e2000000-0000-0000-0000-000000000002')$$, 'archive player');
select isnt((select archived_at from public.players where id = 'e2000000-0000-0000-0000-000000000002'), null, 'archived_at set');
select pg_temp.logout();

-- parent cannot save lineups
select pg_temp.login('f0000000-0000-0000-0000-000000000002');
select throws_ok($$select public.save_lineups((select v from ctx where k = 'team'), null, '[]'::jsonb)$$, '42501', null, 'non-member cannot save lineups');
select pg_temp.logout();

select * from finish();
rollback;
