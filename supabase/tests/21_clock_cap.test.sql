-- Runaway clock safety stop (pgTAP, D105): a running period pauses itself 30 minutes past the
-- period length (90 minutes without one), from stored timestamps alone; player time is credited
-- only up to the cap; actions, scores, finishing and the stats all see the capped clock; Resume
-- after the stop runs for up to another 30 minutes; ending the period clears the note.
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
-- "let N seconds pass": move running_since back (postgres only), then back to the coach
create or replace function pg_temp.pass(p_game uuid, p_seconds int)
returns void language plpgsql as $$
begin
  perform pg_temp.logout();
  update public.games set clock_running_since = clock_running_since - make_interval(secs => p_seconds) where id = p_game;
  perform pg_temp.login('f8000000-0000-0000-0000-000000000001');
end $$;
create or replace function pg_temp.secs(p_team uuid, p_player uuid)
returns int language sql as $$ select seconds_played from public.player_season_stats(p_team) where player_id = p_player; $$;
create or replace function pg_temp.state(p_game uuid)
returns text language sql as $$
  select elapsed || '/' || coalesce(running_since::text, 'paused') || '/' || auto_paused || '/' || coalesce(limit_seconds::text, '-')
  from public.game_clock(p_game);
$$;

select pg_temp.mk_user('f8000000-0000-0000-0000-000000000001', 'coach-cap@test.com');
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

update public.profiles set is_platform_admin = true where id = 'f8000000-0000-0000-0000-000000000001';
select pg_temp.login('f8000000-0000-0000-0000-000000000001');
-- a 3v3 clock team with 20-minute halves (cap 50:00) and one with no period length (cap 90:00)
insert into ctx select 'timed', public.create_team('Cap FC', 'soccer', 3, true, 2, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]},
    {"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
insert into ctx select 'open', public.create_team('Free FC', 'soccer', 3, true, 2, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]},
    {"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select pg_temp.logout();
update public.profiles set is_platform_admin = false where id = 'f8000000-0000-0000-0000-000000000001';
select pg_temp.login('f8000000-0000-0000-0000-000000000001');
update public.teams set time_mode = 'clock', clock_periods = 2, period_minutes = 20 where id = (select v from ctx where k = 'timed');
update public.teams set time_mode = 'clock', clock_periods = 2, period_minutes = null where id = (select v from ctx where k = 'open');

insert into public.players (id, team_id, first_name) values
  ('e8000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'timed'), 'Ann'),
  ('e8000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'timed'), 'Bo'),
  ('e8000000-0000-0000-0000-00000000000c', (select v from ctx where k = 'timed'), 'Cy'),
  ('e8000000-0000-0000-0000-00000000000d', (select v from ctx where k = 'timed'), 'Di'),
  ('e8000000-0000-0000-0000-00000000000e', (select v from ctx where k = 'open'), 'Eve'),
  ('e8000000-0000-0000-0000-00000000000f', (select v from ctx where k = 'open'), 'Fay'),
  ('e8000000-0000-0000-0000-000000000010', (select v from ctx where k = 'open'), 'Gus');
update public.lineup_slots s set player_id = case s.slot_index when 0 then 'e8000000-0000-0000-0000-00000000000a' when 1 then 'e8000000-0000-0000-0000-00000000000b' else 'e8000000-0000-0000-0000-00000000000c' end::uuid
  from public.lineups l where l.id = s.lineup_id and l.team_id = (select v from ctx where k = 'timed') and l.game_id is null and l.period_index = 0;
update public.lineup_slots s set player_id = case s.slot_index when 0 then 'e8000000-0000-0000-0000-00000000000e' when 1 then 'e8000000-0000-0000-0000-00000000000f' else 'e8000000-0000-0000-0000-000000000010' end::uuid
  from public.lineups l where l.id = s.lineup_id and l.team_id = (select v from ctx where k = 'open') and l.game_id is null and l.period_index = 0;

insert into public.games (id, team_id, season_id, opponent) values
  ('a8000000-0000-0000-0000-000000000001', (select v from ctx where k = 'timed'), (select id from public.seasons where team_id = (select v from ctx where k = 'timed')), 'Bears'),
  ('a8000000-0000-0000-0000-000000000002', (select v from ctx where k = 'open'), (select id from public.seasons where team_id = (select v from ctx where k = 'open')), 'Owls');

-- ---------- the stretch limit is written on start ----------
-- start_game is kickoff (D109): the clock runs, and the limit is written, from the start of the game
select public.start_game('a8000000-0000-0000-0000-000000000001');
select is((select clock_limit from public.games where id = 'a8000000-0000-0000-0000-000000000001'), 3000, 'start writes the limit: 20 minutes plus 30 (from start_game, D109)');
select public.clock_start('a8000000-0000-0000-0000-000000000001');
select is((select clock_limit from public.games where id = 'a8000000-0000-0000-0000-000000000001'), 3000, 'an explicit clock_start on the running clock keeps it (D109)');
select pg_temp.pass('a8000000-0000-0000-0000-000000000001', 2990);
select is(pg_temp.state('a8000000-0000-0000-0000-000000000001'), '2990/' || (select clock_running_since::text from public.games where id = 'a8000000-0000-0000-0000-000000000001') || '/false/3000', 'ten seconds short of the cap the clock runs on');

-- ---------- past the cap: the read settles the pause ----------
select pg_temp.pass('a8000000-0000-0000-0000-000000000001', 700);
select is(pg_temp.state('a8000000-0000-0000-0000-000000000001'), '3000/paused/true/3000', 'eleven minutes past: elapsed holds at the cap, the clock is paused, the note is on');
select is((select clock_seconds || '/' || coalesce(clock_running_since::text, 'paused') || '/' || clock_auto_paused from public.games where id = 'a8000000-0000-0000-0000-000000000001'), '3000/paused/true', 'the game row banked the cap');
select is(pg_temp.secs((select v from ctx where k = 'timed'), 'e8000000-0000-0000-0000-00000000000a'), 3000, 'Ann is credited up to the cap, not the wall clock');
select is((select seconds from public.season_minutes((select v from ctx where k = 'timed')) where player_id = 'e8000000-0000-0000-0000-00000000000b'), 3000, 'season_minutes agrees');

-- ---------- Resume after the stop: another 30 minutes, then it stops again ----------
select public.clock_start('a8000000-0000-0000-0000-000000000001');
select is((select clock_limit || '/' || clock_auto_paused from public.games where id = 'a8000000-0000-0000-0000-000000000001'), '4800/false', 'a restart at the cap gets 30 more minutes and clears the note');
select pg_temp.pass('a8000000-0000-0000-0000-000000000001', 600);
select is((select elapsed || '/' || auto_paused from public.game_clock('a8000000-0000-0000-0000-000000000001')), '3600/false', 'ten minutes later the clock reads 60:00');
select public.clock_pause('a8000000-0000-0000-0000-000000000001');
select is((select clock_seconds || '/' || clock_auto_paused from public.games where id = 'a8000000-0000-0000-0000-000000000001'), '3600/false', 'a manual pause banks 60:00 and is not the safety stop');
select public.clock_start('a8000000-0000-0000-0000-000000000001');
select is((select clock_limit from public.games where id = 'a8000000-0000-0000-0000-000000000001'), 5400, 'a restart past the cap: 30 minutes from where it restarts');
select pg_temp.pass('a8000000-0000-0000-0000-000000000001', 1900);
select is(pg_temp.state('a8000000-0000-0000-0000-000000000001'), '5400/paused/true/5400', 'and stops itself again at 90:00');
select is(pg_temp.secs((select v from ctx where k = 'timed'), 'e8000000-0000-0000-0000-00000000000a'), 5400, 'Ann: 90 minutes, no more');

-- ---------- ending the period clears the note; actions during a runaway see the cap ----------
select public.clock_end_period('a8000000-0000-0000-0000-000000000001');
select is(pg_temp.state('a8000000-0000-0000-0000-000000000001'), '0/paused/false/5400', 'the second half starts at zero with no note');
select is((select clock_period_lengths[1] from public.games where id = 'a8000000-0000-0000-0000-000000000001'), 5400, 'the first half is recorded as 90:00 long');
select public.clock_start('a8000000-0000-0000-0000-000000000001');
select is((select clock_limit from public.games where id = 'a8000000-0000-0000-0000-000000000001'), 3000, 'the second half gets a fresh cap');
select pg_temp.pass('a8000000-0000-0000-0000-000000000001', 4000);
-- nobody has read the clock since the runaway: the substitution itself settles it
select public.clock_sub('a8000000-0000-0000-0000-000000000001', 'e8000000-0000-0000-0000-00000000000a', 'e8000000-0000-0000-0000-00000000000d');
select is((select clock_end from public.stints where game_id = 'a8000000-0000-0000-0000-000000000001' and player_id = 'e8000000-0000-0000-0000-00000000000a' and period_index = 1), 3000, 'a sub during a runaway closes the stint at the cap, not 66:40');
select is((select clock_start from public.stints where game_id = 'a8000000-0000-0000-0000-000000000001' and player_id = 'e8000000-0000-0000-0000-00000000000d' and clock_end is null), 3000, 'and the new stint opens at the cap');
select is(pg_temp.state('a8000000-0000-0000-0000-000000000001'), '3000/paused/true/3000', 'the action left the clock paused at the cap with the note on');
insert into public.score_events (id, game_id, side, period_index, event_type, scorer_player_id)
values ('b8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', 'us', 1, 'goal', 'e8000000-0000-0000-0000-00000000000d');
select is((select clock_seconds from public.score_events where id = 'b8000000-0000-0000-0000-000000000001'), 3000, 'a goal is stamped at the cap');

-- ---------- finishing during a runaway ends at the cap ----------
select public.clock_start('a8000000-0000-0000-0000-000000000001');
select pg_temp.pass('a8000000-0000-0000-0000-000000000001', 3000);
select public.finish_game('a8000000-0000-0000-0000-000000000001');
select is((select status || '/' || clock_seconds || '/' || clock_period_lengths[2] from public.games where id = 'a8000000-0000-0000-0000-000000000001'), 'done/4800/4800', 'the game ends at 80:00 of the second half, not 100:00');
select is((select clock_end from public.stints where game_id = 'a8000000-0000-0000-0000-000000000001' and player_id = 'e8000000-0000-0000-0000-00000000000d'), 4800, 'Di''s stint closes at the cap');
select is(pg_temp.secs((select v from ctx where k = 'timed'), 'e8000000-0000-0000-0000-00000000000d'), 1800, 'Di: 50:00 to 80:00 of the second half');
select is(pg_temp.secs((select v from ctx where k = 'timed'), 'e8000000-0000-0000-0000-00000000000a'), 8400, 'Ann: 90 minutes in the first half, 50 in the second');
select is(pg_temp.secs((select v from ctx where k = 'timed'), 'e8000000-0000-0000-0000-00000000000b'), 10200, 'Bo: both halves to the cap');

-- ---------- no period length: 90 minutes ----------
select public.start_game('a8000000-0000-0000-0000-000000000002');
select public.clock_start('a8000000-0000-0000-0000-000000000002');
select is((select clock_limit from public.games where id = 'a8000000-0000-0000-0000-000000000002'), 5400, 'without a period length the cap is 90 minutes');
select pg_temp.pass('a8000000-0000-0000-0000-000000000002', 5399);
select is((select elapsed || '/' || auto_paused from public.game_clock('a8000000-0000-0000-0000-000000000002')), '5399/false', 'a second short of 90 minutes it runs');
select pg_temp.pass('a8000000-0000-0000-0000-000000000002', 7200);
select is(pg_temp.state('a8000000-0000-0000-0000-000000000002'), '5400/paused/true/5400', 'two hours later it stopped at 90:00');
select is(pg_temp.secs((select v from ctx where k = 'open'), 'e8000000-0000-0000-0000-00000000000e'), 5400, 'Eve: 90 minutes');
-- the two-argument reading stays raw, for the settle itself
select ok((select public.clock_elapsed(0, now() - interval '2 hours') between 7199 and 7201), 'the raw elapsed is untouched');
select is((select public.clock_elapsed(0, now() - interval '2 hours', 5400)), 5400, 'the limited elapsed stops at the limit');
select is((select public.clock_elapsed(3600, now() - interval '10 minutes', 5400)), 4200, 'a stretch under the limit is unchanged');

select * from finish();
rollback;
