-- Game clock and stints (pgTAP, D66–D69): clock maths across pause/resume and period changes,
-- substitution / swap / empty / fill and undo, minutes derived from stints, the score stamp, the
-- starters-as-template rule, corrections after the game, parent read-only, period-mode teams untouched.
begin;
create extension if not exists pgtap with schema extensions;
select plan(72);

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
-- the clock is server timestamps: "let N seconds pass" is moving running_since back (postgres only)
create or replace function pg_temp.pass(p_game uuid, p_seconds int)
returns void language plpgsql as $$
begin
  perform pg_temp.logout();
  update public.games set clock_running_since = clock_running_since - make_interval(secs => p_seconds) where id = p_game;
  perform pg_temp.login('f9000000-0000-0000-0000-000000000001');
end $$;
create or replace function pg_temp.open_count(p_game uuid)
returns int language sql as $$ select count(*)::int from public.stints where game_id = p_game and clock_end is null; $$;
create or replace function pg_temp.on_slot(p_game uuid, p_period int, p_slot int)
returns uuid language sql as $$ select player_id from public.stints where game_id = p_game and period_index = p_period and slot_index = p_slot and clock_end is null; $$;
create or replace function pg_temp.secs(p_team uuid, p_player uuid)
returns int language sql as $$ select seconds_played from public.player_season_stats(p_team) where player_id = p_player; $$;

select pg_temp.mk_user('f9000000-0000-0000-0000-000000000001', 'coach-ck@test.com');
select pg_temp.mk_user('f9000000-0000-0000-0000-000000000002', 'parent-ck@test.com');
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

update public.profiles set is_platform_admin = true where id = 'f9000000-0000-0000-0000-000000000001';
select pg_temp.login('f9000000-0000-0000-0000-000000000001');
-- a 3v3 clock team (template has period-mode's four lineups; clock mode uses the first)
insert into ctx select 'team', public.create_team('Tick FC', 'soccer', 3, true, 4, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]},
    {"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]},
    {"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]},
    {"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
-- and a period-mode control team
insert into ctx select 'ptemplate', public.create_team('Tock FC', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-ck@test.com', 'parent');
select pg_temp.logout();
update public.profiles set is_platform_admin = false where id = 'f9000000-0000-0000-0000-000000000001';
update public.teams set time_mode = 'periods' where id = (select v from ctx where k = 'ptemplate');  -- new teams start on the clock (D87)
select pg_temp.login('f9000000-0000-0000-0000-000000000001');
update public.teams set time_mode = 'clock', clock_periods = 2, period_minutes = 20 where id = (select v from ctx where k = 'team');

insert into public.players (id, team_id, first_name) values
  ('e9000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'team'), 'Ann'),
  ('e9000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'team'), 'Bo'),
  ('e9000000-0000-0000-0000-00000000000c', (select v from ctx where k = 'team'), 'Cy'),
  ('e9000000-0000-0000-0000-00000000000d', (select v from ctx where k = 'team'), 'Di'),
  ('e9000000-0000-0000-0000-00000000000e', (select v from ctx where k = 'team'), 'Ed'),
  ('e9000000-0000-0000-0000-00000000000f', (select v from ctx where k = 'ptemplate'), 'Pat');
-- starters in the template's first period: Ann ST, Bo SW, Cy GK
update public.lineup_slots s set player_id = case s.slot_index when 0 then 'e9000000-0000-0000-0000-00000000000a' when 1 then 'e9000000-0000-0000-0000-00000000000b' else 'e9000000-0000-0000-0000-00000000000c' end::uuid
  from public.lineups l where l.id = s.lineup_id and l.team_id = (select v from ctx where k = 'team') and l.game_id is null and l.period_index = 0;

insert into public.games (id, team_id, season_id, opponent) values
  ('a9000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), (select id from public.seasons where team_id = (select v from ctx where k = 'team')), 'Bears'),
  ('a9000000-0000-0000-0000-000000000002', (select v from ctx where k = 'ptemplate'), (select id from public.seasons where team_id = (select v from ctx where k = 'ptemplate')), 'Owls');

-- ---------- start: starters get stints at 0 ----------
select throws_ok($$select public.clock_start('a9000000-0000-0000-0000-000000000001')$$, '22023', null, 'the clock only runs during a live game');
select public.start_game('a9000000-0000-0000-0000-000000000001');
select is(pg_temp.open_count('a9000000-0000-0000-0000-000000000001'), 3, 'starting the game opens a stint per starter');
select is((select count(*)::int from public.lineups where game_id = 'a9000000-0000-0000-0000-000000000001'), 2, 'a clock game has one lineup row per clock period (two halves)');
select is((select clock_start from public.stints where game_id = 'a9000000-0000-0000-0000-000000000001' and player_id = 'e9000000-0000-0000-0000-00000000000a'), 0, 'starters start at zero');
select is((select elapsed from public.game_clock('a9000000-0000-0000-0000-000000000001')), 0, 'the clock reads zero before kickoff');

-- ---------- pre-kickoff change: a sub at zero leaves no zero-length stint ----------
select public.clock_sub('a9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-00000000000c', 'e9000000-0000-0000-0000-00000000000d');
select is(pg_temp.on_slot('a9000000-0000-0000-0000-000000000001', 0, 2), 'e9000000-0000-0000-0000-00000000000d', 'Di starts in goal instead of Cy');
select is((select count(*)::int from public.stints where game_id = 'a9000000-0000-0000-0000-000000000001'), 3, 'Cy''s zero-length stint was removed, not closed');
select is((select public.clock_undo('a9000000-0000-0000-0000-000000000001')), 'sub', 'undo reverses the sub');
select is(pg_temp.on_slot('a9000000-0000-0000-0000-000000000001', 0, 2), 'e9000000-0000-0000-0000-00000000000c', 'Cy is back in goal');
select is((select player_id from public.lineup_slots s join public.lineups l on l.id = s.lineup_id where l.game_id = 'a9000000-0000-0000-0000-000000000001' and l.period_index = 0 and s.slot_index = 2), 'e9000000-0000-0000-0000-00000000000c', 'the lineup row mirrors the open stints');
select throws_ok($$select public.clock_undo('a9000000-0000-0000-0000-000000000001')$$, 'P0015', null, 'an op is undone once');

-- ---------- clock maths across pause and resume ----------
select public.clock_start('a9000000-0000-0000-0000-000000000001');
select pg_temp.pass('a9000000-0000-0000-0000-000000000001', 90);
select is((select elapsed from public.game_clock('a9000000-0000-0000-0000-000000000001')), 90, 'running: elapsed = seconds since running_since');
select public.clock_pause('a9000000-0000-0000-0000-000000000001');
select is((select clock_seconds || '/' || coalesce(clock_running_since::text, 'paused') from public.games where id = 'a9000000-0000-0000-0000-000000000001'), '90/paused', 'pause banks the seconds and stops');
select is((select elapsed from public.game_clock('a9000000-0000-0000-0000-000000000001')), 90, 'paused: elapsed holds');
select public.clock_pause('a9000000-0000-0000-0000-000000000001');
select is((select elapsed from public.game_clock('a9000000-0000-0000-0000-000000000001')), 90, 'pausing twice changes nothing');
select public.clock_start('a9000000-0000-0000-0000-000000000001');
select public.clock_start('a9000000-0000-0000-0000-000000000001');
select pg_temp.pass('a9000000-0000-0000-0000-000000000001', 30);
select is((select elapsed from public.game_clock('a9000000-0000-0000-0000-000000000001')), 120, 'resume: banked seconds plus the new run');

-- ---------- substitutions on the running clock ----------
select public.clock_sub('a9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-00000000000d');
select is((select clock_end from public.stints where game_id = 'a9000000-0000-0000-0000-000000000001' and player_id = 'e9000000-0000-0000-0000-00000000000a' and period_index = 0), 120, 'Ann''s stint closes at 2:00');
select is((select clock_start || '/' || position_code from public.stints where game_id = 'a9000000-0000-0000-0000-000000000001' and player_id = 'e9000000-0000-0000-0000-00000000000d' and clock_end is null), '120/ST', 'Di''s stint opens at 2:00 in Ann''s spot');
select throws_ok($$select public.clock_sub('a9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-00000000000e')$$, 'P0008', null, 'a player on the bench cannot come off');
select throws_ok($$select public.clock_sub('a9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-00000000000b', 'e9000000-0000-0000-0000-00000000000c')$$, 'P0010', null, 'a player on the field cannot come on');
update public.players set is_available = false where id = 'e9000000-0000-0000-0000-00000000000e';
select throws_ok($$select public.clock_sub('a9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-00000000000b', 'e9000000-0000-0000-0000-00000000000e')$$, 'P0009', null, 'a player marked out cannot come on');
update public.players set is_available = true where id = 'e9000000-0000-0000-0000-00000000000e';

-- swap two on the field, then undo it
select public.clock_swap('a9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-00000000000b', 'e9000000-0000-0000-0000-00000000000c');
select is(pg_temp.on_slot('a9000000-0000-0000-0000-000000000001', 0, 2), 'e9000000-0000-0000-0000-00000000000b', 'swap: Bo moves into goal');
select is(pg_temp.on_slot('a9000000-0000-0000-0000-000000000001', 0, 1), 'e9000000-0000-0000-0000-00000000000c', 'swap: Cy takes the sweeper spot');
select is((select count(*)::int from public.stints where game_id = 'a9000000-0000-0000-0000-000000000001' and clock_end = 120), 3, 'three stints ended at 2:00 (Ann, Bo, Cy)');
select is((select public.clock_undo('a9000000-0000-0000-0000-000000000001')), 'swap', 'undo reverses the swap');
select is(pg_temp.on_slot('a9000000-0000-0000-0000-000000000001', 0, 2), 'e9000000-0000-0000-0000-00000000000c', 'Cy is back in goal with the original open stint');
select is((select clock_end from public.stints where game_id = 'a9000000-0000-0000-0000-000000000001' and player_id = 'e9000000-0000-0000-0000-00000000000b' and clock_start = 0), null, 'Bo''s first stint is open again');

-- empty a spot, fill it from the bench
select pg_temp.pass('a9000000-0000-0000-0000-000000000001', 60);
select public.clock_empty('a9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-00000000000d');
select is(pg_temp.on_slot('a9000000-0000-0000-0000-000000000001', 0, 0), null, 'the striker spot is empty');
select is((select clock_start || '-' || clock_end from public.stints where game_id = 'a9000000-0000-0000-0000-000000000001' and player_id = 'e9000000-0000-0000-0000-00000000000d' and period_index = 0), '120-180', 'Di played a minute');
select throws_ok($$select public.clock_fill('a9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-00000000000e', 2)$$, 'P0013', null, 'a taken spot cannot be filled');
select public.clock_fill('a9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-00000000000e', 0);
select is(pg_temp.on_slot('a9000000-0000-0000-0000-000000000001', 0, 0), 'e9000000-0000-0000-0000-00000000000e', 'Ed fills the striker spot');
select throws_ok($$select public.clock_set_lineup('a9000000-0000-0000-0000-000000000001', '1-1', '[]'::jsonb)$$, 'P0014', null, 'the lineup cannot be rewritten once the clock has run');

-- ---------- end of the first half: everyone closes at 3:00 and carries over ----------
select public.clock_end_period('a9000000-0000-0000-0000-000000000001');
select is((select clock_period || '/' || clock_seconds || '/' || clock_period_lengths[1] from public.games where id = 'a9000000-0000-0000-0000-000000000001'), '1/0/180', 'second half, clock at zero, first half was 3:00 long');
select is((select count(*)::int from public.stints where game_id = 'a9000000-0000-0000-0000-000000000001' and period_index = 0 and clock_end is null), 0, 'no first-half stint stays open');
select is(pg_temp.open_count('a9000000-0000-0000-0000-000000000001'), 3, 'the players who ended the half start the next (Ed came on at the final second and carries over too)');
select is(pg_temp.on_slot('a9000000-0000-0000-0000-000000000001', 1, 2), 'e9000000-0000-0000-0000-00000000000c', 'Cy is still in goal for the second half');
select throws_ok($$select public.clock_undo('a9000000-0000-0000-0000-000000000001')$$, 'P0015', null, 'ending a half is not undone');

-- halftime: rewrite the lineup at zero (suggested starters)
select public.clock_set_lineup('a9000000-0000-0000-0000-000000000001', '1-1',
  '[{"position_role":"ST","position_code":"ST","player_id":"e9000000-0000-0000-0000-00000000000a"},
    {"position_role":"DEF","position_code":"SW","player_id":"e9000000-0000-0000-0000-00000000000d"},
    {"position_role":"GK","position_code":"GK","player_id":"e9000000-0000-0000-0000-00000000000c"}]'::jsonb);
select is(pg_temp.on_slot('a9000000-0000-0000-0000-000000000001', 1, 0) || '/' || pg_temp.on_slot('a9000000-0000-0000-0000-000000000001', 1, 1), 'e9000000-0000-0000-0000-00000000000a/e9000000-0000-0000-0000-00000000000d', 'second-half starters rewritten at zero');
select is((select count(*)::int from public.stints where game_id = 'a9000000-0000-0000-0000-000000000001' and period_index = 1), 3, 'the carried-over zero-length stints were replaced, not kept');

-- ---------- minutes derived from stints, open stints count up to the clock ----------
select is(pg_temp.secs((select v from ctx where k = 'team'), 'e9000000-0000-0000-0000-00000000000a'), 120, 'Ann: 2:00 in the first half, second half not started');
select public.clock_start('a9000000-0000-0000-0000-000000000001');
select pg_temp.pass('a9000000-0000-0000-0000-000000000001', 600);
select is(pg_temp.secs((select v from ctx where k = 'team'), 'e9000000-0000-0000-0000-00000000000a'), 720, 'Ann: plus ten minutes of the running second half');
select is(pg_temp.secs((select v from ctx where k = 'team'), 'e9000000-0000-0000-0000-00000000000b'), 180, 'Bo: the whole first half, benched since');
select is(pg_temp.secs((select v from ctx where k = 'team'), 'e9000000-0000-0000-0000-00000000000d'), 660, 'Di: a minute in the first half and the running second');
select is(pg_temp.secs((select v from ctx where k = 'team'), 'e9000000-0000-0000-0000-00000000000e'), 0, 'Ed: filled a spot as the half ended, no time');
select is((select seconds from public.season_minutes((select v from ctx where k = 'team')) where player_id = 'e9000000-0000-0000-0000-00000000000c'), 780, 'season_minutes agrees (Cy: both halves)');
select is((select by_group ->> 'GK' from public.season_minutes((select v from ctx where k = 'team')) where player_id = 'e9000000-0000-0000-0000-00000000000c'), '780', 'and breaks it down by position group');

-- ---------- a score is stamped with the period and clock second ----------
insert into public.score_events (id, game_id, side, period_index, event_type, scorer_player_id)
values ('b9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001', 'us', 0, 'goal', 'e9000000-0000-0000-0000-00000000000a');
select is((select period_index || '/' || clock_seconds from public.score_events where id = 'b9000000-0000-0000-0000-000000000001'), '1/600', 'a goal in a live clock game carries H2 10:00 whatever period the client sent');
select is((select clock_seconds from public.game_events('a9000000-0000-0000-0000-000000000001') where id = 'b9000000-0000-0000-0000-000000000001'), 600, 'game_events returns the clock second');
update public.score_events set clock_seconds = 545, period_index = 1 where id = 'b9000000-0000-0000-0000-000000000001';
select is((select clock_seconds from public.score_events where id = 'b9000000-0000-0000-0000-000000000001'), 545, 'the minute can be corrected after the fact');

-- ---------- parents: read stints and the clock, control nothing ----------
select pg_temp.logout();
select pg_temp.login('f9000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.stints where game_id = 'a9000000-0000-0000-0000-000000000001'), 7, 'a parent reads every stint of the game');
select is((select elapsed from public.game_clock('a9000000-0000-0000-0000-000000000001')), 600, 'a parent reads the same clock');
select throws_ok($$select public.clock_pause('a9000000-0000-0000-0000-000000000001')$$, '42501', null, 'a parent cannot pause the clock');
select throws_ok($$select public.clock_sub('a9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-00000000000b')$$, '42501', null, 'or substitute');
select is((select count(*)::int from public.clock_ops where game_id = 'a9000000-0000-0000-0000-000000000001'), 0, 'the op log is staff-only');
select pg_temp.logout();
select pg_temp.login('f9000000-0000-0000-0000-000000000001');

-- ---------- finishing: the starters become the template, not the last players on ----------
select public.finish_game('a9000000-0000-0000-0000-000000000001');
select is((select clock_period_lengths[2] from public.games where id = 'a9000000-0000-0000-0000-000000000001'), 600, 'finishing records the last period''s length');
select is(pg_temp.open_count('a9000000-0000-0000-0000-000000000001'), 0, 'every stint is closed');
select is((select string_agg(coalesce(s.player_id::text, '-'), ',' order by s.slot_index) from public.lineup_slots s join public.lineups l on l.id = s.lineup_id
           where l.team_id = (select v from ctx where k = 'team') and l.game_id is null and l.period_index = 0),
  'e9000000-0000-0000-0000-00000000000a,e9000000-0000-0000-0000-00000000000b,e9000000-0000-0000-0000-00000000000c',
  'the template is Ann, Bo, Cy (the starters), not Ann, Di, Cy (last on the field)');
select is(pg_temp.secs((select v from ctx where k = 'team'), 'e9000000-0000-0000-0000-00000000000a'), 720, 'minutes are kept after the game');

-- ---------- corrections after the game ----------
select throws_ok($$select public.stint_update((select id from public.stints where game_id = 'a9000000-0000-0000-0000-000000000001' and player_id = 'e9000000-0000-0000-0000-00000000000a' and period_index = 0), 0, 200)$$, '23514', null, 'a stint cannot run past the end of its period');
select throws_ok($$select public.stint_update((select id from public.stints where game_id = 'a9000000-0000-0000-0000-000000000001' and player_id = 'e9000000-0000-0000-0000-00000000000a' and period_index = 0), 100, 100)$$, '23514', null, 'or end before it starts');
select lives_ok($$select public.stint_update((select id from public.stints where game_id = 'a9000000-0000-0000-0000-000000000001' and player_id = 'e9000000-0000-0000-0000-00000000000a' and period_index = 0), 0, 100)$$, 'the coach shortens Ann''s first stint');
select is(pg_temp.secs((select v from ctx where k = 'team'), 'e9000000-0000-0000-0000-00000000000a'), 700, 'minutes follow the correction');
select is((select updated_by from public.stints where game_id = 'a9000000-0000-0000-0000-000000000001' and player_id = 'e9000000-0000-0000-0000-00000000000a' and period_index = 0), 'f9000000-0000-0000-0000-000000000001', 'who edited is recorded');
select throws_ok($$select public.stint_add('a9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-00000000000a', 0, 'ST', 50, 150)$$, '23505', null, 'an added stint cannot overlap the same player');
select lives_ok($$select public.stint_add('a9000000-0000-0000-0000-000000000001', 'e9000000-0000-0000-0000-00000000000a', 0, 'ST', 150, 180)$$, 'the coach adds a stint Ann actually played');
select is(pg_temp.secs((select v from ctx where k = 'team'), 'e9000000-0000-0000-0000-00000000000a'), 730, 'and the minutes include it');
select lives_ok($$select public.stint_delete((select id from public.stints where game_id = 'a9000000-0000-0000-0000-000000000001' and player_id = 'e9000000-0000-0000-0000-00000000000a' and clock_start = 150))$$, 'and deletes it again');
select pg_temp.logout();
select pg_temp.login('f9000000-0000-0000-0000-000000000002');
select throws_ok($$select public.stint_update((select id from public.stints where game_id = 'a9000000-0000-0000-0000-000000000001' and player_id = 'e9000000-0000-0000-0000-00000000000a' and period_index = 0), 0, 90)$$, '42501', null, 'a parent cannot correct playing time');
select pg_temp.logout();
select pg_temp.login('f9000000-0000-0000-0000-000000000001');

-- ---------- a period-mode team is untouched ----------
select public.start_game('a9000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.stints where game_id = 'a9000000-0000-0000-0000-000000000002'), 0, 'starting a period-mode game opens no stints');
select throws_ok($$select public.clock_start('a9000000-0000-0000-0000-000000000002')$$, 'P0007', null, 'the clock refuses a period-mode team');
select is((select seconds_played from public.player_season_stats((select v from ctx where k = 'ptemplate')) where player_id = 'e9000000-0000-0000-0000-00000000000f'), 0, 'period-mode stats read zero seconds');
select public.finish_game('a9000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.lineups where team_id = (select v from ctx where k = 'ptemplate') and game_id is null), 1, 'finishing copies the final lineup back as before');
select pg_temp.logout();

select * from finish();
rollback;
