-- Allergies (pgTAP, D114): staff and a player's APPROVED guardians read and write them; a pending
-- guardian, another family and a stranger get nothing; the team summary names allergens only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

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

select pg_temp.mk_user('a1000000-0000-0000-0000-000000000001', 'coach-al@test.com');
select pg_temp.mk_user('a1000000-0000-0000-0000-000000000002', 'assistant-al@test.com');
select pg_temp.mk_user('a1000000-0000-0000-0000-000000000003', 'parent-ax@test.com');   -- approved guardian of X
select pg_temp.mk_user('a1000000-0000-0000-0000-000000000004', 'parent-ay@test.com');   -- approved guardian of Y
select pg_temp.mk_user('a1000000-0000-0000-0000-000000000005', 'pending-ax@test.com');  -- pending guardian of X
select pg_temp.mk_user('a1000000-0000-0000-0000-000000000006', 'admin-al@test.com');
select pg_temp.mk_user('a1000000-0000-0000-0000-000000000007', 'stranger-al@test.com');
update public.profiles set is_platform_admin = true where id = 'a1000000-0000-0000-0000-000000000006';
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

select pg_temp.login('a1000000-0000-0000-0000-000000000006');
insert into ctx select 'team', public.create_team('Allergy FC', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select public.admin_add_member((select v from ctx where k = 'team'), 'coach-al@test.com', 'coach');
select public.admin_add_member((select v from ctx where k = 'team'), 'assistant-al@test.com', 'assistant');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-ax@test.com', 'parent');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-ay@test.com', 'parent');
select public.admin_add_member((select v from ctx where k = 'team'), 'pending-ax@test.com', 'parent');
select pg_temp.logout();
insert into public.players (id, team_id, first_name) values
  ('b1000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'team'), 'Child X'),
  ('b1000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'team'), 'Child Y'),
  ('b1000000-0000-0000-0000-00000000000c', (select v from ctx where k = 'team'), 'Child Z');
insert into public.player_guardians (player_id, user_id, status) values
  ('b1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-000000000003', 'approved'),
  ('b1000000-0000-0000-0000-00000000000b', 'a1000000-0000-0000-0000-000000000004', 'approved'),
  ('b1000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-000000000005', 'pending');

-- ---------- the coach answers for X; the checks hold ----------
select pg_temp.login('a1000000-0000-0000-0000-000000000001');
select lives_ok($$insert into public.player_allergies (player_id, status, allergens, other, notes) values ('b1000000-0000-0000-0000-00000000000a', 'has', '{peanuts,other}', 'Kiwi', 'EpiPen in the bag')$$, 'coach records X''s allergies');
select throws_ok($$insert into public.player_allergies (player_id, status, allergens) values ('b1000000-0000-0000-0000-00000000000c', 'has', '{bananas}')$$, '23514', null, 'only the known allergens plus other');
select throws_ok($$insert into public.player_allergies (player_id, status, allergens) values ('b1000000-0000-0000-0000-00000000000c', 'none', '{dairy}')$$, '23514', null, 'none means no allergens');
select throws_ok($$insert into public.player_allergies (player_id, status, allergens) values ('b1000000-0000-0000-0000-00000000000c', 'has', '{other}')$$, '23514', null, 'other needs a name');
select is((select updated_by from public.player_allergies where player_id = 'b1000000-0000-0000-0000-00000000000a'), 'a1000000-0000-0000-0000-000000000001', 'updated_by stamped');
-- the summary before every family answered
select is((select unanswered from public.team_allergy_summary((select v from ctx where k = 'team'))), true, 'summary: not every family has answered');
select pg_temp.logout();

-- ---------- the assistant can edit too ----------
select pg_temp.login('a1000000-0000-0000-0000-000000000002');
select lives_ok($$update public.player_allergies set notes = 'EpiPen with the coach' where player_id = 'b1000000-0000-0000-0000-00000000000a'$$, 'assistant edits X''s notes');
select pg_temp.logout();

-- ---------- Y's approved guardian: own child only ----------
select pg_temp.login('a1000000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.player_allergies), 0, 'guardian of Y reads nothing about X');
select lives_ok($$insert into public.player_allergies (player_id, status) values ('b1000000-0000-0000-0000-00000000000b', 'none')$$, 'guardian of Y answers none');
select throws_ok($$insert into public.player_allergies (player_id, status, allergens) values ('b1000000-0000-0000-0000-00000000000c', 'has', '{dairy}')$$, '42501', null, 'guardian of Y cannot answer for Z');
update public.player_allergies set notes = 'peek' where player_id = 'b1000000-0000-0000-0000-00000000000a';
select is((select string_agg(player_id::text, ',') from public.player_allergies), 'b1000000-0000-0000-0000-00000000000b', 'guardian of Y reads only Y');
-- the summary is open to every active member, without names or notes
select is((select allergens from public.team_allergy_summary((select v from ctx where k = 'team'))), '{peanuts}'::text[], 'summary lists the allergens');
select is((select others from public.team_allergy_summary((select v from ctx where k = 'team'))), '{Kiwi}'::text[], 'summary lists the other names');
select is((select unanswered from public.team_allergy_summary((select v from ctx where k = 'team'))), true, 'Z has not answered');
select pg_temp.logout();
select is((select notes from public.player_allergies where player_id = 'b1000000-0000-0000-0000-00000000000a'), 'EpiPen with the coach', 'Y''s guardian could not touch X''s notes (silent no-op)');

-- ---------- pending guardian and stranger: nothing ----------
select pg_temp.login('a1000000-0000-0000-0000-000000000005');
select is((select count(*)::int from public.player_allergies), 0, 'a pending guardian of X reads nothing until the link is confirmed');
select throws_ok($$insert into public.player_allergies (player_id, status) values ('b1000000-0000-0000-0000-00000000000c', 'none')$$, '42501', null, 'and cannot answer');
select is((select unanswered from public.team_allergy_summary((select v from ctx where k = 'team'))), true, 'a pending parent is still a member: the summary works');
select pg_temp.logout();
select pg_temp.login('a1000000-0000-0000-0000-000000000007');
select is((select count(*)::int from public.player_allergies), 0, 'a stranger reads nothing');
select is((select count(*)::int from public.team_allergy_summary((select v from ctx where k = 'team'))), 0, 'a stranger gets no summary');
select pg_temp.logout();

-- ---------- once everyone answered, the flag drops ----------
insert into public.player_allergies (player_id, status) values ('b1000000-0000-0000-0000-00000000000c', 'none');
select pg_temp.login('a1000000-0000-0000-0000-000000000001');
select is((select unanswered from public.team_allergy_summary((select v from ctx where k = 'team'))), false, 'every family has answered');
select pg_temp.logout();

select * from finish();
rollback;
