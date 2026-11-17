-- Practice library (pgTAP, D123): every signed-in user reads the published built-in items and
-- nobody writes them; a team's setup override is read by its members, written by its coach and
-- assistant coach only, checked against the item's adjustable numbers, and never changes the
-- built-in content; "Reset to default" is deleting the row.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

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

select pg_temp.mk_user('d5000000-0000-0000-0000-000000000001', 'coach-pl@test.com');
select pg_temp.mk_user('d5000000-0000-0000-0000-000000000002', 'assistant-pl@test.com');
select pg_temp.mk_user('d5000000-0000-0000-0000-000000000003', 'parent-pl@test.com');
select pg_temp.mk_user('d5000000-0000-0000-0000-000000000004', 'other-coach-pl@test.com');
select pg_temp.mk_user('d5000000-0000-0000-0000-000000000005', 'hoops-coach-pl@test.com');
select pg_temp.mk_user('d5000000-0000-0000-0000-000000000006', 'admin-pl@test.com');
update public.profiles set is_platform_admin = true where id = 'd5000000-0000-0000-0000-000000000006';
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

select pg_temp.login('d5000000-0000-0000-0000-000000000006');
insert into ctx select 'team', public.create_team('Library FC', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
insert into ctx select 'other', public.create_team('Other Library FC', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
insert into ctx select 'hoops', public.create_team('Library Hoops', 'basketball', 3, false, 1, '{}'::jsonb,
  '[{"formation_name":"3","slots":[{"position_role":"G","position_code":"G"},{"position_role":"F","position_code":"F"},{"position_role":"C","position_code":"C"}]}]'::jsonb);
select public.admin_add_member((select v from ctx where k = 'team'), 'coach-pl@test.com', 'coach');
select public.admin_add_member((select v from ctx where k = 'team'), 'assistant-pl@test.com', 'assistant');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-pl@test.com', 'parent');
select public.admin_add_member((select v from ctx where k = 'other'), 'other-coach-pl@test.com', 'coach');
select public.admin_add_member((select v from ctx where k = 'hoops'), 'hoops-coach-pl@test.com', 'coach');
select pg_temp.logout();
insert into ctx select 'item', id from public.library_items where slug = 'first-touch';
-- an unpublished draft nobody should see
insert into public.library_items (id, slug, sport, category, title, is_published)
values ('f5000000-0000-0000-0000-000000000001', 'pl-test-draft', 'soccer', 'tactics', 'Draft', false);

-- ---------- the built-in item ----------
select is((select sport::text || '/' || category from public.library_items where slug = 'first-touch'), 'soccer/fundamentals', 'First Touch is a soccer fundamental');
select is((select jsonb_array_length(content #> '{learn,steps}') from public.library_items where slug = 'first-touch'), 4, 'with four steps');
select ok((select bool_and(s #>> '{image,path}' like 'first-touch/%') from public.library_items i, jsonb_array_elements(i.content #> '{learn,steps}') s where i.slug = 'first-touch'), 'each step names its image by storage path');
select is((select public from storage.buckets where id = 'practice-library'), true, 'the image bucket exists and is public');

-- ---------- a parent reads published items, writes nothing ----------
select pg_temp.login('d5000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.library_items where slug = 'first-touch'), 1, 'a parent reads the item');
select is((select count(*)::int from public.library_items where slug = 'pl-test-draft'), 0, 'an unpublished item is hidden');
select throws_ok($$update public.library_items set title = 'Hacked' where slug = 'first-touch'$$, '42501', null, 'nobody edits built-in content from the app');
select throws_ok($$insert into public.team_library_overrides (team_id, item_id, params) values ((select v from ctx where k = 'team'), (select v from ctx where k = 'item'), '{"cones": 5}')$$, '42501', null, 'a parent cannot adjust the setup');
select pg_temp.logout();

-- ---------- the coach adjusts the setup for the team ----------
select pg_temp.login('d5000000-0000-0000-0000-000000000001');
select lives_ok($$insert into public.team_library_overrides (team_id, item_id, params) values ((select v from ctx where k = 'team'), (select v from ctx where k = 'item'), '{"cones": 5, "spacing": 6, "duration": 10}')$$, 'the coach saves cones, spacing and duration');
select is((select updated_by from public.team_library_overrides where team_id = (select v from ctx where k = 'team')), 'd5000000-0000-0000-0000-000000000001', 'the row is stamped with who set it');
select throws_ok($$update public.team_library_overrides set params = '{"cones": 6}' where team_id = (select v from ctx where k = 'team')$$, '23514', null, 'six cones is out of range');
select throws_ok($$update public.team_library_overrides set params = '{"duration": 12}' where team_id = (select v from ctx where k = 'team')$$, '23514', null, 'duration moves in steps of five');
select throws_ok($$update public.team_library_overrides set params = '{"players": 4}' where team_id = (select v from ctx where k = 'team')$$, '23514', null, 'players is not adjustable');
select throws_ok($$update public.team_library_overrides set params = '{"spacing": "wide"}' where team_id = (select v from ctx where k = 'team')$$, '23514', null, 'a value must be a number');
select throws_ok($$update public.team_library_overrides set params = '{"title": 1}' where team_id = (select v from ctx where k = 'team')$$, '23514', null, 'an unknown key is refused');
select throws_ok($$insert into public.team_library_overrides (team_id, item_id, params) values ((select v from ctx where k = 'other'), (select v from ctx where k = 'item'), '{"cones": 3}')$$, '42501', null, 'the coach cannot write another team''s override');
select pg_temp.logout();

-- ---------- the assistant changes it, the parent reads it ----------
select pg_temp.login('d5000000-0000-0000-0000-000000000002');
select lives_ok($$update public.team_library_overrides set params = '{"cones": 3}' where team_id = (select v from ctx where k = 'team')$$, 'the assistant coach changes it');
select pg_temp.logout();
select pg_temp.login('d5000000-0000-0000-0000-000000000003');
select is((select params from public.team_library_overrides where team_id = (select v from ctx where k = 'team')), '{"cones": 3}'::jsonb, 'the parent reads the team''s setup');
select pg_temp.logout();

-- ---------- other teams ----------
select pg_temp.login('d5000000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.team_library_overrides where team_id = (select v from ctx where k = 'team')), 0, 'another team''s coach does not see it');
select pg_temp.logout();
select pg_temp.login('d5000000-0000-0000-0000-000000000005');
select throws_ok($$insert into public.team_library_overrides (team_id, item_id, params) values ((select v from ctx where k = 'hoops'), (select v from ctx where k = 'item'), '{"cones": 3}')$$, '23514', null, 'a basketball team has no soccer item to adjust');
select pg_temp.logout();

-- ---------- the built-in content never changed; reset is deleting the row ----------
select is((select content #>> '{setup,params,0,default}' from public.library_items where slug = 'first-touch'), '4', 'the built-in default is still four cones');
select pg_temp.login('d5000000-0000-0000-0000-000000000003');
delete from public.team_library_overrides where team_id = (select v from ctx where k = 'team');
select is((select count(*)::int from public.team_library_overrides where team_id = (select v from ctx where k = 'team')), 1, 'a parent cannot reset it');
select pg_temp.logout();
select pg_temp.login('d5000000-0000-0000-0000-000000000001');
select lives_ok($$delete from public.team_library_overrides where team_id = (select v from ctx where k = 'team') and item_id = (select v from ctx where k = 'item')$$, 'the coach resets to default');
select is((select count(*)::int from public.team_library_overrides where team_id = (select v from ctx where k = 'team')), 0, 'and the override is gone');
select pg_temp.logout();

select * from finish();
rollback;
