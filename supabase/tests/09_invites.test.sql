-- Invite links (pgTAP, D49): signed-out preview, on/off switch, parent-only requests, and
-- approvals by coach, assistant and admin (assistants cannot hand out staff roles).
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

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
create or replace function pg_temp.anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end $$;
create or replace function pg_temp.logout()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;

select pg_temp.mk_user('f6000000-0000-0000-0000-000000000001', 'coach-i@test.com');
select pg_temp.mk_user('f6000000-0000-0000-0000-000000000002', 'assistant-i@test.com');
select pg_temp.mk_user('f6000000-0000-0000-0000-000000000003', 'parent-i@test.com');
select pg_temp.mk_user('f6000000-0000-0000-0000-000000000004', 'parent2-i@test.com');
select pg_temp.mk_user('f6000000-0000-0000-0000-000000000005', 'admin-i@test.com');
update public.profiles set is_platform_admin = true where id = 'f6000000-0000-0000-0000-000000000005';
create temp table ctx (k text primary key, v uuid);
create temp table txt (k text primary key, v text);
grant all on ctx, txt to authenticated, anon;

-- team (created by the admin, D48), a player, an assistant approved by the coach
select pg_temp.login('f6000000-0000-0000-0000-000000000005');
insert into ctx select 'team', public.create_team('Invite FC', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select public.admin_add_member((select v from ctx where k = 'team'), 'coach-i@test.com', 'coach');
select public.admin_add_member((select v from ctx where k = 'team'), 'assistant-i@test.com', 'assistant');
select pg_temp.logout();
-- this suite walks the approval flow, so the team asks for approval (off by default since D91)
update public.teams set require_approval = true where id = (select v from ctx where k = 'team');
insert into txt select 'code', join_code from public.teams where id = (select v from ctx where k = 'team');
insert into public.players (id, team_id, first_name, jersey_number) values
  ('e6000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), 'Ava', '1'),
  ('e6000000-0000-0000-0000-000000000002', (select v from ctx where k = 'team'), 'Ben', '2');

-- ---------- signed-out preview ----------
select pg_temp.anon();
select is((select (public.lookup_invite((select v from txt where k = 'code'))) ->> 'name'), 'Invite FC', 'anon lookup_invite returns the team name');
select is((select jsonb_array_length((public.lookup_invite((select v from txt where k = 'code'))) -> 'players')), 2, 'and the roster first names for the child picker');
select is((select (public.lookup_invite((select v from txt where k = 'code'))) ->> 'join_enabled'), 'true', 'invite is on by default');
select is((select public.lookup_invite('ZZZZZZZZ')), null, 'an unknown code returns nothing');
select is((select public.lookup_invite('short')), null, 'a malformed code returns nothing');
select throws_ok($$select public.request_join((select v from txt where k = 'code'), 'parent')$$, '42501', null, 'anon cannot file a request');
select is((select count(*)::int from public.teams), 0, 'anon reads no team rows directly');
select pg_temp.logout();

-- ---------- parent-only requests ----------
select pg_temp.login('f6000000-0000-0000-0000-000000000003');
select throws_ok($$select public.request_join((select v from txt where k = 'code'), 'assistant')$$, '22023', null, 'assistant coach cannot be requested through the link');
select throws_ok($$select public.request_join((select v from txt where k = 'code'), 'coach')$$, '22023', null, 'nor coach');
select lives_ok($$select public.request_join((select v from txt where k = 'code'), 'parent', array['e6000000-0000-0000-0000-000000000001'::uuid], 'Unlisted Kid')$$, 'a parent requests with a child and an unlisted name');
select pg_temp.logout();

-- ---------- the assistant approves (parent role only) ----------
select pg_temp.login('f6000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.team_members where team_id = (select v from ctx where k = 'team') and status = 'pending'), 1, 'assistant sees the pending request');
select is((select count(*)::int from public.unlisted_child_requests), 1, 'assistant sees the unlisted child name');
select throws_ok($$select public.approve_member((select id from public.team_members where user_id = 'f6000000-0000-0000-0000-000000000003'), 'assistant')$$, '42501', null, 'assistant cannot approve someone as an assistant');
select throws_ok($$select public.approve_member((select id from public.team_members where user_id = 'f6000000-0000-0000-0000-000000000003'), 'coach')$$, '42501', null, 'nor as a coach');
select lives_ok($$select public.approve_member((select id from public.team_members where user_id = 'f6000000-0000-0000-0000-000000000003'), 'parent', array['e6000000-0000-0000-0000-000000000002'::uuid])$$, 'assistant approves as parent and changes the child link');
select is((select string_agg(g.player_id::text || '/' || g.status::text, ',' order by g.player_id) from public.player_guardians g where g.user_id = 'f6000000-0000-0000-0000-000000000003'), 'e6000000-0000-0000-0000-000000000002/approved', 'the link follows the approver''s choice');
select is((select count(*)::int from public.unlisted_child_requests), 0, 'unlisted request cleared on approval');
select throws_ok($$select public.set_join_enabled((select v from ctx where k = 'team'), false)$$, '42501', null, 'assistant cannot turn the invite off');
select throws_ok($$select public.rotate_join_code((select v from ctx where k = 'team'))$$, '42501', null, 'nor replace it');
select pg_temp.logout();

-- ---------- coach turns the invite off; a second parent is refused until it is replaced ----------
select pg_temp.login('f6000000-0000-0000-0000-000000000001');
select lives_ok($$select public.set_join_enabled((select v from ctx where k = 'team'), false)$$, 'coach turns the invite off');
select pg_temp.logout();
select pg_temp.anon();
select is((select (public.lookup_invite((select v from txt where k = 'code'))) ->> 'join_enabled'), 'false', 'preview says the invite is off');
select pg_temp.logout();
select pg_temp.login('f6000000-0000-0000-0000-000000000004');
select throws_ok($$select public.request_join((select v from txt where k = 'code'), 'parent')$$, 'P0005', null, 'request refused while the invite is off');
select pg_temp.logout();
select pg_temp.login('f6000000-0000-0000-0000-000000000001');
insert into txt select 'code2', public.rotate_join_code((select v from ctx where k = 'team'));
select is((select join_enabled from public.teams where id = (select v from ctx where k = 'team')), true, 'Replace makes a new code and turns the invite back on');
select pg_temp.logout();
select pg_temp.login('f6000000-0000-0000-0000-000000000004');
select throws_ok($$select public.request_join((select v from txt where k = 'code'), 'parent')$$, 'P0002', null, 'the old code no longer works');
select lives_ok($$select public.request_join((select v from txt where k = 'code2'), 'parent')$$, 'the new code does');
select pg_temp.logout();

select * from finish();
rollback;
