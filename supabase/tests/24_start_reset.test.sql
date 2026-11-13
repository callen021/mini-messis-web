-- Start is kickoff and the early-start reset (pgTAP, D109): start_game on a clock team starts the
-- clock in the same transaction; clock_reset puts a first-period clock back to 0:00 (staff only,
-- paused, no score), discards the period's ops and closed stints, restarts the open ones at 0 and
-- leaves the lineup and the bench alone; a reset at 0:00 is a harmless no-op; after a score or
-- past the first period it refuses.
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

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
  perform pg_temp.login('f5000000-0000-0000-0000-000000000001');
end $$;
-- the game row's clock as "seconds/running|paused/limit|-/auto_paused"
create or replace function pg_temp.row_clock(p_game uuid)
returns text language sql as $$
  select clock_seconds || '/' || case when clock_running_since is null then 'paused' else 'running' end || '/' || coalesce(clock_limit::text, '-') || '/' || clock_auto_paused
  from public.games where id = p_game;
$$;
create or replace function pg_temp.open_count(p_game uuid)
returns int language sql as $$ select count(*)::int from public.stints where game_id = p_game and clock_end is null; $$;
create or replace function pg_temp.ops(p_game uuid)
returns int language sql as $$ select count(*)::int from public.clock_ops where game_id = p_game and period_index = 0; $$;
create or replace function pg_temp.secs(p_team uuid, p_player uuid)
returns int language sql as $$ select seconds_played from public.player_season_stats(p_team) where player_id = p_player; $$;
-- the player's open stint as "start/slot/code/continues/opened_by_op?"
create or replace function pg_temp.open_stint(p_game uuid, p_player uuid)
returns text language sql as $$
  select clock_start || '/' || slot_index || '/' || position_code || '/' || continues || '/' || (opened_by_op is not null)
  from public.stints where game_id = p_game and player_id = p_player and clock_end is null;
$$;
-- the period row as "formation|codes|players" (players by the last letter of their id)
create or replace function pg_temp.shape(p_game uuid, p_period int)
returns text language sql as $$
  select l.formation_name || '|' || string_agg(s.position_code, ',' order by s.slot_index) || '|' || string_agg(coalesce(right(s.player_id::text, 1), '-'), ',' order by s.slot_index)
  from public.lineups l join public.lineup_slots s on s.lineup_id = l.id
  where l.game_id = p_game and l.period_index = p_period
  group by l.id, l.formation_name;
$$;

select pg_temp.mk_user('f5000000-0000-0000-0000-000000000001', 'coach-ks@test.com');
select pg_temp.mk_user('f5000000-0000-0000-0000-000000000002', 'parent-ks@test.com');
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

update public.profiles set is_platform_admin = true where id = 'f5000000-0000-0000-0000-000000000001';
select pg_temp.login('f5000000-0000-0000-0000-000000000001');
-- a 7v7 soccer clock team, two halves of 20 minutes
insert into ctx select 'team', public.create_team('Kickoff FC', 'soccer', 7, true, 2, '{}'::jsonb,
  '[{"formation_name":"2-3-1","slots":[{"position_role":"DEF","position_code":"LB"},{"position_role":"DEF","position_code":"RB"},{"position_role":"MID","position_code":"LM"},{"position_role":"MID","position_code":"CM"},{"position_role":"MID","position_code":"RM"},{"position_role":"ST","position_code":"ST"},{"position_role":"GK","position_code":"GK"}]},
    {"formation_name":"2-3-1","slots":[{"position_role":"DEF","position_code":"LB"},{"position_role":"DEF","position_code":"RB"},{"position_role":"MID","position_code":"LM"},{"position_role":"MID","position_code":"CM"},{"position_role":"MID","position_code":"RM"},{"position_role":"ST","position_code":"ST"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-ks@test.com', 'parent');
select pg_temp.logout();
update public.profiles set is_platform_admin = false where id = 'f5000000-0000-0000-0000-000000000001';
select pg_temp.login('f5000000-0000-0000-0000-000000000001');
update public.teams set time_mode = 'clock', clock_periods = 2, period_minutes = 20 where id = (select v from ctx where k = 'team');

insert into public.players (id, team_id, first_name) values
  ('e5000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), 'Ann'),
  ('e5000000-0000-0000-0000-000000000002', (select v from ctx where k = 'team'), 'Bo'),
  ('e5000000-0000-0000-0000-000000000003', (select v from ctx where k = 'team'), 'Cy'),
  ('e5000000-0000-0000-0000-000000000004', (select v from ctx where k = 'team'), 'Di'),
  ('e5000000-0000-0000-0000-000000000005', (select v from ctx where k = 'team'), 'Ed'),
  ('e5000000-0000-0000-0000-000000000006', (select v from ctx where k = 'team'), 'Flo'),
  ('e5000000-0000-0000-0000-000000000007', (select v from ctx where k = 'team'), 'Gus'),
  ('e5000000-0000-0000-0000-000000000008', (select v from ctx where k = 'team'), 'Hal');
-- the template's first period: Ann LB, Bo RB, Cy LM, Di CM, Ed RM, Flo ST, Gus GK; Hal on the bench
update public.lineup_slots s set player_id = ('e5000000-0000-0000-0000-00000000000' || (s.slot_index + 1))::uuid
  from public.lineups l where l.id = s.lineup_id and l.team_id = (select v from ctx where k = 'team') and l.game_id is null and l.period_index = 0;

insert into public.games (id, team_id, season_id, opponent) values
  ('a5000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), (select id from public.seasons where team_id = (select v from ctx where k = 'team')), 'Bears'),
  ('a5000000-0000-0000-0000-000000000002', (select v from ctx where k = 'team'), (select id from public.seasons where team_id = (select v from ctx where k = 'team')), 'Owls');

-- ---------- start is kickoff: the clock runs from start_game ----------
select throws_ok($$select public.clock_reset('a5000000-0000-0000-0000-000000000001')$$, '22023', null, 'the clock of an upcoming game cannot be reset (nothing to reset)');
select public.start_game('a5000000-0000-0000-0000-000000000001');
select is((select status::text from public.games where id = 'a5000000-0000-0000-0000-000000000001'), 'live', 'the game is live');
select is(pg_temp.row_clock('a5000000-0000-0000-0000-000000000001'), '0/running/3000/false', 'and the clock is running from 0:00 with the stretch limit (20 minutes plus 30), no safety note');
select is((select clock_limit from public.games where id = 'a5000000-0000-0000-0000-000000000001'), public.clock_limit_for((select v from ctx where k = 'team'), 0), 'the limit is clock_limit_for(team, 0)');
select is((select (running_since is not null) || '/' || elapsed || '/' || period_index from public.game_clock('a5000000-0000-0000-0000-000000000001')), 'true/0/0', 'game_clock shows it running in the first period');
select is(pg_temp.open_count('a5000000-0000-0000-0000-000000000001'), 7, 'the seven starters are on the field');
select is(pg_temp.shape('a5000000-0000-0000-0000-000000000001', 0), '2-3-1|LB,RB,LM,CM,RM,ST,GK|1,2,3,4,5,6,7', 'in the template''s spots');
select lives_ok($$select public.clock_start('a5000000-0000-0000-0000-000000000001')$$, 'an explicit clock_start after start_game is a harmless no-op');
select is(pg_temp.row_clock('a5000000-0000-0000-0000-000000000001'), '0/running/3000/false', 'and changes nothing');

-- ---------- guards ----------
select throws_ok($$select public.clock_reset('a5000000-0000-0000-0000-000000000001')$$, 'P0020', null, 'the clock must be paused before a reset');
select pg_temp.logout();
select pg_temp.login('f5000000-0000-0000-0000-000000000002');
select throws_ok($$select public.clock_reset('a5000000-0000-0000-0000-000000000001')$$, '42501', null, 'a parent cannot reset the clock');
select pg_temp.logout();
select pg_temp.login('f5000000-0000-0000-0000-000000000001');

-- ---------- a reset at 0:00 right after start and pause: a no-op that succeeds ----------
select public.clock_pause('a5000000-0000-0000-0000-000000000001');
select is(pg_temp.row_clock('a5000000-0000-0000-0000-000000000001'), '0/paused/3000/false', 'paused at 0:00 (the limit of the stretch stays on the row)');
select lives_ok($$select public.clock_reset('a5000000-0000-0000-0000-000000000001')$$, 'a reset with nothing to clear is allowed');
select is(pg_temp.row_clock('a5000000-0000-0000-0000-000000000001'), '0/paused/-/false', 'it leaves the clock paused at 0:00 with no limit');
select is((select count(*) || '/' || pg_temp.open_count('a5000000-0000-0000-0000-000000000001') || '/' || bool_and(clock_start = 0) from public.stints where game_id = 'a5000000-0000-0000-0000-000000000001'), '7/7/true', 'the seven starters still have one open stint each at 0');
select is(pg_temp.ops('a5000000-0000-0000-0000-000000000001'), 0, 'and there were no ops to discard');

-- ---------- ten minutes, a sub, then the reset ----------
select public.clock_start('a5000000-0000-0000-0000-000000000001');
select is(pg_temp.row_clock('a5000000-0000-0000-0000-000000000001'), '0/running/3000/false', 'the clock runs again from 0:00 with a fresh limit');
select pg_temp.pass('a5000000-0000-0000-0000-000000000001', 600);
select public.clock_pause('a5000000-0000-0000-0000-000000000001');
select is((select elapsed from public.game_clock('a5000000-0000-0000-0000-000000000001')), 600, 'paused at 10:00');
-- Hal on for Ann at 10:00
select public.clock_sub('a5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000008');
select is(pg_temp.open_stint('a5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000008'), '600/0/LB/false/true', 'Hal takes Ann''s spot at 10:00, opened by the sub op');
select is((select clock_end from public.stints where game_id = 'a5000000-0000-0000-0000-000000000001' and player_id = 'e5000000-0000-0000-0000-000000000001'), 600, 'Ann''s stint closed at 10:00');
select is(pg_temp.ops('a5000000-0000-0000-0000-000000000001'), 1, 'one op in the first period');
select is(pg_temp.secs((select v from ctx where k = 'team'), 'e5000000-0000-0000-0000-000000000002'), 600, 'Bo has 10:00 so far');
select is((select bench_order from public.lineups where game_id = 'a5000000-0000-0000-0000-000000000001' and period_index = 0), array['e5000000-0000-0000-0000-000000000001']::uuid[], 'Ann is on the bench');

select lives_ok($$select public.clock_reset('a5000000-0000-0000-0000-000000000001')$$, 'the coach resets the clock: an early start');
select is(pg_temp.row_clock('a5000000-0000-0000-0000-000000000001'), '0/paused/-/false', 'the clock is back at 0:00, paused, with no limit');
select is((select clock_period || '/' || cardinality(clock_period_lengths) from public.games where id = 'a5000000-0000-0000-0000-000000000001'), '0/0', 'still the first period, no period length recorded');
select is(pg_temp.ops('a5000000-0000-0000-0000-000000000001'), 0, 'the first period''s ops are gone');
select is((select count(*)::int from public.stints where game_id = 'a5000000-0000-0000-0000-000000000001' and player_id = 'e5000000-0000-0000-0000-000000000001'), 0, 'Ann''s closed stint is gone: she has none');
select is(pg_temp.open_stint('a5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000008'), '0/0/LB/false/false', 'Hal''s open stint restarts at 0 in the same spot, a fresh shift, no longer tied to the op');
select is((select count(*) || '/' || count(distinct player_id) || '/' || bool_and(clock_start = 0 and clock_end is null) from public.stints where game_id = 'a5000000-0000-0000-0000-000000000001'), '7/7/true', 'every player on the field has exactly one open stint at 0 and nobody else has any');
select is(pg_temp.shape('a5000000-0000-0000-0000-000000000001', 0), '2-3-1|LB,RB,LM,CM,RM,ST,GK|8,2,3,4,5,6,7', 'the lineup row is as it was: Hal in Ann''s spot');
select is((select bench_order from public.lineups where game_id = 'a5000000-0000-0000-0000-000000000001' and period_index = 0), array['e5000000-0000-0000-0000-000000000001']::uuid[], 'the bench is as it was: Ann');
select is(pg_temp.secs((select v from ctx where k = 'team'), 'e5000000-0000-0000-0000-000000000002'), 0, 'the minutes are cleared: Bo has 0:00');
select is(pg_temp.secs((select v from ctx where k = 'team'), 'e5000000-0000-0000-0000-000000000001'), 0, 'and so has Ann');
select throws_ok($$select public.clock_undo('a5000000-0000-0000-0000-000000000001')$$, 'P0015', null, 'nothing from before the reset can be undone');
select lives_ok($$select public.clock_reset('a5000000-0000-0000-0000-000000000001')$$, 'a second reset at 0:00 is harmless');

-- ---------- kickoff again: the seconds accrue from 0 ----------
select public.clock_start('a5000000-0000-0000-0000-000000000001');
select is(pg_temp.row_clock('a5000000-0000-0000-0000-000000000001'), '0/running/3000/false', 'the clock runs again from 0:00 with the stretch limit');
select pg_temp.pass('a5000000-0000-0000-0000-000000000001', 300);
select is((select elapsed from public.game_clock('a5000000-0000-0000-0000-000000000001')), 300, 'five minutes later it reads 5:00');
select is(pg_temp.secs((select v from ctx where k = 'team'), 'e5000000-0000-0000-0000-000000000008'), 300, 'Hal: 5:00 from the new kickoff');
select is(pg_temp.secs((select v from ctx where k = 'team'), 'e5000000-0000-0000-0000-000000000001'), 0, 'Ann, on the bench, still 0:00');

-- ---------- once a score is recorded the reset refuses ----------
select public.clock_pause('a5000000-0000-0000-0000-000000000001');
insert into public.score_events (game_id, side, period_index, event_type)
  values ('a5000000-0000-0000-0000-000000000001', 'them', 0, 'goal');
select throws_ok($$select public.clock_reset('a5000000-0000-0000-0000-000000000001')$$, 'P0021', null, 'a score on either side rules the reset out');
select is(pg_temp.row_clock('a5000000-0000-0000-0000-000000000001'), '300/paused/3000/false', 'the refused reset changed nothing');

-- ---------- past the first period the reset refuses ----------
select public.clock_end_period('a5000000-0000-0000-0000-000000000001');
select is((select clock_period || '/' || clock_period_lengths[1] from public.games where id = 'a5000000-0000-0000-0000-000000000001'), '1/300', 'second half, the first was 5:00 long');
select throws_ok($$select public.clock_reset('a5000000-0000-0000-0000-000000000001')$$, 'P0019', null, 'the clock can only be reset in the first period');
select is(pg_temp.open_count('a5000000-0000-0000-0000-000000000001'), 7, 'the second half''s starters are untouched');
select pg_temp.logout();

select * from finish();
rollback;
