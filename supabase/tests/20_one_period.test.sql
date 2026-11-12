-- One period (pgTAP, D97): a full one-period clock game with a pause, and a one-period team in
-- period mode. Nothing in the database assumes at least two periods.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

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
create or replace function pg_temp.pass(p_game uuid, p_seconds int)
returns void language plpgsql as $$
begin
  perform pg_temp.logout();
  update public.games set clock_running_since = clock_running_since - make_interval(secs => p_seconds) where id = p_game;
  perform pg_temp.login('fe000000-0000-0000-0000-000000000001');
end $$;

select pg_temp.mk_user('fe000000-0000-0000-0000-000000000001', 'coach-one@test.com');
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;
update public.profiles set is_platform_admin = true where id = 'fe000000-0000-0000-0000-000000000001';
select pg_temp.login('fe000000-0000-0000-0000-000000000001');
-- a 3v3 team on the clock with ONE period of 40 minutes, and a period-mode team with ONE period
insert into ctx select 'clock', public.create_team('One FC', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
insert into ctx select 'periods', public.create_team('Single FC', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select pg_temp.logout();
update public.profiles set is_platform_admin = false where id = 'fe000000-0000-0000-0000-000000000001';
select pg_temp.login('fe000000-0000-0000-0000-000000000001');
select lives_ok($$update public.teams set clock_periods = 1, period_minutes = 40 where id = (select v from ctx where k = 'clock')$$, 'a clock team may have one period');
select lives_ok($$update public.teams set time_mode = 'periods', periods_count = 1 where id = (select v from ctx where k = 'periods')$$, 'a period-mode team may have one period');
select is(public.team_period_count((select v from ctx where k = 'clock')), 1, 'the clock team has one period');
select is(public.team_period_count((select v from ctx where k = 'periods')), 1, 'so does the period-mode team');

insert into public.players (id, team_id, first_name) values
  ('ee000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'clock'), 'Ann'),
  ('ee000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'clock'), 'Bo'),
  ('ee000000-0000-0000-0000-00000000000c', (select v from ctx where k = 'clock'), 'Cy'),
  ('ee000000-0000-0000-0000-00000000000d', (select v from ctx where k = 'clock'), 'Di'),
  ('ee000000-0000-0000-0000-00000000000e', (select v from ctx where k = 'periods'), 'Pat'),
  ('ee000000-0000-0000-0000-00000000000f', (select v from ctx where k = 'periods'), 'Quinn');
update public.lineup_slots s set player_id = case s.slot_index when 0 then 'ee000000-0000-0000-0000-00000000000a' when 1 then 'ee000000-0000-0000-0000-00000000000b' else 'ee000000-0000-0000-0000-00000000000c' end::uuid
  from public.lineups l where l.id = s.lineup_id and l.team_id = (select v from ctx where k = 'clock') and l.game_id is null;
insert into public.games (id, team_id, season_id, opponent) values
  ('ae000000-0000-0000-0000-000000000001', (select v from ctx where k = 'clock'), (select id from public.seasons where team_id = (select v from ctx where k = 'clock')), 'Bears');

-- ---------- a full one-period clock game with a pause ----------
select public.start_game('ae000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.lineups where game_id = 'ae000000-0000-0000-0000-000000000001'), 1, 'a one-period clock game has one lineup row');
select is((select count(*)::int from public.stints where game_id = 'ae000000-0000-0000-0000-000000000001' and clock_end is null), 3, 'three starters on the clock');
select public.clock_start('ae000000-0000-0000-0000-000000000001');
select pg_temp.pass('ae000000-0000-0000-0000-000000000001', 600);
select is((select elapsed from public.game_clock('ae000000-0000-0000-0000-000000000001')), 600, 'ten minutes in');
select is(40 * 60 - (select elapsed from public.game_clock('ae000000-0000-0000-0000-000000000001')), 1800, 'thirty of the forty-minute game left: the period length is the game length');
select public.clock_pause('ae000000-0000-0000-0000-000000000001');
select is((select clock_seconds from public.games where id = 'ae000000-0000-0000-0000-000000000001'), 600, 'a pause banks the seconds');
-- a goal while paused is stamped with period 0 and the clock second
insert into public.score_events (game_id, side, period_index, event_type, points, scorer_player_id)
  values ('ae000000-0000-0000-0000-000000000001', 'us', 0, 'goal', 1, 'ee000000-0000-0000-0000-00000000000a');
select is((select period_index || '/' || clock_seconds from public.score_events where game_id = 'ae000000-0000-0000-0000-000000000001'), '0/600', 'the goal is stamped at 10:00 of the only period');
select public.clock_start('ae000000-0000-0000-0000-000000000001');
select pg_temp.pass('ae000000-0000-0000-0000-000000000001', 300);
select public.clock_sub('ae000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-00000000000c', 'ee000000-0000-0000-0000-00000000000d');
select is((select clock_end from public.stints where game_id = 'ae000000-0000-0000-0000-000000000001' and player_id = 'ee000000-0000-0000-0000-00000000000c'), 900, 'Cy comes off at 15:00 after the pause');
select pg_temp.pass('ae000000-0000-0000-0000-000000000001', 1500);
select is((select elapsed from public.game_clock('ae000000-0000-0000-0000-000000000001')), 2400, 'forty minutes played');
select is((select clock_running_since is not null from public.games where id = 'ae000000-0000-0000-0000-000000000001'), true, 'nothing left, and the clock does not stop by itself');
select pg_temp.logout();
select pg_temp.login('fe000000-0000-0000-0000-000000000001');
-- the only period: ending it would be full time, but the app offers Finish game instead
select lives_ok($$select public.finish_game('ae000000-0000-0000-0000-000000000001')$$, 'the coach finishes the game from the game page');
select is((select status::text || '/' || clock_seconds::text from public.games where id = 'ae000000-0000-0000-0000-000000000001'), 'done/2400', 'finished at 40:00');
select is((select count(*)::int from public.stints where game_id = 'ae000000-0000-0000-0000-000000000001' and clock_end is null), 0, 'every stint is closed');
select is((select clock_period_lengths from public.games where id = 'ae000000-0000-0000-0000-000000000001'), '{2400}', 'one period length');
select is((select seconds_played || '/' || goals from public.player_season_stats((select v from ctx where k = 'clock')) where name = 'Ann'), '2400/1', 'Ann: the whole game and the goal');
select is((select seconds_played from public.player_season_stats((select v from ctx where k = 'clock')) where name = 'Di'), 1500, 'Di: the last 25 minutes');
select is((select seconds_played from public.player_season_stats((select v from ctx where k = 'clock')) where name = 'Cy'), 900, 'Cy: the first 15');

-- ---------- a one-period team in period mode ----------
update public.lineup_slots s set player_id = case s.slot_index when 0 then 'ee000000-0000-0000-0000-00000000000e' when 1 then 'ee000000-0000-0000-0000-00000000000f' else null end::uuid
  from public.lineups l where l.id = s.lineup_id and l.team_id = (select v from ctx where k = 'periods') and l.game_id is null;
insert into public.games (id, team_id, season_id, opponent) values
  ('ae000000-0000-0000-0000-000000000002', (select v from ctx where k = 'periods'), (select id from public.seasons where team_id = (select v from ctx where k = 'periods')), 'Owls');
select public.start_game('ae000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.lineups where game_id = 'ae000000-0000-0000-0000-000000000002'), 1, 'a one-period game copies the single lineup');
select is((select count(*)::int from public.stints where game_id = 'ae000000-0000-0000-0000-000000000002'), 0, 'and opens no stints in period mode');
select public.finish_game('ae000000-0000-0000-0000-000000000002');
select is((select periods_played || '/' || games_played from public.player_season_stats((select v from ctx where k = 'periods')) where name = 'Pat'), '1/1', 'Pat played the one period of one game');
select is((select periods_played from public.player_season_stats((select v from ctx where k = 'periods')) where name = 'Quinn'), 1, 'so did Quinn');
select pg_temp.logout();

select * from finish();
rollback;
