-- Mid-game formation change (pgTAP, D108): the guards (zero clock, running clock, other sports,
-- parents, a different player set), the change itself keeps every player's time unbroken across
-- two stints, undo puts the shape and the stints back, a sub after the change carries the new
-- code, the next period starts in the new shape, finishing still writes the KICKOFF shape and
-- starters to the template, and formation_changes lists the changes for members only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(58);

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
  perform pg_temp.login('f6000000-0000-0000-0000-000000000001');
end $$;
create or replace function pg_temp.open_count(p_game uuid)
returns int language sql as $$ select count(*)::int from public.stints where game_id = p_game and clock_end is null; $$;
create or replace function pg_temp.secs(p_team uuid, p_player uuid)
returns int language sql as $$ select seconds_played from public.player_season_stats(p_team) where player_id = p_player; $$;
-- the player's open stint as "start/slot/code/continues"
create or replace function pg_temp.open_stint(p_game uuid, p_player uuid)
returns text language sql as $$
  select clock_start || '/' || slot_index || '/' || position_code || '/' || continues
  from public.stints where game_id = p_game and player_id = p_player and clock_end is null;
$$;
-- a lineup row of the game as "formation|codes|players" (players by the last letter of their id)
create or replace function pg_temp.shape(p_game uuid, p_period int)
returns text language sql as $$
  select l.formation_name || '|' || string_agg(s.position_code, ',' order by s.slot_index) || '|' || string_agg(coalesce(right(s.player_id::text, 1), '-'), ',' order by s.slot_index)
  from public.lineups l join public.lineup_slots s on s.lineup_id = l.id
  where l.game_id = p_game and l.period_index = p_period
  group by l.id, l.formation_name;
$$;
create or replace function pg_temp.changes(p_game uuid)
returns text language sql as $$
  select coalesce(string_agg(period_index || '/' || clock_seconds || '/' || from_formation || '/' || to_formation, ';'), '')
  from public.formation_changes(p_game);
$$;
-- the 3-2-1 shape: A LB, ? CB, B RB, D LM, E RM, F ST, G GK (B and C trade slot indexes)
create or replace function pg_temp.shape321(p_cb uuid)
returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('position_role', 'DEF', 'position_code', 'LB', 'player_id', 'e6000000-0000-0000-0000-000000000001'),
    jsonb_build_object('position_role', 'DEF', 'position_code', 'CB', 'player_id', p_cb),
    jsonb_build_object('position_role', 'DEF', 'position_code', 'RB', 'player_id', 'e6000000-0000-0000-0000-000000000002'),
    jsonb_build_object('position_role', 'MID', 'position_code', 'LM', 'player_id', 'e6000000-0000-0000-0000-000000000004'),
    jsonb_build_object('position_role', 'MID', 'position_code', 'RM', 'player_id', 'e6000000-0000-0000-0000-000000000005'),
    jsonb_build_object('position_role', 'ST', 'position_code', 'ST', 'player_id', 'e6000000-0000-0000-0000-000000000006'),
    jsonb_build_object('position_role', 'GK', 'position_code', 'GK', 'player_id', 'e6000000-0000-0000-0000-000000000007'));
$$;

select pg_temp.mk_user('f6000000-0000-0000-0000-000000000001', 'coach-fc@test.com');
select pg_temp.mk_user('f6000000-0000-0000-0000-000000000002', 'parent-fc@test.com');
select pg_temp.mk_user('f6000000-0000-0000-0000-000000000003', 'stranger-fc@test.com');
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

update public.profiles set is_platform_admin = true where id = 'f6000000-0000-0000-0000-000000000001';
select pg_temp.login('f6000000-0000-0000-0000-000000000001');
-- a 7v7 soccer clock team (two halves) and a tiny basketball clock team
insert into ctx select 'team', public.create_team('Shape FC', 'soccer', 7, true, 2, '{}'::jsonb,
  '[{"formation_name":"2-3-1","slots":[{"position_role":"DEF","position_code":"LB"},{"position_role":"DEF","position_code":"RB"},{"position_role":"MID","position_code":"LM"},{"position_role":"MID","position_code":"CM"},{"position_role":"MID","position_code":"RM"},{"position_role":"ST","position_code":"ST"},{"position_role":"GK","position_code":"GK"}]},
    {"formation_name":"2-3-1","slots":[{"position_role":"DEF","position_code":"LB"},{"position_role":"DEF","position_code":"RB"},{"position_role":"MID","position_code":"LM"},{"position_role":"MID","position_code":"CM"},{"position_role":"MID","position_code":"RM"},{"position_role":"ST","position_code":"ST"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
insert into ctx select 'hoop', public.create_team('Hoop BC', 'basketball', 3, false, 1, '{}'::jsonb,
  '[{"formation_name":"1-2","slots":[{"position_role":"G","position_code":"PG"},{"position_role":"F","position_code":"SF"},{"position_role":"C","position_code":"C"}]}]'::jsonb);
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-fc@test.com', 'parent');
select pg_temp.logout();
update public.profiles set is_platform_admin = false where id = 'f6000000-0000-0000-0000-000000000001';
select pg_temp.login('f6000000-0000-0000-0000-000000000001');
update public.teams set time_mode = 'clock', clock_periods = 2, period_minutes = 20 where id = (select v from ctx where k = 'team');
update public.teams set time_mode = 'clock', clock_periods = 2, period_minutes = 10 where id = (select v from ctx where k = 'hoop');

insert into public.players (id, team_id, first_name) values
  ('e6000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), 'Ann'),
  ('e6000000-0000-0000-0000-000000000002', (select v from ctx where k = 'team'), 'Bo'),
  ('e6000000-0000-0000-0000-000000000003', (select v from ctx where k = 'team'), 'Cy'),
  ('e6000000-0000-0000-0000-000000000004', (select v from ctx where k = 'team'), 'Di'),
  ('e6000000-0000-0000-0000-000000000005', (select v from ctx where k = 'team'), 'Ed'),
  ('e6000000-0000-0000-0000-000000000006', (select v from ctx where k = 'team'), 'Flo'),
  ('e6000000-0000-0000-0000-000000000007', (select v from ctx where k = 'team'), 'Gus'),
  ('e6000000-0000-0000-0000-000000000008', (select v from ctx where k = 'team'), 'Hal');

insert into public.games (id, team_id, season_id, opponent) values
  ('a6000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), (select id from public.seasons where team_id = (select v from ctx where k = 'team')), 'Bears'),
  ('a6000000-0000-0000-0000-000000000002', (select v from ctx where k = 'hoop'), (select id from public.seasons where team_id = (select v from ctx where k = 'hoop')), 'Owls');

-- ---------- kickoff: 2-3-1 with A LB, B RB, C LM, D CM, E RM, F ST, G GK; H on the bench ----------
select public.start_game('a6000000-0000-0000-0000-000000000001');
select public.start_game('a6000000-0000-0000-0000-000000000002');
select public.clock_set_lineup('a6000000-0000-0000-0000-000000000001', '2-3-1',
  '[{"position_role":"DEF","position_code":"LB","player_id":"e6000000-0000-0000-0000-000000000001"},
    {"position_role":"DEF","position_code":"RB","player_id":"e6000000-0000-0000-0000-000000000002"},
    {"position_role":"MID","position_code":"LM","player_id":"e6000000-0000-0000-0000-000000000003"},
    {"position_role":"MID","position_code":"CM","player_id":"e6000000-0000-0000-0000-000000000004"},
    {"position_role":"MID","position_code":"RM","player_id":"e6000000-0000-0000-0000-000000000005"},
    {"position_role":"ST","position_code":"ST","player_id":"e6000000-0000-0000-0000-000000000006"},
    {"position_role":"GK","position_code":"GK","player_id":"e6000000-0000-0000-0000-000000000007"}]'::jsonb);
select is(pg_temp.shape('a6000000-0000-0000-0000-000000000001', 0), '2-3-1|LB,RB,LM,CM,RM,ST,GK|1,2,3,4,5,6,7', 'the starters stand in a 2-3-1');
select is((select clock_seconds from public.clock_ops where game_id = 'a6000000-0000-0000-0000-000000000001' order by seq desc limit 1), 0, 'the lineup op is stamped with the clock second (0)');

-- ---------- guards ----------
-- start_game started the clock (D109): pause it so the guard under test is the zero clock, not the running one
select public.clock_pause('a6000000-0000-0000-0000-000000000001');
select throws_ok($$select public.clock_change_formation('a6000000-0000-0000-0000-000000000001', '3-2-1', pg_temp.shape321('e6000000-0000-0000-0000-000000000003'))$$, 'P0017', null, 'at 0:00 the lineup edit is the way, not a formation change');
select public.clock_start('a6000000-0000-0000-0000-000000000001');
select pg_temp.pass('a6000000-0000-0000-0000-000000000001', 600);
select throws_ok($$select public.clock_change_formation('a6000000-0000-0000-0000-000000000001', '3-2-1', pg_temp.shape321('e6000000-0000-0000-0000-000000000003'))$$, 'P0016', null, 'the clock must be paused');
select throws_ok($$select public.clock_change_formation('a6000000-0000-0000-0000-000000000002', '2-1', '[{"position_role":"G","position_code":"PG"},{"position_role":"G","position_code":"SG"},{"position_role":"C","position_code":"C"}]'::jsonb)$$, 'P0015', null, 'basketball has no mid-game formation change');
select public.clock_pause('a6000000-0000-0000-0000-000000000001');
select is((select elapsed from public.game_clock('a6000000-0000-0000-0000-000000000001')), 600, 'paused at 10:00');
select pg_temp.logout();
select pg_temp.login('f6000000-0000-0000-0000-000000000002');
select throws_ok($$select public.clock_change_formation('a6000000-0000-0000-0000-000000000001', '3-2-1', pg_temp.shape321('e6000000-0000-0000-0000-000000000003'))$$, '42501', null, 'a parent cannot change the formation');
select pg_temp.logout();
select pg_temp.login('f6000000-0000-0000-0000-000000000001');
select throws_ok($$select public.clock_change_formation('a6000000-0000-0000-0000-000000000001', '3-2-1', pg_temp.shape321('e6000000-0000-0000-0000-000000000008'))$$, 'P0018', null, 'the players on the field stay the same (H is on the bench)');
select throws_ok($$select public.clock_change_formation('a6000000-0000-0000-0000-000000000001', '3-2-1', '[]'::jsonb)$$, '22023', null, 'a formation needs positions');
select is((select count(*)::int from public.clock_ops where game_id = 'a6000000-0000-0000-0000-000000000001' and kind = 'formation'), 0, 'a refused change leaves no op');

-- ---------- the change at 10:00: same players, new spots, time unbroken ----------
select lives_ok($$select public.clock_change_formation('a6000000-0000-0000-0000-000000000001', '3-2-1', pg_temp.shape321('e6000000-0000-0000-0000-000000000003'))$$, 'the coach switches to a 3-2-1 at 10:00');
select is(pg_temp.open_count('a6000000-0000-0000-0000-000000000001'), 7, 'seven players are still on the field');
select is((select count(*)::int from public.stints where game_id = 'a6000000-0000-0000-0000-000000000001' and period_index = 0), 14, 'every stint closed at the change and reopened');
select is(pg_temp.open_stint('a6000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000003'), '600/1/CB/true', 'Cy continues at centre back from 10:00, in slot 1');
select is(pg_temp.open_stint('a6000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000002'), '600/2/RB/true', 'Bo continues at right back, now slot 2');
select is((select clock_end from public.stints where game_id = 'a6000000-0000-0000-0000-000000000001' and player_id = 'e6000000-0000-0000-0000-000000000003' and clock_start = 0), 600, 'Cy''s first stint closed at 10:00');
select is((select count(*)::int from (select player_id, sum(coalesce(clock_end, 600) - clock_start) as t from public.stints where game_id = 'a6000000-0000-0000-0000-000000000001' group by player_id) x where x.t = 600), 7, 'every player still has exactly 10:00');
select is(pg_temp.secs((select v from ctx where k = 'team'), 'e6000000-0000-0000-0000-000000000003'), 600, 'the stats agree: Cy 10:00');
select is(pg_temp.shape('a6000000-0000-0000-0000-000000000001', 0), '3-2-1|LB,CB,RB,LM,RM,ST,GK|1,3,2,4,5,6,7', 'the period row shows the new shape with the same players');
select is((select kind || '/' || period_index || '/' || clock_seconds || '/' || formation_before from public.clock_ops where game_id = 'a6000000-0000-0000-0000-000000000001' order by seq desc limit 1), 'formation/0/600/2-3-1', 'the op records the second and the shape it replaced');
select is((select jsonb_array_length(slots_before) || '/' || (slots_before -> 1 ->> 'position_code') || '/' || right(slots_before -> 2 ->> 'player_id', 1) from public.clock_ops where game_id = 'a6000000-0000-0000-0000-000000000001' order by seq desc limit 1), '7/RB/3', 'and the seven spots as they were');
select is((select bench_order from public.lineups where game_id = 'a6000000-0000-0000-0000-000000000001' and period_index = 0), array['e6000000-0000-0000-0000-000000000008']::uuid[], 'the bench is untouched');

-- another five minutes: the total spans two stints
select public.clock_start('a6000000-0000-0000-0000-000000000001');
select pg_temp.pass('a6000000-0000-0000-0000-000000000001', 300);
select public.clock_pause('a6000000-0000-0000-0000-000000000001');
select is(pg_temp.secs((select v from ctx where k = 'team'), 'e6000000-0000-0000-0000-000000000003'), 900, 'Cy: 15:00 in total');
select is((select count(*)::int from public.stints where game_id = 'a6000000-0000-0000-0000-000000000001' and player_id = 'e6000000-0000-0000-0000-000000000003'), 2, 'split across two stints');

-- ---------- the game page: members read the changes, strangers nothing ----------
select pg_temp.logout();
select pg_temp.login('f6000000-0000-0000-0000-000000000002');
select is(pg_temp.changes('a6000000-0000-0000-0000-000000000001'), '0/600/2-3-1/3-2-1', 'a parent reads the one change: first half, 10:00, 2-3-1 to 3-2-1');
select throws_ok($$select public.clock_undo('a6000000-0000-0000-0000-000000000001')$$, '42501', null, 'and cannot undo it');
select pg_temp.logout();
select pg_temp.login('f6000000-0000-0000-0000-000000000003');
select is_empty($$select * from public.formation_changes('a6000000-0000-0000-0000-000000000001')$$, 'a stranger reads nothing');
select pg_temp.logout();
select pg_temp.login('f6000000-0000-0000-0000-000000000001');

-- ---------- undo puts the shape and the stints back ----------
select is((select public.clock_undo('a6000000-0000-0000-0000-000000000001')), 'formation', 'undo reverses the formation change');
select is(pg_temp.shape('a6000000-0000-0000-0000-000000000001', 0), '2-3-1|LB,RB,LM,CM,RM,ST,GK|1,2,3,4,5,6,7', 'the 2-3-1 is back with its codes and players');
select is((select count(*)::int from public.stints where game_id = 'a6000000-0000-0000-0000-000000000001' and period_index = 0), 7, 'one stint per player again');
select is(pg_temp.open_stint('a6000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000003'), '0/2/LM/false', 'Cy''s original stint is open again at left mid');
select is(pg_temp.secs((select v from ctx where k = 'team'), 'e6000000-0000-0000-0000-000000000003'), 900, 'his time is unchanged');
select is(pg_temp.changes('a6000000-0000-0000-0000-000000000001'), '', 'the game page lists no change any more');

-- ---------- redo after a sub at the same second; a sub after the change carries the new code ----------
-- Hal comes on for Cy while paused at 15:00, then the formation changes at 15:00 too: Hal's
-- zero-length stint is replaced by one that continues in the new spot
select public.clock_sub('a6000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000003', 'e6000000-0000-0000-0000-000000000008');
select is(pg_temp.open_stint('a6000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000008'), '900/2/LM/false', 'Hal takes Cy''s spot at 15:00');
select lives_ok($$select public.clock_change_formation('a6000000-0000-0000-0000-000000000001', '3-2-1', pg_temp.shape321('e6000000-0000-0000-0000-000000000008'))$$, 'the coach switches to the 3-2-1 again, with Hal at centre back');
select is((select count(*) || '/' || min(clock_start) || '/' || bool_and(continues) from public.stints where game_id = 'a6000000-0000-0000-0000-000000000001' and player_id = 'e6000000-0000-0000-0000-000000000008'), '1/900/true', 'Hal has one stint, from 15:00, continuing');
select is(pg_temp.open_stint('a6000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000008'), '900/1/CB/true', 'at centre back in slot 1');
select is((select jsonb_array_length(deleted_stints) from public.clock_ops where game_id = 'a6000000-0000-0000-0000-000000000001' order by seq desc limit 1), 1, 'the op remembers the zero-length stint it removed');
select is(pg_temp.secs((select v from ctx where k = 'team'), 'e6000000-0000-0000-0000-000000000003'), 900, 'Cy, on the bench, keeps his 15:00');
select public.clock_start('a6000000-0000-0000-0000-000000000001');
select pg_temp.pass('a6000000-0000-0000-0000-000000000001', 60);
select public.clock_sub('a6000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000008', 'e6000000-0000-0000-0000-000000000003');
select is(pg_temp.open_stint('a6000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000003'), '960/1/CB/false', 'Cy comes back on at centre back: the new code, a new shift');
select is((select clock_seconds from public.clock_ops where game_id = 'a6000000-0000-0000-0000-000000000001' and kind = 'sub' order by seq desc limit 1), 960, 'the sub op is stamped at 16:00');
select is(pg_temp.secs((select v from ctx where k = 'team'), 'e6000000-0000-0000-0000-000000000008'), 60, 'Hal: one minute');
select is(pg_temp.changes('a6000000-0000-0000-0000-000000000001'), '0/900/2-3-1/3-2-1', 'the game page lists the change at 15:00');

-- ---------- half time: the second half starts in the new shape, players keep their slots ----------
select public.clock_end_period('a6000000-0000-0000-0000-000000000001');
select is(pg_temp.shape('a6000000-0000-0000-0000-000000000001', 1), '3-2-1|LB,CB,RB,LM,RM,ST,GK|1,3,2,4,5,6,7', 'the second half''s row carries the 3-2-1 and its codes, players in the same slots');
select is(pg_temp.open_stint('a6000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000003'), '0/1/CB/false', 'Cy starts the second half at centre back, slot 1');
select is(pg_temp.open_stint('a6000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000001'), '0/0/LB/false', 'Ann at left back, slot 0');
select throws_ok($$select public.clock_undo('a6000000-0000-0000-0000-000000000001')$$, 'P0015', null, 'the first-half change cannot be undone from the second half');

-- ---------- a change in the second half ----------
select public.clock_start('a6000000-0000-0000-0000-000000000001');
select pg_temp.pass('a6000000-0000-0000-0000-000000000001', 120);
select public.clock_pause('a6000000-0000-0000-0000-000000000001');
select lives_ok($$select public.clock_change_formation('a6000000-0000-0000-0000-000000000001', '1-4-1', jsonb_build_array(
    jsonb_build_object('position_role', 'DEF', 'position_code', 'CB', 'player_id', 'e6000000-0000-0000-0000-000000000001'),
    jsonb_build_object('position_role', 'MID', 'position_code', 'LM', 'player_id', 'e6000000-0000-0000-0000-000000000003'),
    jsonb_build_object('position_role', 'MID', 'position_code', 'LCM', 'player_id', 'e6000000-0000-0000-0000-000000000002'),
    jsonb_build_object('position_role', 'MID', 'position_code', 'RCM', 'player_id', 'e6000000-0000-0000-0000-000000000004'),
    jsonb_build_object('position_role', 'MID', 'position_code', 'RM', 'player_id', 'e6000000-0000-0000-0000-000000000005'),
    jsonb_build_object('position_role', 'ST', 'position_code', 'ST', 'player_id', 'e6000000-0000-0000-0000-000000000006'),
    jsonb_build_object('position_role', 'GK', 'position_code', 'GK', 'player_id', 'e6000000-0000-0000-0000-000000000007')))$$,
  'the coach switches to a 1-4-1 at 2:00 of the second half');
select is(pg_temp.shape('a6000000-0000-0000-0000-000000000001', 1), '1-4-1|CB,LM,LCM,RCM,RM,ST,GK|1,3,2,4,5,6,7', 'the second half''s row shows the 1-4-1');
select is(pg_temp.open_stint('a6000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000002'), '120/2/LCM/true', 'Bo continues at left centre mid');
select is(pg_temp.changes('a6000000-0000-0000-0000-000000000001'), '0/900/2-3-1/3-2-1;1/120/3-2-1/1-4-1', 'the game page lists both changes in order');

-- ---------- finishing: the template gets the KICKOFF shape and starters ----------
select public.finish_game('a6000000-0000-0000-0000-000000000001');
select is(pg_temp.open_count('a6000000-0000-0000-0000-000000000001'), 0, 'every stint is closed');
select is((select count(*)::int from public.lineups l where l.team_id = (select v from ctx where k = 'team') and l.game_id is null and l.formation_name = '2-3-1'), 2, 'both template periods carry the kickoff 2-3-1, not the 1-4-1 the game ended in');
select is((select string_agg(s.position_code, ',' order by s.slot_index) || '|' || string_agg(right(s.player_id::text, 1), ',' order by s.slot_index)
           from public.lineup_slots s join public.lineups l on l.id = s.lineup_id
           where l.team_id = (select v from ctx where k = 'team') and l.game_id is null and l.period_index = 0),
  'LB,RB,LM,CM,RM,ST,GK|1,2,3,4,5,6,7', 'the template has the kickoff codes and the kickoff starters (Cy in slot 2, not Hal)');
select is(pg_temp.secs((select v from ctx where k = 'team'), 'e6000000-0000-0000-0000-000000000001'), 1080, 'Ann: 16:00 in the first half and 2:00 in the second');
select is(pg_temp.secs((select v from ctx where k = 'team'), 'e6000000-0000-0000-0000-000000000003'), 1020, 'Cy: 15:00, a minute off, then 2:00');
select is((select count(*) || '/' || count(*) filter (where undone_at is not null) from public.clock_ops where game_id = 'a6000000-0000-0000-0000-000000000001' and kind = 'formation'), '3/1', 'three formation ops, one undone');
select is(pg_temp.changes('a6000000-0000-0000-0000-000000000001'), '0/900/2-3-1/3-2-1;1/120/3-2-1/1-4-1', 'the changes stay readable after the game');
select pg_temp.logout();

select * from finish();
rollback;
