-- At-home Training (pgTAP, D128): a parent records home drills for their own confirmed child only;
-- the date is the server's; coaches and assistant coaches read; other parents see nothing.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

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

-- 1 coach · 2 assistant · 3 parent (confirmed, child A) · 4 other parent (confirmed, child B)
-- 5 parent with an unconfirmed link to child A · 6 another team's coach · 7 platform admin
select pg_temp.mk_user('d6000000-0000-0000-0000-000000000001', 'coach-tr@test.com');
select pg_temp.mk_user('d6000000-0000-0000-0000-000000000002', 'assistant-tr@test.com');
select pg_temp.mk_user('d6000000-0000-0000-0000-000000000003', 'parent-tr@test.com');
select pg_temp.mk_user('d6000000-0000-0000-0000-000000000004', 'parent2-tr@test.com');
select pg_temp.mk_user('d6000000-0000-0000-0000-000000000005', 'pending-tr@test.com');
select pg_temp.mk_user('d6000000-0000-0000-0000-000000000006', 'other-coach-tr@test.com');
select pg_temp.mk_user('d6000000-0000-0000-0000-000000000007', 'admin-tr@test.com');
update public.profiles set is_platform_admin = true where id = 'd6000000-0000-0000-0000-000000000007';
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

select pg_temp.login('d6000000-0000-0000-0000-000000000007');
insert into ctx select 'team', public.create_team('Training FC', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
insert into ctx select 'other', public.create_team('Other Training FC', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select public.admin_add_member((select v from ctx where k = 'team'), 'coach-tr@test.com', 'coach');
select public.admin_add_member((select v from ctx where k = 'team'), 'assistant-tr@test.com', 'assistant');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-tr@test.com', 'parent');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent2-tr@test.com', 'parent');
select public.admin_add_member((select v from ctx where k = 'team'), 'pending-tr@test.com', 'parent');
select public.admin_add_member((select v from ctx where k = 'other'), 'other-coach-tr@test.com', 'coach');
select pg_temp.logout();

insert into public.players (id, team_id, first_name) values
  ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'team'), 'Kid A'),
  ('e6000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'team'), 'Kid B');
insert into public.player_guardians (player_id, user_id, status) values
  ('e6000000-0000-0000-0000-00000000000a', 'd6000000-0000-0000-0000-000000000003', 'approved'),
  ('e6000000-0000-0000-0000-00000000000b', 'd6000000-0000-0000-0000-000000000004', 'approved'),
  ('e6000000-0000-0000-0000-00000000000a', 'd6000000-0000-0000-0000-000000000005', 'pending');
insert into ctx select 'taps', id from public.library_items where slug = 'toe-taps';
insert into ctx select 'rolls', id from public.library_items where slug = 'sole-rolls';
insert into ctx select 'touch', id from public.library_items where slug = 'first-touch';

-- ---------- the parent records for their own child ----------
select pg_temp.login('d6000000-0000-0000-0000-000000000003');
select lives_ok($$insert into public.home_drill_completions (player_id, item_id, level, mode, done_on, recorded_by) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 2, 'solo', '2020-01-01', 'd6000000-0000-0000-0000-000000000001')$$, 'a parent marks a drill Done for their child');
select is((select done_on from public.home_drill_completions where player_id = 'e6000000-0000-0000-0000-00000000000a'), public.team_today((select v from ctx where k = 'team')), 'the date is today where the team plays, whatever the device sent');
select is((select recorded_by from public.home_drill_completions where player_id = 'e6000000-0000-0000-0000-00000000000a'), 'd6000000-0000-0000-0000-000000000003', 'and the author is the caller');
select is((select level::text || '/' || mode from public.home_drill_completions where player_id = 'e6000000-0000-0000-0000-00000000000a'), '2/solo', 'with the level and the mode');
select throws_ok($$insert into public.home_drill_completions (player_id, item_id, level, mode) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 1, 'parent')$$, '23505', null, 'the same drill counts once a day');
select throws_ok($$insert into public.home_drill_completions (player_id, item_id, level, mode) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'rolls'), 4, 'parent')$$, '23514', null, 'there are three levels');
select throws_ok($$insert into public.home_drill_completions (player_id, item_id, level, mode) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'touch'), 1, 'parent')$$, '23514', null, 'only an at-home drill can be marked Done');
select throws_ok($$insert into public.home_drill_completions (player_id, item_id, level, mode) values ('e6000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'taps'), 1, 'parent')$$, '42501', null, 'a parent cannot record for another child');
select throws_ok($$update public.home_drill_completions set level = 3 where player_id = 'e6000000-0000-0000-0000-00000000000a'$$, '42501', null, 'nobody edits a completion');
select pg_temp.logout();

-- ---------- who else may write: nobody ----------
select pg_temp.login('d6000000-0000-0000-0000-000000000005');
select throws_ok($$insert into public.home_drill_completions (player_id, item_id, level, mode) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'rolls'), 1, 'parent')$$, '42501', null, 'an unconfirmed parent cannot record');
select is((select count(*)::int from public.home_drill_completions), 0, 'and sees nothing');
select pg_temp.logout();
select pg_temp.login('d6000000-0000-0000-0000-000000000001');
select throws_ok($$insert into public.home_drill_completions (player_id, item_id, level, mode) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'rolls'), 1, 'parent')$$, '42501', null, 'a coach does not record home drills');
select is((select count(*)::int from public.home_drill_completions where player_id = 'e6000000-0000-0000-0000-00000000000a'), 1, 'the coach reads the child''s completions');
delete from public.home_drill_completions where player_id = 'e6000000-0000-0000-0000-00000000000a';
select pg_temp.logout();
select pg_temp.login('d6000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.home_drill_completions where player_id = 'e6000000-0000-0000-0000-00000000000a'), 1, 'so does the assistant coach, and the coach''s delete removed nothing');
select pg_temp.logout();

-- ---------- other parents and other teams see nothing ----------
select pg_temp.login('d6000000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.home_drill_completions), 0, 'another parent on the team sees nothing');
delete from public.home_drill_completions where player_id = 'e6000000-0000-0000-0000-00000000000a';
select pg_temp.logout();
select pg_temp.login('d6000000-0000-0000-0000-000000000006');
select is((select count(*)::int from public.home_drill_completions), 0, 'another team''s coach sees nothing');
select pg_temp.logout();

-- ---------- undo: the same day, by the parent who recorded it ----------
insert into public.home_drill_completions (player_id, item_id, level, mode) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'rolls'), 1, 'parent');
update public.home_drill_completions set done_on = done_on - 1, recorded_by = 'd6000000-0000-0000-0000-000000000003'
 where item_id = (select v from ctx where k = 'rolls');
select pg_temp.login('d6000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.home_drill_completions where player_id = 'e6000000-0000-0000-0000-00000000000a'), 2, 'the parent sees both days');
delete from public.home_drill_completions where item_id = (select v from ctx where k = 'rolls');
select is((select count(*)::int from public.home_drill_completions where player_id = 'e6000000-0000-0000-0000-00000000000a'), 2, 'yesterday''s Done cannot be taken back');
delete from public.home_drill_completions where item_id = (select v from ctx where k = 'taps');
select is((select count(*)::int from public.home_drill_completions where player_id = 'e6000000-0000-0000-0000-00000000000a'), 1, 'today''s can');
select pg_temp.logout();

-- ---------- a child who left the roster ----------
update public.players set archived_at = now() where id = 'e6000000-0000-0000-0000-00000000000a';
select pg_temp.login('d6000000-0000-0000-0000-000000000003');
select throws_ok($$insert into public.home_drill_completions (player_id, item_id, level, mode) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 1, 'parent')$$, '42501', null, 'nothing is recorded for a player off the roster');
select pg_temp.logout();

select * from finish();
rollback;
