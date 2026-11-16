-- Basketball stats (pgTAP, D118): stat entries are basketball-only and tied to a team player;
-- the coach chooses the tracked stats; a stat keeper logs scores and stats while the game is
-- live and nothing else, and only once they have taken the stats over (D120: one active keeper); parents read them through game_stats with the usual withholding; the
-- season stats carry rebounds, assists, steals and fouls.
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

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

select pg_temp.mk_user('d5000000-0000-0000-0000-000000000001', 'coach-bs@test.com');
select pg_temp.mk_user('d5000000-0000-0000-0000-000000000002', 'assistant-bs@test.com');
select pg_temp.mk_user('d5000000-0000-0000-0000-000000000003', 'parent-bs@test.com');      -- Ann's parent
select pg_temp.mk_user('d5000000-0000-0000-0000-000000000004', 'keeper-bs@test.com');      -- a parent made stat keeper
select pg_temp.mk_user('d5000000-0000-0000-0000-000000000006', 'admin-bs@test.com');
update public.profiles set is_platform_admin = true where id = 'd5000000-0000-0000-0000-000000000006';
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

select pg_temp.login('d5000000-0000-0000-0000-000000000006');
insert into ctx select 'team', public.create_team('Hoops', 'basketball', 3, false, 2, '{}'::jsonb,
  '[{"formation_name":"1-2","slots":[{"position_role":"PG","position_code":"PG"},{"position_role":"F","position_code":"F"},{"position_role":"F","position_code":"F"}]},
    {"formation_name":"1-2","slots":[{"position_role":"PG","position_code":"PG"},{"position_role":"F","position_code":"F"},{"position_role":"F","position_code":"F"}]}]'::jsonb);
insert into ctx select 'soccer', public.create_team('Kickers', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select public.admin_add_member((select v from ctx where k = 'team'), 'coach-bs@test.com', 'coach');
select public.admin_add_member((select v from ctx where k = 'team'), 'assistant-bs@test.com', 'assistant');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-bs@test.com', 'parent');
select public.admin_add_member((select v from ctx where k = 'team'), 'keeper-bs@test.com', 'parent');
select public.admin_add_member((select v from ctx where k = 'soccer'), 'coach-bs@test.com', 'coach');
select pg_temp.logout();
insert into public.players (id, team_id, first_name) values
  ('e5000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'team'), 'Ann'),
  ('e5000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'team'), 'Bo'),
  ('e5000000-0000-0000-0000-00000000000c', (select v from ctx where k = 'team'), 'Cy'),
  ('e5000000-0000-0000-0000-00000000000f', (select v from ctx where k = 'soccer'), 'Sam');
insert into public.player_guardians (player_id, user_id, status) values
  ('e5000000-0000-0000-0000-00000000000a', 'd5000000-0000-0000-0000-000000000003', 'approved');
update public.lineup_slots s set player_id = case s.slot_index when 0 then 'e5000000-0000-0000-0000-00000000000a' when 1 then 'e5000000-0000-0000-0000-00000000000b' else 'e5000000-0000-0000-0000-00000000000c' end::uuid
  from public.lineups l where l.id = s.lineup_id and l.team_id = (select v from ctx where k = 'team') and l.game_id is null and l.period_index = 0;
insert into public.games (id, team_id, season_id, opponent) values
  ('a5000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), (select id from public.seasons where team_id = (select v from ctx where k = 'team')), 'Hawks'),
  ('a5000000-0000-0000-0000-000000000002', (select v from ctx where k = 'soccer'), (select id from public.seasons where team_id = (select v from ctx where k = 'soccer')), 'Owls');

select is((select tracked_stats from public.teams where id = (select v from ctx where k = 'team')), '{}'::public.stat_type[], 'a team tracks no stats by default');

-- ---------- the coach logs during a live game ----------
select pg_temp.login('d5000000-0000-0000-0000-000000000001');
update public.teams set tracked_stats = '{rebound,assist}' where id = (select v from ctx where k = 'team');
select is((select tracked_stats from public.teams where id = (select v from ctx where k = 'team')), '{rebound,assist}'::public.stat_type[], 'the coach chooses the tracked stats');
select public.start_game('a5000000-0000-0000-0000-000000000001');
select is((select keeper_user_id from public.games where id = 'a5000000-0000-0000-0000-000000000001'), 'd5000000-0000-0000-0000-000000000001'::uuid, 'the coach who starts the game keeps its stats');
select lives_ok($$insert into public.stat_events (game_id, player_id, stat_type) values ('a5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-00000000000a', 'rebound')$$, 'the coach logs a rebound');
select is((select period_index || '/' || clock_seconds || '/' || created_by from public.stat_events where player_id = 'e5000000-0000-0000-0000-00000000000a'), '0/0/d5000000-0000-0000-0000-000000000001', 'stamped with the period, the clock second and who logged it');
select lives_ok($$insert into public.stat_events (game_id, player_id, stat_type) values ('a5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-00000000000b', 'assist')$$, 'and an assist for Bo');
select public.start_game('a5000000-0000-0000-0000-000000000002');
select throws_ok($$insert into public.stat_events (game_id, player_id, stat_type) values ('a5000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-00000000000f', 'rebound')$$, '23514', null, 'a soccer game takes no stat entries');
select throws_ok($$insert into public.stat_events (game_id, player_id, stat_type) values ('a5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-00000000000f', 'rebound')$$, '23503', null, 'a player of another team is refused');
select pg_temp.logout();

-- ---------- an assistant reads but cannot name a keeper ----------
select pg_temp.login('d5000000-0000-0000-0000-000000000002');
select throws_ok($$select public.set_stat_keeper((select id from public.team_members where user_id = 'd5000000-0000-0000-0000-000000000004'), true)$$, '42501', null, 'an assistant cannot name a stat keeper');
select is((select count(*)::int from public.stat_events where game_id = 'a5000000-0000-0000-0000-000000000001'), 2, 'the assistant reads the entries');
select pg_temp.logout();

-- ---------- a parent who is not a stat keeper ----------
select pg_temp.login('d5000000-0000-0000-0000-000000000004');
select throws_ok($$insert into public.stat_events (game_id, player_id, stat_type) values ('a5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-00000000000c', 'rebound')$$, '42501', null, 'a plain parent cannot log');
select is((select count(*)::int from public.stat_events where game_id = 'a5000000-0000-0000-0000-000000000001'), 0, 'and reads nothing on an own-only team');
select throws_ok($$select public.keep_stats('a5000000-0000-0000-0000-000000000001')$$, '42501', null, 'nor take the stats over');
select pg_temp.logout();

-- ---------- the coach names a stat keeper ----------
select pg_temp.login('d5000000-0000-0000-0000-000000000001');
select lives_ok($$select public.set_stat_keeper((select id from public.team_members where user_id = 'd5000000-0000-0000-0000-000000000004'), true)$$, 'the coach names a stat keeper');
select is((select is_stat_keeper from public.list_team_members((select v from ctx where k = 'team')) where user_id = 'd5000000-0000-0000-0000-000000000004'), true, 'the members list carries the flag');
select pg_temp.logout();

-- ---------- the stat keeper takes over, then logs scores and stats while the game is live, and nothing else ----------
select pg_temp.login('d5000000-0000-0000-0000-000000000004');
select throws_ok($$insert into public.stat_events (game_id, player_id, stat_type) values ('a5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-00000000000c', 'steal')$$, '42501', null, 'a named keeper logs nothing until they take the stats over');
select lives_ok($$select public.keep_stats('a5000000-0000-0000-0000-000000000001')$$, 'the keeper taps Keep stats');
select is((select keeper_name from public.games where id = 'a5000000-0000-0000-0000-000000000001'), 'keeper-bs', 'the game bar names who keeps the stats');
select lives_ok($$insert into public.stat_events (game_id, player_id, stat_type) values ('a5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-00000000000c', 'steal')$$, 'the keeper logs a steal');
select lives_ok($$insert into public.score_events (game_id, side, period_index, event_type, scorer_player_id) values ('a5000000-0000-0000-0000-000000000001', 'us', 0, 'field_goal', 'e5000000-0000-0000-0000-00000000000c')$$, 'the keeper logs a field goal');
select is((select count(*)::int from public.game_stats('a5000000-0000-0000-0000-000000000001') where not hidden), 3, 'the keeper reads the live game''s entries with the players named');
select lives_ok($$delete from public.stat_events where player_id = 'e5000000-0000-0000-0000-00000000000c'$$, 'the keeper takes back their own entry');
select is((select count(*)::int from public.stat_events where game_id = 'a5000000-0000-0000-0000-000000000001'), 2, 'two entries left');
update public.teams set tracked_stats = '{foul}' where id = (select v from ctx where k = 'team');
select is((select tracked_stats from public.teams where id = (select v from ctx where k = 'team')), '{rebound,assist}'::public.stat_type[], 'the keeper cannot change the team settings');
select throws_ok($$insert into public.player_position_prefs (player_id, group_key, level) values ('e5000000-0000-0000-0000-00000000000a', 'C', 'never')$$, '42501', null, 'nor anything else of the staff''s');
select pg_temp.logout();

-- ---------- one keeper at a time: the coach's buttons are gone until they take it back ----------
select pg_temp.login('d5000000-0000-0000-0000-000000000001');
select throws_ok($$insert into public.stat_events (game_id, player_id, stat_type) values ('a5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-00000000000a', 'foul')$$, '42501', null, 'the coach cannot log while the keeper is active');
select lives_ok($$select public.keep_stats('a5000000-0000-0000-0000-000000000001')$$, 'the coach takes the stats back with one tap');
select pg_temp.logout();
select pg_temp.login('d5000000-0000-0000-0000-000000000004');
select throws_ok($$insert into public.stat_events (game_id, player_id, stat_type) values ('a5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-00000000000c', 'steal')$$, '42501', null, 'and the keeper is read-only again');
select pg_temp.logout();

-- ---------- after the game the keeper is a plain parent again ----------
select pg_temp.login('d5000000-0000-0000-0000-000000000001');
select public.finish_game('a5000000-0000-0000-0000-000000000001');
select pg_temp.logout();
select pg_temp.login('d5000000-0000-0000-0000-000000000004');
select throws_ok($$insert into public.stat_events (game_id, player_id, stat_type) values ('a5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-00000000000c', 'rebound')$$, '42501', null, 'no logging once the game is over');
select throws_ok($$insert into public.score_events (game_id, side, period_index, event_type) values ('a5000000-0000-0000-0000-000000000001', 'them', 0, 'field_goal')$$, '42501', null, 'no scores either');
select is((select count(*)::int from public.game_stats('a5000000-0000-0000-0000-000000000001') where hidden), 2, 'and the finished game''s entries are withheld like any parent''s');
select pg_temp.logout();

-- ---------- a parent reads their own child, the rest withheld; a 'team' team shows everyone ----------
select pg_temp.login('d5000000-0000-0000-0000-000000000003');
select is((select string_agg(coalesce(player_id::text, 'hidden'), ',' order by occurred_at) from public.game_stats('a5000000-0000-0000-0000-000000000001')), 'e5000000-0000-0000-0000-00000000000a,hidden', 'Ann''s parent sees Ann''s rebound; Bo''s assist is withheld');
select is((select rebounds || '/' || assists from public.player_season_stats((select v from ctx where k = 'team')) where player_id = 'e5000000-0000-0000-0000-00000000000a'), '1/0', 'the season stats carry Ann''s rebound');
select is((select count(*)::int from public.player_season_stats((select v from ctx where k = 'team')) where player_id = 'e5000000-0000-0000-0000-00000000000b'), 0, 'and no row for Bo on an own-only team');
select pg_temp.logout();
update public.teams set parent_stats = 'team' where id = (select v from ctx where k = 'team');
select pg_temp.login('d5000000-0000-0000-0000-000000000003');
select is((select assists from public.player_season_stats((select v from ctx where k = 'team')) where player_id = 'e5000000-0000-0000-0000-00000000000b'), 1, 'on a team-wide team Bo''s assist shows');
select pg_temp.logout();

-- ---------- the coach edits and removes after the fact ----------
select pg_temp.login('d5000000-0000-0000-0000-000000000001');
select lives_ok($$update public.stat_events set stat_type = 'foul', period_index = 1 where player_id = 'e5000000-0000-0000-0000-00000000000b'$$, 'the coach edits an entry after the game');
select is((select fouls || '/' || assists from public.player_season_stats((select v from ctx where k = 'team')) where player_id = 'e5000000-0000-0000-0000-00000000000b'), '1/0', 'the stats follow the edit');
select lives_ok($$delete from public.stat_events where player_id = 'e5000000-0000-0000-0000-00000000000b'$$, 'and removes it');
select is((select count(*)::int from public.stat_events where game_id = 'a5000000-0000-0000-0000-000000000001'), 1, 'one entry left');
select pg_temp.logout();

select * from finish();
rollback;
