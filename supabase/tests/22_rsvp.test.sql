-- RSVP (pgTAP, D107): who may reply, the parent lock, last write wins, the coach override, and
-- what a reply does to the start-of-game copy and the game_players snapshot.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

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
create or replace function pg_temp.rsvp(p_game uuid, p_player uuid)
returns text language sql as $$
  select status::text || '/' || set_by_role::text from public.event_rsvps where game_id = p_game and player_id = p_player;
$$;

select pg_temp.mk_user('f7000000-0000-0000-0000-000000000001', 'coach-r@test.com');
select pg_temp.mk_user('f7000000-0000-0000-0000-000000000003', 'parent-r@test.com');
select pg_temp.mk_user('f7000000-0000-0000-0000-000000000004', 'parent2-r@test.com');
select pg_temp.mk_user('f7000000-0000-0000-0000-000000000005', 'stranger-r@test.com');
create temp table ctx (k text primary key, v uuid);
create temp table txt (k text primary key, v text);
grant all on ctx to authenticated;
grant all on txt to authenticated;

-- team (creation is admin-only, D48), roster, parents
update public.profiles set is_platform_admin = true where id = 'f7000000-0000-0000-0000-000000000001';
select pg_temp.login('f7000000-0000-0000-0000-000000000001');
insert into ctx select 'team', public.create_team('Strikers', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
insert into txt select 'code', join_code from public.teams where id = (select v from ctx where k = 'team');
insert into ctx select 'season', id from public.seasons where team_id = (select v from ctx where k = 'team') and is_current;
select pg_temp.logout();
update public.profiles set is_platform_admin = false where id = 'f7000000-0000-0000-0000-000000000001';

insert into public.players (id, team_id, first_name, sort_order) values
  ('e7000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'team'), 'Ann', 1),
  ('e7000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'team'), 'Bo', 2),
  ('e7000000-0000-0000-0000-00000000000c', (select v from ctx where k = 'team'), 'Cy', 3);

-- approval is off (D91): both parents are active at once, their child links unconfirmed
select pg_temp.login('f7000000-0000-0000-0000-000000000003');
select public.request_join((select v from txt where k = 'code'), 'parent', array['e7000000-0000-0000-0000-00000000000a'::uuid]);
select pg_temp.logout();
select pg_temp.login('f7000000-0000-0000-0000-000000000004');
select public.request_join((select v from txt where k = 'code'), 'parent', array['e7000000-0000-0000-0000-00000000000b'::uuid]);
select pg_temp.logout();
-- the coach confirms the first parent's link; the second stays pending
update public.player_guardians set status = 'approved', approved_at = now()
  where user_id = 'f7000000-0000-0000-0000-000000000003';

-- events: a game next week, a practice next week, a practice last week
insert into public.games (id, team_id, season_id, opponent, game_date) values
  ('a7000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), (select v from ctx where k = 'season'), 'Bears', current_date + 7);
insert into public.practices (id, team_id, season_id, practice_date, start_time) values
  ('b7000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), (select v from ctx where k = 'season'), current_date + 7, '18:00'),
  ('b7000000-0000-0000-0000-000000000002', (select v from ctx where k = 'team'), (select v from ctx where k = 'season'), current_date - 7, '18:00'),
  ('b7000000-0000-0000-0000-000000000003', (select v from ctx where k = 'team'), (select v from ctx where k = 'season'), current_date + 8, '18:00');
update public.practices set status = 'cancelled' where id = 'b7000000-0000-0000-0000-000000000003';

-- ---------- who may reply ----------
select pg_temp.login('f7000000-0000-0000-0000-000000000003');
select lives_ok($$select public.set_rsvp('e7000000-0000-0000-0000-00000000000a', 'out', 'a7000000-0000-0000-0000-000000000001', null)$$,
  'a parent replies for a linked child');
select is(pg_temp.rsvp('a7000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-00000000000a'), 'out/parent', 'the row says out, by parent');
select is((select count(*)::int from public.event_rsvps), 1, 'the parent reads the team''s replies');
select throws_ok($$select public.set_rsvp('e7000000-0000-0000-0000-00000000000b', 'out', 'a7000000-0000-0000-0000-000000000001', null)$$,
  '42501', null, 'not for another family''s child');
select throws_ok($$insert into public.event_rsvps (team_id, game_id, player_id, status, set_by_role)
  values ((select v from ctx where k = 'team'), 'a7000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-00000000000a', 'going', 'parent')$$,
  '42501', null, 'rows are never written directly');
select throws_ok($$select public.set_rsvp('e7000000-0000-0000-0000-00000000000a', 'out', 'a7000000-0000-0000-0000-000000000001', 'b7000000-0000-0000-0000-000000000001')$$,
  '22023', null, 'a reply is for one game or one practice, not both');
select throws_ok($$select public.set_rsvp('e7000000-0000-0000-0000-00000000000a', 'out', null, null)$$,
  '22023', null, 'nor neither');
select pg_temp.logout();

select pg_temp.login('f7000000-0000-0000-0000-000000000005');
select throws_ok($$select public.set_rsvp('e7000000-0000-0000-0000-00000000000a', 'going', 'a7000000-0000-0000-0000-000000000001', null)$$,
  '42501', null, 'a stranger cannot reply');
select is((select count(*)::int from public.event_rsvps), 0, 'nor read replies');
select pg_temp.logout();

-- an unconfirmed link may reply while the team does not require approval, not once it does
select pg_temp.login('f7000000-0000-0000-0000-000000000004');
select lives_ok($$select public.set_rsvp('e7000000-0000-0000-0000-00000000000b', 'going', 'a7000000-0000-0000-0000-000000000001', null)$$,
  'with approval off, a pending link replies');
select pg_temp.logout();
update public.teams set require_approval = true where id = (select v from ctx where k = 'team');
select pg_temp.login('f7000000-0000-0000-0000-000000000004');
select throws_ok($$select public.set_rsvp('e7000000-0000-0000-0000-00000000000b', 'out', 'a7000000-0000-0000-0000-000000000001', null)$$,
  '42501', null, 'with approval on, a pending link may not');
select pg_temp.logout();
select pg_temp.login('f7000000-0000-0000-0000-000000000003');
select lives_ok($$select public.set_rsvp('e7000000-0000-0000-0000-00000000000a', 'out', 'a7000000-0000-0000-0000-000000000001', null)$$,
  'an approved link still may');
select pg_temp.logout();
update public.teams set require_approval = false where id = (select v from ctx where k = 'team');

-- ---------- practices and the parent lock ----------
select pg_temp.login('f7000000-0000-0000-0000-000000000003');
select lives_ok($$select public.set_rsvp('e7000000-0000-0000-0000-00000000000a', 'going', null, 'b7000000-0000-0000-0000-000000000001')$$,
  'a parent replies for a practice next week');
select is((select status::text from public.event_rsvps where practice_id = 'b7000000-0000-0000-0000-000000000001'), 'going', 'the practice reply is stored');
select throws_ok($$select public.set_rsvp('e7000000-0000-0000-0000-00000000000a', 'going', null, 'b7000000-0000-0000-0000-000000000002')$$,
  'P0005', null, 'not for a practice that has already started');
select throws_ok($$select public.set_rsvp('e7000000-0000-0000-0000-00000000000a', 'going', null, 'b7000000-0000-0000-0000-000000000003')$$,
  'P0005', null, 'nor for a cancelled one');
select lives_ok($$select public.set_rsvp('e7000000-0000-0000-0000-00000000000a', 'none', null, 'b7000000-0000-0000-0000-000000000001')$$,
  'a reply can go back to no reply');
select is((select status::text || '/' || set_by_role::text from public.event_rsvps where practice_id = 'b7000000-0000-0000-0000-000000000001'), 'none/parent', 'and the row remembers who cleared it');
select pg_temp.logout();

-- ---------- the coach: any player, last write wins, "going" lifts the team-wide flag ----------
select pg_temp.login('f7000000-0000-0000-0000-000000000001');
select lives_ok($$select public.set_rsvp('e7000000-0000-0000-0000-00000000000c', 'out', 'a7000000-0000-0000-0000-000000000001', null)$$,
  'the coach replies for any player');
select is(pg_temp.rsvp('a7000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-00000000000c'), 'out/coach', 'by coach');
select public.set_rsvp('e7000000-0000-0000-0000-00000000000a', 'going', 'a7000000-0000-0000-0000-000000000001', null);
select is(pg_temp.rsvp('a7000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-00000000000a'), 'going/coach', 'the coach overrides the parent');
select public.set_player_available('e7000000-0000-0000-0000-00000000000b', false);
select public.set_rsvp('e7000000-0000-0000-0000-00000000000b', 'going', 'a7000000-0000-0000-0000-000000000001', null);
select is((select is_available from public.players where id = 'e7000000-0000-0000-0000-00000000000b'), true, 'a coach''s "going" lifts the coach''s own out flag');
select pg_temp.logout();
select pg_temp.login('f7000000-0000-0000-0000-000000000003');
select public.set_rsvp('e7000000-0000-0000-0000-00000000000a', 'out', 'a7000000-0000-0000-0000-000000000001', null);
select is(pg_temp.rsvp('a7000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-00000000000a'), 'out/parent', 'and the parent''s later reply wins again');
select pg_temp.logout();

-- ---------- the plan is untouched; Start game opens the spot and the snapshot says unavailable ----------
-- the template: Ann at ST, Bo at SW, Cy at GK (Cy is out by the coach's reply)
insert into ctx select 'tpl', l.id from public.lineups l
  where l.team_id = (select v from ctx where k = 'team') and l.game_id is null and l.period_index = 0;
update public.lineup_slots set player_id = 'e7000000-0000-0000-0000-00000000000a' where lineup_id = (select v from ctx where k = 'tpl') and slot_index = 0;
update public.lineup_slots set player_id = 'e7000000-0000-0000-0000-00000000000b' where lineup_id = (select v from ctx where k = 'tpl') and slot_index = 1;
update public.lineup_slots set player_id = 'e7000000-0000-0000-0000-00000000000c' where lineup_id = (select v from ctx where k = 'tpl') and slot_index = 2;
select is((select player_id from public.lineup_slots where lineup_id = (select v from ctx where k = 'tpl') and slot_index = 0),
  'e7000000-0000-0000-0000-00000000000a', 'a reply never removes a placed player from the plan');
select pg_temp.login('f7000000-0000-0000-0000-000000000001');
select public.start_game('a7000000-0000-0000-0000-000000000001');
select is((select string_agg(coalesce(left(p.first_name, 1), '-'), '' order by s.slot_index)
           from public.lineup_slots s join public.lineups l on l.id = s.lineup_id
           left join public.players p on p.id = s.player_id
           where l.game_id = 'a7000000-0000-0000-0000-000000000001' and l.period_index = 0),
  '-B-', 'Start game opens the spots of the players whose reply says out, keeps the rest');
select is((select available from public.game_players where game_id = 'a7000000-0000-0000-0000-000000000001' and player_id = 'e7000000-0000-0000-0000-00000000000a'),
  false, 'the snapshot records the parent-out player unavailable');
select is((select available from public.game_players where game_id = 'a7000000-0000-0000-0000-000000000001' and player_id = 'e7000000-0000-0000-0000-00000000000b'),
  true, 'and the others available');
select is((select player_id from public.lineup_slots where lineup_id = (select v from ctx where k = 'tpl') and slot_index = 0),
  'e7000000-0000-0000-0000-00000000000a', 'the template itself still holds the player');
select pg_temp.logout();

-- ---------- after the start: parents are locked, the coach is not ----------
select pg_temp.login('f7000000-0000-0000-0000-000000000003');
select throws_ok($$select public.set_rsvp('e7000000-0000-0000-0000-00000000000a', 'going', 'a7000000-0000-0000-0000-000000000001', null)$$,
  'P0005', null, 'a parent cannot change a reply once the game has started');
select pg_temp.logout();
select pg_temp.login('f7000000-0000-0000-0000-000000000001');
select lives_ok($$select public.set_rsvp('e7000000-0000-0000-0000-00000000000a', 'going', 'a7000000-0000-0000-0000-000000000001', null)$$,
  'the coach still can');
select lives_ok(260select public.finish_game('a7000000-0000-0000-0000-000000000001')260, 'the game finishes as before');
select is((select status::text from public.event_rsvps where game_id = 'a7000000-0000-0000-0000-000000000001' and player_id = 'e7000000-0000-0000-0000-00000000000a'),
  'going', 'the replies of a finished game stay as they were');
select pg_temp.logout();

select * from finish();
rollback;
