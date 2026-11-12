-- Joining without approval, unconfirmed links and staff link management (pgTAP, D91, D92).
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

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

-- admin, coach, assistant, three parents (P1: child A; P2: children A and B; P3 joins later), a staff-parent
select pg_temp.mk_user('fc000000-0000-0000-0000-000000000001', 'admin-j@test.com');
select pg_temp.mk_user('fc000000-0000-0000-0000-000000000002', 'coach-j@test.com');
select pg_temp.mk_user('fc000000-0000-0000-0000-000000000003', 'assistant-j@test.com');
select pg_temp.mk_user('fc000000-0000-0000-0000-000000000004', 'parent1-j@test.com');
select pg_temp.mk_user('fc000000-0000-0000-0000-000000000005', 'parent2-j@test.com');
select pg_temp.mk_user('fc000000-0000-0000-0000-000000000006', 'parent3-j@test.com');
select pg_temp.mk_user('fc000000-0000-0000-0000-000000000007', 'old-j@test.com');
update public.profiles set is_platform_admin = true where id = 'fc000000-0000-0000-0000-000000000001';
update public.profiles set display_name = 'Pat One' where id = 'fc000000-0000-0000-0000-000000000004';
create temp table ctx (k text primary key, v uuid);
create temp table txt (k text primary key, v text);
grant all on ctx, txt to authenticated, anon;

select pg_temp.login('fc000000-0000-0000-0000-000000000001');
insert into ctx select 'team', public.create_team('Open FC', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select public.admin_add_member((select v from ctx where k = 'team'), 'coach-j@test.com', 'coach');
select public.admin_add_member((select v from ctx where k = 'team'), 'assistant-j@test.com', 'assistant');
select public.admin_add_member((select v from ctx where k = 'team'), 'old-j@test.com', 'parent');
select pg_temp.logout();
update public.teams set time_mode = 'periods' where id = (select v from ctx where k = 'team');
-- the old parent joined a month ago (so the New-this-week list has a cut-off to prove)
update public.team_members set approved_at = now() - interval '30 days', created_at = now() - interval '30 days' where user_id = 'fc000000-0000-0000-0000-000000000007';
insert into txt select 'code', join_code from public.teams where id = (select v from ctx where k = 'team');
insert into public.players (id, team_id, first_name, jersey_number, sort_order) values
  ('ec000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'team'), 'Ann', '1', 1),
  ('ec000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'team'), 'Bo', '2', 2),
  ('ec000000-0000-0000-0000-00000000000c', (select v from ctx where k = 'team'), 'Cy', '3', 3);
-- an already-approved parent from before (stays confirmed)
insert into public.player_guardians (player_id, user_id, status, approved_at) values
  ('ec000000-0000-0000-0000-00000000000c', 'fc000000-0000-0000-0000-000000000007', 'approved', now());
-- private data on Ann: details, a shared contact, an unshared contact, a skill result
insert into public.player_details (player_id, birthdate, shirt_size) values ('ec000000-0000-0000-0000-00000000000a', '2018-05-05', 'YM');
insert into public.player_contacts (id, player_id, name, relationship, phone, share_with_team) values
  ('cc000000-0000-0000-0000-000000000001', 'ec000000-0000-0000-0000-00000000000a', 'Shared Aunt', 'Aunt', '+15550100011', true),
  ('cc000000-0000-0000-0000-000000000002', 'ec000000-0000-0000-0000-00000000000a', 'Private Uncle', 'Uncle', '+15550100012', false);
insert into public.skill_tests (id, team_id, key, name, metric) values
  ('dc000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), 'touch', 'First touch', 'count');
insert into public.skill_results (player_id, skill_test_id, value) values ('ec000000-0000-0000-0000-00000000000a', 'dc000000-0000-0000-0000-000000000001', 7);
-- a finished game where Ann and Bo each scored, stats "own child only"
insert into public.games (id, team_id, season_id, opponent, status, finished_at) values
  ('ac000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'),
   (select id from public.seasons where team_id = (select v from ctx where k = 'team')), 'Owls', 'done', now());
insert into public.score_events (game_id, side, period_index, event_type, points, scorer_player_id) values
  ('ac000000-0000-0000-0000-000000000001', 'us', 0, 'goal', 1, 'ec000000-0000-0000-0000-00000000000a'),
  ('ac000000-0000-0000-0000-000000000001', 'us', 0, 'goal', 1, 'ec000000-0000-0000-0000-00000000000b');

-- ---------- defaults and the preview ----------
select is((select require_approval from public.teams where id = (select v from ctx where k = 'team')), false, 'approval is off by default');
select pg_temp.anon();
select is((select (public.lookup_invite((select v from txt where k = 'code'))) ->> 'require_approval'), 'false', 'the invite preview says the coach does not confirm first');
select pg_temp.logout();

-- ---------- P1 joins straight in, linked to Ann (unconfirmed) ----------
select pg_temp.login('fc000000-0000-0000-0000-000000000004');
select is((select (public.request_join((select v from txt where k = 'code'), 'parent', array['ec000000-0000-0000-0000-00000000000a'::uuid], null, '+15550100004')) ->> 'status'), 'active', 'submitting the link makes the parent active at once');
select is((select status::text || '/' || role::text from public.team_members where user_id = 'fc000000-0000-0000-0000-000000000004'), 'active/parent', 'an active parent membership, never a staff role');
select is((select status::text from public.player_guardians where user_id = 'fc000000-0000-0000-0000-000000000004'), 'pending', 'the child link is unconfirmed');
select is((select count(*)::int from public.players), 3, 'the parent reads the roster like any member');
select is((select count(*)::int from public.teams), 1, 'and the team');
select is((select count(*)::int from public.my_pending_requests()), 0, 'nothing is pending for them');
-- granted: the child's own stats under "own child only"
select is((select string_agg(player_id::text, ',') from public.player_season_stats((select v from ctx where k = 'team'))), 'ec000000-0000-0000-0000-00000000000a', 'the stats table has their own child only');
select is((select goals from public.player_season_stats((select v from ctx where k = 'team'))), 1, 'with the goal counted');
select is(public.can_see_player_stats('ec000000-0000-0000-0000-00000000000a'), true, 'the own-child stats helper says yes');
select is(public.can_see_player_stats('ec000000-0000-0000-0000-00000000000b'), false, 'and no for another child');
-- withheld until a coach confirms the link
select is((select count(*)::int from public.player_details where player_id = 'ec000000-0000-0000-0000-00000000000a'), 0, 'withheld: birthdate and shirt size');
select is((select string_agg(name, ',' order by name) from public.player_contacts where player_id = 'ec000000-0000-0000-0000-00000000000a'), 'Shared Aunt', 'withheld: the contact not shared with the team (the shared one is visible)');
select is((select count(*)::int from public.skill_results where player_id = 'ec000000-0000-0000-0000-00000000000a'), 0, 'withheld: skill results');
select is((select count(*)::int from public.player_season_stats((select v from ctx where k = 'team')) where player_id = 'ec000000-0000-0000-0000-00000000000b'), 0, 'withheld: other children''s stats');
select throws_ok($$insert into public.player_details (player_id, shirt_size) values ('ec000000-0000-0000-0000-00000000000a', 'YL')$$, '42501', null, 'withheld: cannot write the child''s details');
update public.player_details set shirt_size = 'YL' where player_id = 'ec000000-0000-0000-0000-00000000000a';
select pg_temp.logout();
select is((select shirt_size::text from public.player_details where player_id = 'ec000000-0000-0000-0000-00000000000a'), 'YM', 'withheld: an update to the details is a no-op');
select pg_temp.login('fc000000-0000-0000-0000-000000000004');
update public.player_contacts set phone = '+15550100099' where id = 'cc000000-0000-0000-0000-000000000001';
delete from public.player_contacts where id = 'cc000000-0000-0000-0000-000000000001';
select pg_temp.logout();
select is((select phone || '/' || count(*)::text from public.player_contacts where id = 'cc000000-0000-0000-0000-000000000001' group by phone), '+15550100011/1', 'withheld: cannot edit or delete other people''s contacts');
-- allowed: a contact entry for themselves, which they may edit; nobody else's
select pg_temp.login('fc000000-0000-0000-0000-000000000004');
select lives_ok($$insert into public.player_contacts (id, player_id, name, relationship, phone, user_id, share_with_team) values ('cc000000-0000-0000-0000-000000000003', 'ec000000-0000-0000-0000-00000000000a', 'Pat One', 'Parent', '+15550100004', 'fc000000-0000-0000-0000-000000000004', false)$$, 'the parent adds a contact entry for themselves');
select throws_ok($$insert into public.player_contacts (player_id, name, phone, user_id) values ('ec000000-0000-0000-0000-00000000000a', 'Someone Else', '+15550100055', 'fc000000-0000-0000-0000-000000000005')$$, '42501', null, 'but not one for another account');
select throws_ok($$insert into public.player_contacts (player_id, name, phone) values ('ec000000-0000-0000-0000-00000000000a', 'No Account', '+15550100056')$$, '42501', null, 'nor an entry without an account');
select lives_ok($$update public.player_contacts set phone = '+15550100044' where id = 'cc000000-0000-0000-0000-000000000003'$$, 'they edit their own entry');
select is((select phone from public.player_contacts where id = 'cc000000-0000-0000-0000-000000000003'), '+15550100044', 'and the edit stuck, even though the row is unshared (they can read their own row)');
select is((select can_edit from public.player_people('ec000000-0000-0000-0000-00000000000a') where contact_id = 'cc000000-0000-0000-0000-000000000003'), true, 'player_people marks their own row editable');
select is((select can_edit from public.player_people('ec000000-0000-0000-0000-00000000000a') where contact_id = 'cc000000-0000-0000-0000-000000000001'), false, 'and the shared aunt read-only');
-- links are the staff's business after joining
select throws_ok($$select public.request_guardian_link('ec000000-0000-0000-0000-00000000000b')$$, '42501', null, 'a parent cannot add a child link after joining');
select throws_ok($$insert into public.player_guardians (player_id, user_id) values ('ec000000-0000-0000-0000-00000000000b', 'fc000000-0000-0000-0000-000000000004')$$, '42501', null, 'nor directly');
delete from public.player_guardians where user_id = 'fc000000-0000-0000-0000-000000000004';
select is((select count(*)::int from public.player_guardians where user_id = 'fc000000-0000-0000-0000-000000000004'), 1, 'nor remove their link (RLS no-op)');
select is((select (public.request_join((select v from txt where k = 'code'), 'parent', array['ec000000-0000-0000-0000-00000000000b'::uuid])) ->> 'status'), 'active', 'opening the link again as a member changes nothing');
select is((select count(*)::int from public.player_guardians where user_id = 'fc000000-0000-0000-0000-000000000004'), 1, 'no new link from a second submit');
select pg_temp.logout();

-- ---------- P2 joins with two children; staff see them as new this week ----------
select pg_temp.login('fc000000-0000-0000-0000-000000000005');
select public.request_join((select v from txt where k = 'code'), 'parent', array['ec000000-0000-0000-0000-00000000000a'::uuid, 'ec000000-0000-0000-0000-00000000000b'::uuid], 'Unlisted Kid');
select pg_temp.logout();
select pg_temp.login('fc000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.list_team_members((select v from ctx where k = 'team')) where joined_at >= now() - interval '7 days' and role = 'parent'), 2, 'the assistant sees two parents who joined this week');
select is((select string_agg(c ->> 'first_name' || ':' || (c ->> 'status'), ',' order by c ->> 'first_name') from public.list_team_members((select v from ctx where k = 'team')) m, jsonb_array_elements(m.children) c where m.user_id = 'fc000000-0000-0000-0000-000000000005'), 'Ann:pending,Bo:pending', 'with each child link and whether it is confirmed');
select is((select unlisted ->> 0 from public.list_team_members((select v from ctx where k = 'team')) where user_id = 'fc000000-0000-0000-0000-000000000005'), 'Unlisted Kid', 'and the unlisted child name');
select is((select string_agg(c ->> 'status', ',') from public.list_team_members((select v from ctx where k = 'team')) m, jsonb_array_elements(m.children) c where m.user_id = 'fc000000-0000-0000-0000-000000000007'), 'approved', 'a parent approved before stays confirmed');
-- staff confirm one link (one tap), change the set for P2, and the parent gets the private data
select lives_ok($$select public.approve_guardian_link((select id from public.player_guardians where user_id = 'fc000000-0000-0000-0000-000000000004'))$$, 'the assistant confirms P1''s link to Ann');
select is((select count(*)::int from public.player_contacts where player_id = 'ec000000-0000-0000-0000-00000000000a' and user_id = 'fc000000-0000-0000-0000-000000000004'), 1, 'confirming keeps their one contact row (no duplicate)');
select lives_ok($$select public.set_member_children((select id from public.team_members where user_id = 'fc000000-0000-0000-0000-000000000005'), array['ec000000-0000-0000-0000-00000000000b'::uuid])$$, 'the assistant changes P2''s links to Bo only');
select is((select string_agg(player_id::text || '/' || status::text, ',') from public.player_guardians where user_id = 'fc000000-0000-0000-0000-000000000005'), 'ec000000-0000-0000-0000-00000000000b/approved', 'P2 is linked to Bo, confirmed, and no longer to Ann');
select is((select count(*)::int from public.player_contacts where player_id = 'ec000000-0000-0000-0000-00000000000b' and user_id = 'fc000000-0000-0000-0000-000000000005'), 1, 'a staff-made link makes the parent a contact on the child (D57)');
select pg_temp.logout();
select pg_temp.login('fc000000-0000-0000-0000-000000000004');
select is((select shirt_size::text from public.player_details where player_id = 'ec000000-0000-0000-0000-00000000000a'), 'YM', 'once confirmed, P1 reads the details');
select is((select count(*)::int from public.skill_results where player_id = 'ec000000-0000-0000-0000-00000000000a'), 1, 'and the skill results');
select pg_temp.logout();

-- ---------- with approval on, the old flow applies unchanged ----------
select pg_temp.login('fc000000-0000-0000-0000-000000000003');
select lives_ok($$update public.teams set require_approval = true where id = (select v from ctx where k = 'team')$$, 'staff turn approval on');
select pg_temp.logout();
select pg_temp.login('fc000000-0000-0000-0000-000000000006');
select is((select (public.request_join((select v from txt where k = 'code'), 'parent', array['ec000000-0000-0000-0000-00000000000c'::uuid])) ->> 'status'), 'pending', 'P3 is pending');
select is((select count(*)::int from public.teams), 0, 'and reads nothing');
select pg_temp.logout();
select pg_temp.login('fc000000-0000-0000-0000-000000000002');
select lives_ok($$select public.approve_member((select id from public.team_members where user_id = 'fc000000-0000-0000-0000-000000000006'), 'parent')$$, 'the coach approves P3');
select is((select status::text from public.player_guardians where user_id = 'fc000000-0000-0000-0000-000000000006'), 'approved', 'approval confirms the link as before');
select pg_temp.logout();

select * from finish();
rollback;
