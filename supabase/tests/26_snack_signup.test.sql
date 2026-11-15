-- Snack signup (pgTAP, D115): the setting gates it, a family claims open eligible upcoming events
-- up to its share, releases only its own, staff assign and clear anything, and the snack family's
-- "can't make it" flags the event.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

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

select pg_temp.mk_user('c2000000-0000-0000-0000-000000000001', 'coach-sn@test.com');
select pg_temp.mk_user('c2000000-0000-0000-0000-000000000003', 'parent-sx@test.com');   -- approved guardian of X
select pg_temp.mk_user('c2000000-0000-0000-0000-000000000004', 'parent-sy@test.com');   -- approved guardian of Y
select pg_temp.mk_user('c2000000-0000-0000-0000-000000000006', 'admin-sn@test.com');
select pg_temp.mk_user('c2000000-0000-0000-0000-000000000007', 'stranger-sn@test.com');
update public.profiles set is_platform_admin = true where id = 'c2000000-0000-0000-0000-000000000006';
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

select pg_temp.login('c2000000-0000-0000-0000-000000000006');
insert into ctx select 'team', public.create_team('Snack FC', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select public.admin_add_member((select v from ctx where k = 'team'), 'coach-sn@test.com', 'coach');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-sx@test.com', 'parent');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-sy@test.com', 'parent');
select pg_temp.logout();
insert into ctx select 'season', s.id from public.seasons s where s.team_id = (select v from ctx where k = 'team') and s.is_current;
insert into public.players (id, team_id, first_name) values
  ('d2000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'team'), 'Child X'),
  ('d2000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'team'), 'Child Y');
insert into public.player_guardians (player_id, user_id, status) values
  ('d2000000-0000-0000-0000-00000000000a', 'c2000000-0000-0000-0000-000000000003', 'approved'),
  ('d2000000-0000-0000-0000-00000000000b', 'c2000000-0000-0000-0000-000000000004', 'approved');
-- three games and one practice this season (cap with games only: ceil(3 / 2) = 2)
insert into public.games (id, team_id, season_id, opponent, game_date) values
  ('e2000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), (select v from ctx where k = 'season'), 'Bears', current_date + 7),
  ('e2000000-0000-0000-0000-000000000002', (select v from ctx where k = 'team'), (select v from ctx where k = 'season'), 'Lions', current_date + 14),
  ('e2000000-0000-0000-0000-000000000003', (select v from ctx where k = 'team'), (select v from ctx where k = 'season'), 'Owls', current_date + 21);
insert into public.practices (id, team_id, season_id, practice_date, start_time) values
  ('e2000000-0000-0000-0000-000000000011', (select v from ctx where k = 'team'), (select v from ctx where k = 'season'), current_date + 8, '18:00');

-- ---------- off by default: parents cannot sign up ----------
select is((select snack_signup::text from public.teams where id = (select v from ctx where k = 'team')), 'off', 'snack signup is off by default');
select pg_temp.login('c2000000-0000-0000-0000-000000000003');
select is(public.snack_cap((select v from ctx where k = 'team')), 0, 'no eligible events while off');
select throws_ok($$select public.set_snack('d2000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-000000000001', null)$$, 'P0017', null, 'a parent cannot sign up while it is off');
select pg_temp.logout();

-- ---------- games only ----------
update public.teams set snack_signup = 'games' where id = (select v from ctx where k = 'team');
select pg_temp.login('c2000000-0000-0000-0000-000000000003');
select is(public.snack_cap((select v from ctx where k = 'team')), 2, 'cap = ceil(3 games / 2 players) = 2');
select lives_ok($$select public.set_snack('d2000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-000000000001', null)$$, 'X''s family takes the first game');
select lives_ok($$select public.set_snack('d2000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-000000000002', null)$$, 'and the second');
select throws_ok($$select public.set_snack('d2000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-000000000003', null)$$, 'P0019', null, 'the third is over the family''s share');
select throws_ok($$select public.set_snack('d2000000-0000-0000-0000-00000000000a', null, 'e2000000-0000-0000-0000-000000000011')$$, 'P0017', null, 'practices are not eligible with games only');
select throws_ok($$select public.set_snack('d2000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-000000000003', null)$$, '42501', null, 'X''s parent cannot sign up Y''s family');
select is((select snack_player_id from public.games where id = 'e2000000-0000-0000-0000-000000000001'), 'd2000000-0000-0000-0000-00000000000a', 'the slot is stored on the game');
select pg_temp.logout();

select pg_temp.login('c2000000-0000-0000-0000-000000000004');
select throws_ok($$select public.set_snack('d2000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-000000000001', null)$$, 'P0018', null, 'Y''s family cannot take a taken slot');
select throws_ok($$select public.clear_snack('e2000000-0000-0000-0000-000000000001', null)$$, '42501', null, 'nor release another family''s slot');
select lives_ok($$select public.set_snack('d2000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-000000000003', null)$$, 'Y''s family takes the open third game');
select pg_temp.logout();

-- ---------- the family releases its own; a coach assigns and clears anything ----------
select pg_temp.login('c2000000-0000-0000-0000-000000000003');
select lives_ok($$select public.clear_snack('e2000000-0000-0000-0000-000000000002', null)$$, 'X''s family releases the second game');
select is((select snack_player_id from public.games where id = 'e2000000-0000-0000-0000-000000000002'), null, 'the second game is open again');
select pg_temp.logout();
select pg_temp.login('c2000000-0000-0000-0000-000000000001');
select lives_ok($$select public.set_snack('d2000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-000000000001', null)$$, 'the coach overrides the first game to Y''s family');
select lives_ok($$select public.set_snack('d2000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-000000000002', null)$$, 'and the second: three for Y, past the cap, coaches are not capped');
select is(public.snack_claims('d2000000-0000-0000-0000-00000000000b'), 3, 'Y''s family holds three');
select lives_ok($$select public.clear_snack('e2000000-0000-0000-0000-000000000002', null)$$, 'the coach clears one');
select pg_temp.logout();

-- ---------- games and practices ----------
update public.teams set snack_signup = 'both' where id = (select v from ctx where k = 'team');
select pg_temp.login('c2000000-0000-0000-0000-000000000003');
select is(public.snack_cap((select v from ctx where k = 'team')), 2, 'cap = ceil(4 events / 2) = 2');
select lives_ok($$select public.set_snack('d2000000-0000-0000-0000-00000000000a', null, 'e2000000-0000-0000-0000-000000000011')$$, 'X''s family takes the practice');
select pg_temp.logout();

-- ---------- "can't make it" flags the event; going clears it; a new family clears it ----------
select pg_temp.login('c2000000-0000-0000-0000-000000000004');
select public.set_rsvp('d2000000-0000-0000-0000-00000000000b', 'out', 'e2000000-0000-0000-0000-000000000001', null);
select is((select snack_flagged from public.games where id = 'e2000000-0000-0000-0000-000000000001'), true, 'the snack family saying out flags the game');
select public.set_rsvp('d2000000-0000-0000-0000-00000000000b', 'going', 'e2000000-0000-0000-0000-000000000001', null);
select is((select snack_flagged from public.games where id = 'e2000000-0000-0000-0000-000000000001'), false, 'going clears the flag');
select public.set_rsvp('d2000000-0000-0000-0000-00000000000b', 'out', 'e2000000-0000-0000-0000-000000000001', null);
select pg_temp.logout();
select pg_temp.login('c2000000-0000-0000-0000-000000000001');
select public.set_snack('d2000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-000000000001', null);
select is((select snack_flagged from public.games where id = 'e2000000-0000-0000-0000-000000000001'), false, 'handing the slot to another family clears the flag');
select pg_temp.logout();

-- ---------- a stranger ----------
select pg_temp.login('c2000000-0000-0000-0000-000000000007');
select is(public.snack_cap((select v from ctx where k = 'team')), null, 'a stranger gets no cap');
select throws_ok($$select public.set_snack('d2000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-000000000002', null)$$, '42501', null, 'a stranger cannot sign anyone up');
select pg_temp.logout();

select * from finish();
rollback;
