-- Contact sharing and the directory (pgTAP, D57). Invented names and numbers only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

create or replace function pg_temp.mk_user(p_id uuid, p_email text, p_name text default null)
returns void language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email, 'x', now(), '{"provider":"email","providers":["email"]}',
          case when p_name is null then '{}'::jsonb else jsonb_build_object('display_name', p_name) end, now(), now(), '', '', '', '');
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

select pg_temp.mk_user('f9000000-0000-0000-0000-000000000001', 'coach-c@test.com', 'Coach Casey');
select pg_temp.mk_user('f9000000-0000-0000-0000-000000000002', 'parent-cx@test.com', 'Pat Example');   -- guardian of X
select pg_temp.mk_user('f9000000-0000-0000-0000-000000000003', 'parent-cy@test.com', 'Quinn Sample');  -- guardian of Y
select pg_temp.mk_user('f9000000-0000-0000-0000-000000000004', 'admin-c@test.com');
update public.profiles set is_platform_admin = true where id = 'f9000000-0000-0000-0000-000000000004';
create temp table ctx (k text primary key, v uuid);
create temp table txt (k text primary key, v text);
grant all on ctx, txt to authenticated;

select pg_temp.login('f9000000-0000-0000-0000-000000000004');
insert into ctx select 'team', public.create_team('Directory FC', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select public.admin_add_member((select v from ctx where k = 'team'), 'coach-c@test.com', 'coach');
select pg_temp.logout();
insert into txt select 'code', join_code from public.teams where id = (select v from ctx where k = 'team');
insert into public.players (id, team_id, first_name, jersey_number) values
  ('e9000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'team'), 'Child X', '1'),
  ('e9000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'team'), 'Child Y', '2');

-- ---------- parent X joins with a phone; approval creates a contact ----------
select pg_temp.login('f9000000-0000-0000-0000-000000000002');
select lives_ok($$select public.request_join((select v from txt where k = 'code'), 'parent', array['e9000000-0000-0000-0000-00000000000a'::uuid], null, '+15550100001')$$, 'parent X requests with a phone');
select pg_temp.logout();
select pg_temp.login('f9000000-0000-0000-0000-000000000003');
select public.request_join((select v from txt where k = 'code'), 'parent', array['e9000000-0000-0000-0000-00000000000b'::uuid]);
select pg_temp.logout();
select pg_temp.login('f9000000-0000-0000-0000-000000000001');
select public.approve_member((select id from public.team_members where user_id = 'f9000000-0000-0000-0000-000000000002'), 'parent', array['e9000000-0000-0000-0000-00000000000a'::uuid]);
select public.approve_member((select id from public.team_members where user_id = 'f9000000-0000-0000-0000-000000000003'), 'parent', array['e9000000-0000-0000-0000-00000000000b'::uuid]);
select is((select name || '/' || relationship || '/' || phone || '/' || email || '/' || share_with_team::text from public.player_contacts where player_id = 'e9000000-0000-0000-0000-00000000000a'),
  'Pat Example/Parent/+15550100001/parent-cx@test.com/true', 'approval created a shared contact on X with the invite phone');
select is((select count(*)::int from public.player_contacts where player_id = 'e9000000-0000-0000-0000-00000000000b'), 1, 'and one on Y (no phone given)');
select is((select phone from public.player_contacts where player_id = 'e9000000-0000-0000-0000-00000000000b'), null, 'with no phone');
-- staff add a second, private contact on X and details on both
insert into public.player_contacts (player_id, name, relationship, phone, share_with_team) values
  ('e9000000-0000-0000-0000-00000000000a', 'Grandparent Example', 'Grandparent', '+15550100002', false);
insert into public.player_details (player_id, birthdate, shirt_size) values
  ('e9000000-0000-0000-0000-00000000000a', '2018-03-03', 'YM'),
  ('e9000000-0000-0000-0000-00000000000b', '2018-04-04', 'YL');
select is((select count(*)::int from public.team_sheet((select v from ctx where k = 'team'))), 2, 'team sheet has a row per player for staff');
select is((select jsonb_array_length(contacts) from public.team_sheet((select v from ctx where k = 'team')) where player_id = 'e9000000-0000-0000-0000-00000000000a'), 2, 'with every contact, shared or not');
select is((select array_to_string(parent_names, ',') from public.roster_directory((select v from ctx where k = 'team')) where player_id = 'e9000000-0000-0000-0000-00000000000a'), 'Grandparent,Pat', 'staff see every first name on the roster');
select pg_temp.logout();

-- ---------- parent Y looks at X: shared contact only, never details ----------
select pg_temp.login('f9000000-0000-0000-0000-000000000003');
select is((select string_agg(name, ',' order by name) from public.player_contacts where player_id = 'e9000000-0000-0000-0000-00000000000a'), 'Pat Example', 'another parent reads only the shared contact');
select is((select phone from public.player_contacts where player_id = 'e9000000-0000-0000-0000-00000000000a'), '+15550100001', 'including its phone');
select is((select count(*)::int from public.player_details where player_id = 'e9000000-0000-0000-0000-00000000000a'), 0, 'but none of X''s details');
select is((select count(*)::int from public.player_people('e9000000-0000-0000-0000-00000000000a')), 1, 'player_people lists the one shared person');
select is((select can_edit from public.player_people('e9000000-0000-0000-0000-00000000000a')), false, 'read-only for them');
select is((select array_to_string(parent_names, ',') from public.roster_directory((select v from ctx where k = 'team')) where player_id = 'e9000000-0000-0000-0000-00000000000a'), 'Pat', 'roster shows only the shared first name');
update public.player_contacts set share_with_team = false where player_id = 'e9000000-0000-0000-0000-00000000000a';
update public.player_contacts set phone = '+15550109999' where player_id = 'e9000000-0000-0000-0000-00000000000a';
select throws_ok($$insert into public.player_contacts (player_id, name) values ('e9000000-0000-0000-0000-00000000000a', 'Intruder')$$, '42501', null, 'another parent cannot add a contact');
select is((select count(*)::int from public.team_sheet((select v from ctx where k = 'team'))), 0, 'team sheet is empty for a parent');
select pg_temp.logout();
select is((select share_with_team::text || '/' || phone from public.player_contacts where player_id = 'e9000000-0000-0000-0000-00000000000a' and name = 'Pat Example'), 'true/+15550100001', 'another parent''s edits were no-ops');

-- ---------- parent X manages their own child's contacts, turns sharing off ----------
select pg_temp.login('f9000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.player_contacts where player_id = 'e9000000-0000-0000-0000-00000000000a'), 2, 'X''s guardian reads both contacts on X');
select is((select count(*)::int from public.player_contacts where player_id = 'e9000000-0000-0000-0000-00000000000b'), 1, 'and Y''s shared one');
select is((select count(*)::int from public.player_details where player_id = 'e9000000-0000-0000-0000-00000000000b'), 0, 'but not Y''s details');
select lives_ok($$update public.player_contacts set share_with_team = false where player_id = 'e9000000-0000-0000-0000-00000000000a' and name = 'Pat Example'$$, 'guardian turns sharing off');
select is((select in_app from public.player_people('e9000000-0000-0000-0000-00000000000a') where name = 'Pat Example'), true, 'their own entry is marked in-app');
select pg_temp.logout();
select pg_temp.login('f9000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.player_contacts where player_id = 'e9000000-0000-0000-0000-00000000000a'), 0, 'now parent Y sees nobody on X');
select is((select count(*)::int from public.roster_directory((select v from ctx where k = 'team')) where player_id = 'e9000000-0000-0000-0000-00000000000a'), 0, 'and no first name on the roster');
select pg_temp.logout();

-- ---------- staff still see everything; a pending link shows for staff only ----------
insert into public.player_guardians (player_id, user_id, status) values ('e9000000-0000-0000-0000-00000000000b', 'f9000000-0000-0000-0000-000000000002', 'pending');
select pg_temp.login('f9000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.player_contacts where player_id = 'e9000000-0000-0000-0000-00000000000a'), 2, 'coach reads both contacts regardless of sharing');
select is((select string_agg(coalesce(link_status, '-'), ',' order by name) from public.player_people('e9000000-0000-0000-0000-00000000000b')), 'pending,approved', 'coach sees the pending link next to the approved one on Y');
select pg_temp.logout();
select pg_temp.login('f9000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.player_people('e9000000-0000-0000-0000-00000000000b') where link_status = 'pending'), 0, 'Y''s own guardian does not see the pending stranger');
select pg_temp.logout();

select * from finish();
rollback;
