-- Player details and contacts (pgTAP, D52): only staff, admins and a player's APPROVED guardians
-- read or write them; another parent on the same team reads nothing and cannot insert.
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

select pg_temp.mk_user('f7000000-0000-0000-0000-000000000001', 'coach-d@test.com');
select pg_temp.mk_user('f7000000-0000-0000-0000-000000000002', 'assistant-d@test.com');
select pg_temp.mk_user('f7000000-0000-0000-0000-000000000003', 'parent-x@test.com');   -- approved guardian of X
select pg_temp.mk_user('f7000000-0000-0000-0000-000000000004', 'parent-y@test.com');   -- approved guardian of Y
select pg_temp.mk_user('f7000000-0000-0000-0000-000000000005', 'pending-x@test.com');  -- pending guardian of X
select pg_temp.mk_user('f7000000-0000-0000-0000-000000000006', 'admin-d@test.com');
select pg_temp.mk_user('f7000000-0000-0000-0000-000000000007', 'stranger-d@test.com');
update public.profiles set is_platform_admin = true where id = 'f7000000-0000-0000-0000-000000000006';
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

-- team (admin creates, D48) with coach + assistant, players X and Y
select pg_temp.login('f7000000-0000-0000-0000-000000000006');
insert into ctx select 'team', public.create_team('Details FC', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select public.admin_add_member((select v from ctx where k = 'team'), 'coach-d@test.com', 'coach');
select public.admin_add_member((select v from ctx where k = 'team'), 'assistant-d@test.com', 'assistant');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-x@test.com', 'parent');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-y@test.com', 'parent');
select public.admin_add_member((select v from ctx where k = 'team'), 'pending-x@test.com', 'parent');
select pg_temp.logout();
insert into public.players (id, team_id, first_name) values
  ('e7000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'team'), 'Child X'),
  ('e7000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'team'), 'Child Y');
insert into public.player_guardians (player_id, user_id, status) values
  ('e7000000-0000-0000-0000-00000000000a', 'f7000000-0000-0000-0000-000000000003', 'approved'),
  ('e7000000-0000-0000-0000-00000000000b', 'f7000000-0000-0000-0000-000000000004', 'approved'),
  ('e7000000-0000-0000-0000-00000000000a', 'f7000000-0000-0000-0000-000000000005', 'pending');

-- ---------- coach writes both ----------
select pg_temp.login('f7000000-0000-0000-0000-000000000001');
select lives_ok($$insert into public.player_details (player_id, birthdate, shirt_size) values ('e7000000-0000-0000-0000-00000000000a', '2018-05-04', 'YM')$$, 'coach records details for X');
select lives_ok($$insert into public.player_details (player_id, birthdate, shirt_size) values ('e7000000-0000-0000-0000-00000000000b', '2017-09-20', 'YL')$$, 'coach records details for Y');
select lives_ok($$insert into public.player_contacts (player_id, name, relationship, phone) values ('e7000000-0000-0000-0000-00000000000b', 'Yolanda', 'mother', '555-0100')$$, 'coach adds a contact for Y');
select is((select updated_by from public.player_details where player_id = 'e7000000-0000-0000-0000-00000000000a'), 'f7000000-0000-0000-0000-000000000001', 'updated_by stamped');
select throws_ok($$insert into public.player_details (player_id, birthdate) values ('e7000000-0000-0000-0000-00000000000b', '1980-01-01')$$, '23514', null, 'birthdate must be plausible');
select pg_temp.logout();

-- ---------- X's approved guardian: own child only ----------
select pg_temp.login('f7000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.player_details), 1, 'guardian of X reads exactly one details row');
select is((select player_id from public.player_details), 'e7000000-0000-0000-0000-00000000000a', 'and it is X');
select is((select count(*)::int from public.player_contacts), 0, 'guardian of X reads none of Y''s contacts');
select lives_ok($$update public.player_details set shirt_size = 'YL' where player_id = 'e7000000-0000-0000-0000-00000000000a'$$, 'guardian edits X''s details');
select is((select shirt_size::text from public.player_details where player_id = 'e7000000-0000-0000-0000-00000000000a'), 'YL', 'the edit stuck');
select lives_ok($$insert into public.player_contacts (player_id, name, relationship, email, user_id) values ('e7000000-0000-0000-0000-00000000000a', 'Xavier', 'father', 'parent-x@test.com', 'f7000000-0000-0000-0000-000000000003')$$, 'guardian adds themselves as a contact for X');
select throws_ok($$insert into public.player_contacts (player_id, name) values ('e7000000-0000-0000-0000-00000000000b', 'Sneaky')$$, '42501', null, 'guardian of X cannot add a contact for Y');
update public.player_details set shirt_size = 'AXL' where player_id = 'e7000000-0000-0000-0000-00000000000b';
select pg_temp.logout();
select is((select shirt_size::text from public.player_details where player_id = 'e7000000-0000-0000-0000-00000000000b'), 'YL', 'guardian of X cannot change Y''s details (silent no-op)');

-- ---------- Y's guardian sees only Y; pending guardian and stranger see nothing ----------
select pg_temp.login('f7000000-0000-0000-0000-000000000004');
select is((select string_agg(player_id::text, ',') from public.player_details), 'e7000000-0000-0000-0000-00000000000b', 'guardian of Y reads only Y');
select is((select count(*)::int from public.player_contacts), 1, 'and only Y''s contact');
select is((select name from public.player_contacts), 'Yolanda', 'which is Yolanda');
select pg_temp.logout();
select pg_temp.login('f7000000-0000-0000-0000-000000000005');
select is((select count(*)::int from public.player_details), 0, 'a pending guardian reads nothing');
select throws_ok($$insert into public.player_contacts (player_id, name) values ('e7000000-0000-0000-0000-00000000000a', 'Early')$$, '42501', null, 'and cannot write');
select pg_temp.logout();
select pg_temp.login('f7000000-0000-0000-0000-000000000007');
select is((select count(*)::int from public.player_details) + (select count(*)::int from public.player_contacts), 0, 'a non-member reads nothing');
select pg_temp.logout();

-- ---------- assistant and admin read everything on the team ----------
select pg_temp.login('f7000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.player_details), 2, 'assistant reads both players'' details');
select lives_ok($$delete from public.player_contacts where name = 'Yolanda'$$, 'assistant removes a contact');
select pg_temp.logout();
select pg_temp.login('f7000000-0000-0000-0000-000000000006');
select is((select count(*)::int from public.player_contacts), 1, 'admin reads the remaining contact');
select pg_temp.logout();

select * from finish();
rollback;
