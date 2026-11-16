-- Duplicate contacts (pgTAP, D116): confirming a parent's link attaches the account to the
-- coach's contact when the phone or the email matches (label and share setting kept, blanks
-- filled), adds a row otherwise; a name-only match stays two rows; merge_contacts folds two rows
-- into one for whoever may edit both.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

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

select pg_temp.mk_user('d3000000-0000-0000-0000-000000000001', 'coach-mg@test.com');
select pg_temp.mk_user('d3000000-0000-0000-0000-000000000003', 'dana.phone@example.test');   -- joins with the phone the coach typed
select pg_temp.mk_user('d3000000-0000-0000-0000-000000000004', 'Eli.Mail@Example.test');    -- joins with the email the coach typed (other case)
select pg_temp.mk_user('d3000000-0000-0000-0000-000000000005', 'fay.name@example.test');    -- same name only
select pg_temp.mk_user('d3000000-0000-0000-0000-000000000006', 'admin-mg@test.com');
update public.profiles set is_platform_admin = true where id = 'd3000000-0000-0000-0000-000000000006';
update public.profiles set display_name = 'Dana Parent' where id = 'd3000000-0000-0000-0000-000000000003';
update public.profiles set display_name = 'Fay Parent' where id = 'd3000000-0000-0000-0000-000000000005';
create temp table ctx (k text primary key, v uuid);
create temp table txt (k text primary key, v text);
grant all on ctx to authenticated;
grant all on txt to authenticated;

select pg_temp.login('d3000000-0000-0000-0000-000000000006');
insert into ctx select 'team', public.create_team('Merge FC', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select public.admin_add_member((select v from ctx where k = 'team'), 'coach-mg@test.com', 'coach');
select pg_temp.logout();
insert into txt select 'code', t.join_code from public.teams t where t.id = (select v from ctx where k = 'team');
insert into public.players (id, team_id, first_name) values
  ('e3000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'team'), 'Ann'),
  ('e3000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'team'), 'Bo'),
  ('e3000000-0000-0000-0000-00000000000c', (select v from ctx where k = 'team'), 'Cy');

-- ---------- the coach types the contacts first ----------
select pg_temp.login('d3000000-0000-0000-0000-000000000001');
insert into public.player_contacts (id, player_id, name, relationship, phone, share_with_team) values
  ('c3000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-00000000000a', 'Dana', 'Mother', '+15550100201', false);
insert into public.player_contacts (id, player_id, name, relationship, email) values
  ('c3000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-00000000000b', 'Eli', 'Father', ' eli.mail@example.test ');
insert into public.player_contacts (id, player_id, name, relationship, phone) values
  ('c3000000-0000-0000-0000-000000000003', 'e3000000-0000-0000-0000-00000000000c', 'Fay Parent', 'Guardian', '+15550100203');
select pg_temp.logout();

-- ---------- the parents join (no approval needed) with their children ----------
select pg_temp.login('d3000000-0000-0000-0000-000000000003');
select public.request_join((select v from txt where k = 'code'), 'parent', array['e3000000-0000-0000-0000-00000000000a'::uuid], null, '(555) 010-0201');
select pg_temp.logout();
select pg_temp.login('d3000000-0000-0000-0000-000000000004');
select public.request_join((select v from txt where k = 'code'), 'parent', array['e3000000-0000-0000-0000-00000000000b'::uuid], null, null);
select pg_temp.logout();
select pg_temp.login('d3000000-0000-0000-0000-000000000005');
select public.request_join((select v from txt where k = 'code'), 'parent', array['e3000000-0000-0000-0000-00000000000c'::uuid], null, '+15550100999');
select pg_temp.logout();
select is((select count(*)::int from public.player_contacts where player_id in ('e3000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000b', 'e3000000-0000-0000-0000-00000000000c')), 3, 'joining adds no contact rows by itself');

-- ---------- the coach confirms the links ----------
select pg_temp.login('d3000000-0000-0000-0000-000000000001');
select public.approve_guardian_link((select id from public.player_guardians where user_id = 'd3000000-0000-0000-0000-000000000003'));
select public.approve_guardian_link((select id from public.player_guardians where user_id = 'd3000000-0000-0000-0000-000000000004'));
select public.approve_guardian_link((select id from public.player_guardians where user_id = 'd3000000-0000-0000-0000-000000000005'));

-- phone match: one row, the account attached, the coach's label and share kept, the email filled in
select is((select count(*)::int from public.player_contacts where player_id = 'e3000000-0000-0000-0000-00000000000a'), 1, 'phone match: Ann still has one contact');
select is((select user_id from public.player_contacts where id = 'c3000000-0000-0000-0000-000000000001'), 'd3000000-0000-0000-0000-000000000003', 'the account is attached to the coach''s row');
select is((select name || '/' || relationship || '/' || share_with_team::text from public.player_contacts where id = 'c3000000-0000-0000-0000-000000000001'), 'Dana/Mother/false', 'name, label and share setting are the coach''s');
select is((select email from public.player_contacts where id = 'c3000000-0000-0000-0000-000000000001'), 'dana.phone@example.test', 'the blank email is filled from the account');
select is((select phone from public.player_contacts where id = 'c3000000-0000-0000-0000-000000000001'), '+15550100201', 'the phone as the coach typed it stays');

-- email match, case and spaces ignored
select is((select count(*)::int from public.player_contacts where player_id = 'e3000000-0000-0000-0000-00000000000b'), 1, 'email match: Bo still has one contact');
select is((select user_id || '/' || relationship from public.player_contacts where id = 'c3000000-0000-0000-0000-000000000002'), 'd3000000-0000-0000-0000-000000000004/Father', 'attached, label kept');

-- name only: no merge, two rows, and the app prompts the coach
select is((select count(*)::int from public.player_contacts where player_id = 'e3000000-0000-0000-0000-00000000000c'), 2, 'a name-only match is not merged: Cy has two rows');
select is((select count(*)::int from public.player_contacts where player_id = 'e3000000-0000-0000-0000-00000000000c' and user_id = 'd3000000-0000-0000-0000-000000000005'), 1, 'the account got its own row');

-- confirming again changes nothing
select public.set_member_children((select id from public.team_members where user_id = 'd3000000-0000-0000-0000-000000000003'), array['e3000000-0000-0000-0000-00000000000a'::uuid]);
select is((select count(*)::int from public.player_contacts where player_id = 'e3000000-0000-0000-0000-00000000000a'), 1, 'confirming again adds nothing');

-- ---------- merge_contacts: the coach folds Cy's two rows into the typed one ----------
insert into ctx select 'fay-account', c.id from public.player_contacts c where c.player_id = 'e3000000-0000-0000-0000-00000000000c' and c.user_id is not null;
select lives_ok($$select public.merge_contacts('c3000000-0000-0000-0000-000000000003', (select v from ctx where k = 'fay-account'))$$, 'the coach merges the account row into the typed row');
select is((select count(*)::int from public.player_contacts where player_id = 'e3000000-0000-0000-0000-00000000000c'), 1, 'one row left');
select is((select user_id || '/' || relationship || '/' || phone || '/' || email from public.player_contacts where id = 'c3000000-0000-0000-0000-000000000003'), 'd3000000-0000-0000-0000-000000000005/Guardian/+15550100203/fay.name@example.test', 'the kept row has the account, its own label and phone, and the email from the dropped row');
select throws_ok($$select public.merge_contacts('c3000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000003')$$, '22023', null, 'a contact cannot merge with itself');
select throws_ok($$select public.merge_contacts('c3000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000001')$$, 'P0002', null, 'contacts of two players cannot merge');
select pg_temp.logout();

-- ---------- two different accounts never merge; a parent may merge only on their own child ----------
select pg_temp.login('d3000000-0000-0000-0000-000000000001');
insert into public.player_contacts (id, player_id, name, relationship, phone) values
  ('c3000000-0000-0000-0000-000000000004', 'e3000000-0000-0000-0000-00000000000a', 'Dana again', 'Mother', '+15550100201');
select throws_ok($$select public.merge_contacts('c3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000002')$$, 'P0002', null, 'still two players');
select pg_temp.logout();
select pg_temp.login('d3000000-0000-0000-0000-000000000004');
select throws_ok($$select public.merge_contacts('c3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000004')$$, '42501', null, 'Bo''s parent cannot merge Ann''s contacts');
select pg_temp.logout();
select pg_temp.login('d3000000-0000-0000-0000-000000000003');
select lives_ok($$select public.merge_contacts('c3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000004')$$, 'Ann''s confirmed parent merges a duplicate on their own child');
select is((select count(*)::int from public.player_contacts where player_id = 'e3000000-0000-0000-0000-00000000000a'), 1, 'one row for Ann');
select pg_temp.logout();
select pg_temp.login('d3000000-0000-0000-0000-000000000001');
insert into public.player_contacts (id, player_id, name, user_id) values
  ('c3000000-0000-0000-0000-000000000005', 'e3000000-0000-0000-0000-00000000000a', 'Other Account', 'd3000000-0000-0000-0000-000000000004');
select throws_ok($$select public.merge_contacts('c3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000005')$$, 'P0020', null, 'two different accounts never merge');
select pg_temp.logout();

-- ---------- the helpers ----------
select is(public.phone_digits('+1 (555) 010-0201'), '5550100201', 'phone_digits keeps digits only, without the +1');
select is(public.email_key('  Eli.Mail@Example.test '), 'eli.mail@example.test', 'email_key lowercases and trims');

select * from finish();
rollback;
