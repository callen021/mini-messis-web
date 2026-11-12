-- Team board (pgTAP, D58): members post and comment, authors edit/delete their own, staff delete
-- anything and own the announcement flag, pending members and strangers see nothing, unread flips.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

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

select pg_temp.mk_user('fa000000-0000-0000-0000-000000000001', 'coach-b@test.com', 'Coach Casey');
select pg_temp.mk_user('fa000000-0000-0000-0000-000000000002', 'assistant-b@test.com', 'Assistant Alex');
select pg_temp.mk_user('fa000000-0000-0000-0000-000000000003', 'parent-b1@test.com', 'Pat Example');
select pg_temp.mk_user('fa000000-0000-0000-0000-000000000004', 'parent-b2@test.com', 'Quinn Sample');
select pg_temp.mk_user('fa000000-0000-0000-0000-000000000005', 'pending-b@test.com', 'Pending Person');
select pg_temp.mk_user('fa000000-0000-0000-0000-000000000006', 'admin-b@test.com');
update public.profiles set is_platform_admin = true where id = 'fa000000-0000-0000-0000-000000000006';
create temp table ctx (k text primary key, v uuid);
create temp table txt (k text primary key, v text);
grant all on ctx, txt to authenticated;

select pg_temp.login('fa000000-0000-0000-0000-000000000006');
insert into ctx select 'team', public.create_team('Board FC', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select public.admin_add_member((select v from ctx where k = 'team'), 'coach-b@test.com', 'coach');
select public.admin_add_member((select v from ctx where k = 'team'), 'assistant-b@test.com', 'assistant');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-b1@test.com', 'parent');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-b2@test.com', 'parent');
select pg_temp.logout();
-- a pending member is part of this suite, so the team asks for approval (off by default since D91)
update public.teams set require_approval = true where id = (select v from ctx where k = 'team');
insert into txt select 'code', join_code from public.teams where id = (select v from ctx where k = 'team');
select pg_temp.login('fa000000-0000-0000-0000-000000000005');
select public.request_join((select v from txt where k = 'code'), 'parent');
select pg_temp.logout();

-- ---------- parent 1 posts; cannot announce ----------
select pg_temp.login('fa000000-0000-0000-0000-000000000003');
select lives_ok($$insert into public.board_posts (id, team_id, author_id, body) values ('c0000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), 'fa000000-0000-0000-0000-000000000003', 'Who can bring orange slices Saturday?')$$, 'a parent posts');
select throws_ok($$insert into public.board_posts (team_id, author_id, body, is_announcement) values ((select v from ctx where k = 'team'), 'fa000000-0000-0000-0000-000000000003', 'Hear ye', true)$$, '42501', null, 'a parent cannot post an announcement');
select throws_ok($$update public.board_posts set is_announcement = true where id = 'c0000000-0000-0000-0000-000000000001'$$, '42501', null, 'nor mark their own post as one');
select throws_ok($$insert into public.board_posts (team_id, author_id, body) values ((select v from ctx where k = 'team'), 'fa000000-0000-0000-0000-000000000003', repeat('x', 2001))$$, '23514', null, 'posts are capped at 2000 characters');
select is((select author_id from public.board_posts where id = 'c0000000-0000-0000-0000-000000000001'), 'fa000000-0000-0000-0000-000000000003', 'author stamped from the JWT');
select is(public.board_unread((select v from ctx where k = 'team')), false, 'your own post is not unread for you');
select pg_temp.logout();

-- ---------- parent 2 sees it unread, comments, cannot edit the other's post ----------
select pg_temp.login('fa000000-0000-0000-0000-000000000004');
select is(public.board_unread((select v from ctx where k = 'team')), true, 'another member has an unread dot');
select lives_ok($$select public.board_mark_read((select v from ctx where k = 'team'))$$, 'opening the board marks it read');
select is(public.board_unread((select v from ctx where k = 'team')), false, 'and the dot clears');
select lives_ok($$insert into public.board_comments (id, post_id, author_id, body) values ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000004', 'I can!')$$, 'a member comments');
update public.board_posts set body = 'hacked' where id = 'c0000000-0000-0000-0000-000000000001';
delete from public.board_posts where id = 'c0000000-0000-0000-0000-000000000001';
select is((select body from public.board_posts where id = 'c0000000-0000-0000-0000-000000000001'), 'Who can bring orange slices Saturday?', 'editing or deleting someone else''s post is a no-op');
select is((select jsonb_array_length(comments) from public.board_feed((select v from ctx where k = 'team')) where id = 'c0000000-0000-0000-0000-000000000001'), 1, 'the feed carries the comment');
select is((select author_name from public.board_feed((select v from ctx where k = 'team'))), 'Pat Example', 'with the author''s display name');
select pg_temp.logout();

-- parent 1 now has an unread comment; editing own post stamps edited_at
select pg_temp.login('fa000000-0000-0000-0000-000000000003');
select is(public.board_unread((select v from ctx where k = 'team')), true, 'a new comment by someone else is unread for the author');
select lives_ok($$update public.board_posts set body = 'Who can bring orange slices on Saturday?' where id = 'c0000000-0000-0000-0000-000000000001'$$, 'author edits their own post');
select isnt((select edited_at from public.board_posts where id = 'c0000000-0000-0000-0000-000000000001'), null, 'edited_at is stamped');
select pg_temp.logout();

-- ---------- pending member and stranger: nothing ----------
select pg_temp.login('fa000000-0000-0000-0000-000000000005');
select is((select count(*)::int from public.board_posts), 0, 'a pending member reads no posts');
select is((select count(*)::int from public.board_feed((select v from ctx where k = 'team'))), 0, 'nor the feed');
select throws_ok($$insert into public.board_posts (team_id, author_id, body) values ((select v from ctx where k = 'team'), 'fa000000-0000-0000-0000-000000000005', 'let me in')$$, '42501', null, 'and cannot post');
select throws_ok($$insert into public.board_comments (post_id, author_id, body) values ('c0000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000005', 'hi')$$, '42501', null, 'nor comment');
select is(public.board_unread((select v from ctx where k = 'team')), false, 'no unread dot either');
select pg_temp.logout();

-- ---------- assistant: announcement, delete anything ----------
select pg_temp.login('fa000000-0000-0000-0000-000000000002');
select lives_ok($$insert into public.board_posts (id, team_id, author_id, body, is_announcement) values ('c0000000-0000-0000-0000-000000000002', (select v from ctx where k = 'team'), 'fa000000-0000-0000-0000-000000000002', 'Practice moved to Field 2 this week.', true)$$, 'assistant posts an announcement');
select is((select id from public.board_feed((select v from ctx where k = 'team')) limit 1), 'c0000000-0000-0000-0000-000000000002', 'announcements come first in the feed');
select lives_ok($$delete from public.board_comments where id = 'd0000000-0000-0000-0000-000000000001'$$, 'assistant deletes a member''s comment');
select is((select count(*)::int from public.board_comments), 0, 'it is gone');
select lives_ok($$update public.board_posts set is_announcement = false where id = 'c0000000-0000-0000-0000-000000000002'$$, 'staff unmark an announcement');
select pg_temp.logout();

-- admin (not a member) deletes anything
select pg_temp.login('fa000000-0000-0000-0000-000000000006');
delete from public.board_posts where id = 'c0000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.board_posts where id = 'c0000000-0000-0000-0000-000000000001'), 0, 'admin deletes a post');
select pg_temp.logout();

select * from finish();
rollback;
