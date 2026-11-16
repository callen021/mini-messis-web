-- Volleyball (pgTAP, D121): a clock-mode team whose clock never runs; points are the seconds of a
-- set; we rotate only on a side-out, through the bench when the setting is on; a set ends on its
-- own at the target with win-by-two and the first serve alternates; Undo takes a point back with
-- its rotation; the score is sets won; playing time is points and sets played; the active stat
-- keeper scores, a coach rotates and undoes anything.
begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

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
-- the six court spots as a string of first letters, in slot order
create or replace function pg_temp.court(p_game uuid)
returns text language sql as $$
  select string_agg(left(p.first_name, 1), '' order by s.slot_index)
  from public.lineups l join public.lineup_slots s on s.lineup_id = l.id
  left join public.players p on p.id = s.player_id
  join public.games g on g.id = l.game_id
  where l.game_id = p_game and l.period_index = g.clock_period;
$$;
create or replace function pg_temp.bench(p_game uuid)
returns text language sql as $$
  select string_agg(left(p.first_name, 1), '' order by o.ord)
  from public.lineups l join public.games g on g.id = l.game_id
  cross join lateral unnest(l.bench_order) with ordinality as o(id, ord)
  join public.players p on p.id = o.id
  where l.game_id = p_game and l.period_index = g.clock_period;
$$;

select pg_temp.mk_user('d6000000-0000-0000-0000-000000000001', 'coach-vb@test.com');
select pg_temp.mk_user('d6000000-0000-0000-0000-000000000002', 'keeper-vb@test.com');
select pg_temp.mk_user('d6000000-0000-0000-0000-000000000003', 'parent-vb@test.com');
select pg_temp.mk_user('d6000000-0000-0000-0000-000000000006', 'admin-vb@test.com');
update public.profiles set is_platform_admin = true where id = 'd6000000-0000-0000-0000-000000000006';
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

select pg_temp.login('d6000000-0000-0000-0000-000000000006');
insert into ctx select 'team', public.create_team('Spikers', 'volleyball', 6, false, 3, '{}'::jsonb,
  (select jsonb_agg(jsonb_build_object('formation_name', 'Rotation', 'slots',
     '[{"position_role":"RB","position_code":"RB"},{"position_role":"RF","position_code":"RF"},{"position_role":"MF","position_code":"MF"},{"position_role":"LF","position_code":"LF"},{"position_role":"LB","position_code":"LB"},{"position_role":"MB","position_code":"MB"}]'::jsonb))
   from generate_series(1, 3)));
insert into ctx select 'soccer', public.create_team('Kickers', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select public.admin_add_member((select v from ctx where k = 'team'), 'coach-vb@test.com', 'coach');
select public.admin_add_member((select v from ctx where k = 'team'), 'keeper-vb@test.com', 'parent');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-vb@test.com', 'parent');
select public.admin_add_member((select v from ctx where k = 'soccer'), 'coach-vb@test.com', 'coach');
select pg_temp.logout();

select is((select time_mode::text || '/' || clock_periods from public.teams where id = (select v from ctx where k = 'team')), 'clock/3', 'a volleyball team is on the clock with three sets');
select is((select vb_set_points || '/' || vb_deciding_points || '/' || vb_win_by_two || '/' || vb_rotate_bench || '/' || vb_exit_spot || '/' || vb_entry_spot from public.teams where id = (select v from ctx where k = 'team')), '25/15/true/true/2/1', 'the set rules and the bench rotation default as specified');
select is((select count(*)::int from public.skill_tests where team_id = (select v from ctx where k = 'team') and key in ('serves', 'sprint')), 2, 'the volleyball skill tests');

-- players A–H: A–F start in spots 1–6, G and H on the bench
insert into public.players (id, team_id, first_name, sort_order) values
  ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'team'), 'Ava', 0),
  ('e6000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'team'), 'Bea', 1),
  ('e6000000-0000-0000-0000-00000000000c', (select v from ctx where k = 'team'), 'Cleo', 2),
  ('e6000000-0000-0000-0000-00000000000d', (select v from ctx where k = 'team'), 'Dot', 3),
  ('e6000000-0000-0000-0000-00000000000e', (select v from ctx where k = 'team'), 'Elle', 4),
  ('e6000000-0000-0000-0000-00000000000f', (select v from ctx where k = 'team'), 'Fay', 5),
  ('e6000000-0000-0000-0000-000000000010', (select v from ctx where k = 'team'), 'Gia', 6),
  ('e6000000-0000-0000-0000-000000000011', (select v from ctx where k = 'team'), 'Hope', 7),
  ('e6000000-0000-0000-0000-000000000012', (select v from ctx where k = 'soccer'), 'Sam', 0);
update public.lineup_slots s set player_id = ('e6000000-0000-0000-0000-00000000000' || chr(97 + s.slot_index))::uuid
  from public.lineups l where l.id = s.lineup_id and l.team_id = (select v from ctx where k = 'team') and l.game_id is null and l.period_index = 0;
insert into public.games (id, team_id, season_id, opponent) values
  ('a6000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), (select id from public.seasons where team_id = (select v from ctx where k = 'team')), 'Diggers'),
  ('a6000000-0000-0000-0000-000000000002', (select v from ctx where k = 'soccer'), (select id from public.seasons where team_id = (select v from ctx where k = 'soccer')), 'Owls');

-- ---------- the coach starts: no clock runs; the points of the set are the seconds ----------
select pg_temp.login('d6000000-0000-0000-0000-000000000001');
select public.start_game('a6000000-0000-0000-0000-000000000001');
select is((select clock_running_since is null and clock_seconds = 0 and clock_period = 0 and vb_serving is null from public.games where id = 'a6000000-0000-0000-0000-000000000001'), true, 'the game is live with no clock running and no serve yet');
select is(pg_temp.court('a6000000-0000-0000-0000-000000000001'), 'ABCDEF', 'A–F start in spots 1–6');
select is(pg_temp.bench('a6000000-0000-0000-0000-000000000001'), 'GH', 'G is Up Next, then H');
select public.start_game('a6000000-0000-0000-0000-000000000002');
select throws_ok($$select public.vb_point('a6000000-0000-0000-0000-000000000002', 'us')$$, 'P0019', null, 'a soccer game takes no volleyball points');
select throws_ok($$select public.vb_point('a6000000-0000-0000-0000-000000000001', 'left')$$, '22023', null, 'a side is us or them');

-- they serve first; their point: no rotation
select public.vb_set_serve('a6000000-0000-0000-0000-000000000001', 'them');
select is((select vb_serving || '/' || vb_first_serve from public.games where id = 'a6000000-0000-0000-0000-000000000001'), 'them/them', 'they serve first in this set');
select public.vb_point('a6000000-0000-0000-0000-000000000001', 'them');
select is(pg_temp.court('a6000000-0000-0000-0000-000000000001'), 'ABCDEF', 'their point never rotates us');
select is((select clock_seconds || '/' || vb_serving from public.games where id = 'a6000000-0000-0000-0000-000000000001'), '1/them', 'one point played, they still serve');
select is((select side || '/' || period_index || '/' || clock_seconds || '/' || points from public.score_events where game_id = 'a6000000-0000-0000-0000-000000000001'), 'them/0/0/1', 'the point is a score event at point 0 of set 0');

-- our point while they served: a side-out, so we rotate through the bench
select public.vb_point('a6000000-0000-0000-0000-000000000001', 'us');
select is(pg_temp.court('a6000000-0000-0000-0000-000000000001'), 'GCDEFA', 'B (exit spot 2) leaves, the other five rotate clockwise, G (Up Next) enters at spot 1 as the server');
select is(pg_temp.bench('a6000000-0000-0000-0000-000000000001'), 'HB', 'B joins the end of the bench line');
select is((select clock_seconds || '/' || vb_serving from public.games where id = 'a6000000-0000-0000-0000-000000000001'), '2/us', 'two points played, we serve');
select is((select count(*)::int from public.stints where game_id = 'a6000000-0000-0000-0000-000000000001' and clock_end = 2 and player_id = 'e6000000-0000-0000-0000-00000000000b'), 1, 'B''s stint closed at point 2');
select is((select continues from public.stints where game_id = 'a6000000-0000-0000-0000-000000000001' and clock_end is null and player_id = 'e6000000-0000-0000-0000-00000000000a'), true, 'A''s new stint continues the shift');
select is((select continues from public.stints where game_id = 'a6000000-0000-0000-0000-000000000001' and clock_end is null and player_id = 'e6000000-0000-0000-0000-000000000010'), false, 'G''s is a new shift');

-- Undo takes the point back with its rotation and its serve
select is(public.vb_undo('a6000000-0000-0000-0000-000000000001'), 'point', 'Undo undoes the point op');
select is(pg_temp.court('a6000000-0000-0000-0000-000000000001'), 'ABCDEF', 'the court is as it was');
select is(pg_temp.bench('a6000000-0000-0000-0000-000000000001'), 'GH', 'and so is the bench');
select is((select clock_seconds || '/' || vb_serving || '/' || (select count(*) from public.score_events e where e.game_id = g.id) from public.games g where g.id = 'a6000000-0000-0000-0000-000000000001'), '1/them/1', 'one point, they serve, one event');

-- our serve: our points never rotate; a rotation by hand does
select public.vb_point('a6000000-0000-0000-0000-000000000001', 'us');
select public.vb_point('a6000000-0000-0000-0000-000000000001', 'us');
select is(pg_temp.court('a6000000-0000-0000-0000-000000000001'), 'GCDEFA', 'rotated once, on the side-out only');
select public.vb_rotate('a6000000-0000-0000-0000-000000000001');
select is(pg_temp.court('a6000000-0000-0000-0000-000000000001'), 'HDEFAG', 'Rotate by hand: C leaves from spot 2, H enters at spot 1');
select is(public.vb_undo('a6000000-0000-0000-0000-000000000001'), 'rotate', 'and Undo reverses it');
select is(pg_temp.court('a6000000-0000-0000-0000-000000000001'), 'GCDEFA', 'back to the rotated court');

-- the set ends on its own at the target with win by two (5 points for the test)
update public.teams set vb_set_points = 5, vb_deciding_points = 5 where id = (select v from ctx where k = 'team');
select public.vb_point('a6000000-0000-0000-0000-000000000001', 'us');
select public.vb_point('a6000000-0000-0000-0000-000000000001', 'us');
select public.vb_point('a6000000-0000-0000-0000-000000000001', 'them');
select public.vb_point('a6000000-0000-0000-0000-000000000001', 'them');
select public.vb_point('a6000000-0000-0000-0000-000000000001', 'them');
select public.vb_point('a6000000-0000-0000-0000-000000000001', 'them');
select is((select clock_period from public.games where id = 'a6000000-0000-0000-0000-000000000001'), 0, '4–4 then 4–5: not won by two, the set goes on');
select public.vb_point('a6000000-0000-0000-0000-000000000001', 'them');
select is((select clock_period || '/' || clock_seconds || '/' || vb_serving || '/' || vb_first_serve from public.games where id = 'a6000000-0000-0000-0000-000000000001'), '1/0/us/us', '4–6 ends the set; set 2 starts at zero and we serve first');
select is((select us || '/' || them from public.vb_sets_won('a6000000-0000-0000-0000-000000000001')), '0/1', 'they lead one set to none');
select is((select us || '/' || them from public.game_scores_for(array['a6000000-0000-0000-0000-000000000001'::uuid])), '0/1', 'the game score is sets won');
select is((select clock_period_lengths[1] from public.games where id = 'a6000000-0000-0000-0000-000000000001'), 10, 'the set was ten points long');
select throws_ok($$select public.vb_undo('a6000000-0000-0000-0000-000000000001')$$, 'P0015', null, 'nothing to undo once the set has ended');

-- playing time: points and sets played
select is((select seconds_played || '/' || stint_periods from public.player_season_stats((select v from ctx where k = 'team'), null, 'a6000000-0000-0000-0000-000000000001') where player_id = 'e6000000-0000-0000-0000-00000000000a'), '10/2', 'A played all ten points and is on for set 2');
select is((select seconds_played || '/' || stint_periods from public.player_season_stats((select v from ctx where k = 'team'), null, 'a6000000-0000-0000-0000-000000000001') where player_id = 'e6000000-0000-0000-0000-00000000000b'), '2/1', 'B played two points of one set');
select is((select seconds_played || '/' || stint_periods from public.player_season_stats((select v from ctx where k = 'team'), null, 'a6000000-0000-0000-0000-000000000001') where player_id = 'e6000000-0000-0000-0000-000000000010'), '8/2', 'G played eight points and starts set 2');

-- a set ended by hand
select public.vb_point('a6000000-0000-0000-0000-000000000001', 'us');
select public.vb_end_set('a6000000-0000-0000-0000-000000000001');
select is((select clock_period || '/' || vb_serving from public.games where id = 'a6000000-0000-0000-0000-000000000001'), '2/them', 'End set moves on; the first serve alternates again');
select is((select us || '/' || them from public.vb_sets_won('a6000000-0000-0000-0000-000000000001')), '1/1', 'a set ended by hand counts by its points');
select pg_temp.logout();

-- ---------- who may score: the active keeper; a keeper undoes only points and rotations ----------
select pg_temp.login('d6000000-0000-0000-0000-000000000003');
select throws_ok($$select public.vb_point('a6000000-0000-0000-0000-000000000001', 'us')$$, '42501', null, 'a plain parent cannot score');
select pg_temp.logout();
select pg_temp.login('d6000000-0000-0000-0000-000000000001');
select public.set_stat_keeper((select id from public.team_members where user_id = 'd6000000-0000-0000-0000-000000000002'), true);
select pg_temp.logout();
select pg_temp.login('d6000000-0000-0000-0000-000000000002');
select throws_ok($$select public.vb_point('a6000000-0000-0000-0000-000000000001', 'us')$$, '42501', null, 'a named keeper scores nothing until they take the stats over');
select public.keep_stats('a6000000-0000-0000-0000-000000000001');
select lives_ok($$select public.vb_point('a6000000-0000-0000-0000-000000000001', 'them')$$, 'the active keeper scores');
select lives_ok($$select public.vb_point('a6000000-0000-0000-0000-000000000001', 'us')$$, 'and rotates us on the side-out');
select is(public.vb_undo('a6000000-0000-0000-0000-000000000001'), 'point', 'the keeper undoes their point');
select pg_temp.logout();
select pg_temp.login('d6000000-0000-0000-0000-000000000001');
select throws_ok($$select public.vb_point('a6000000-0000-0000-0000-000000000001', 'us')$$, '42501', null, 'the coach cannot score while the keeper is active');
select public.keep_stats('a6000000-0000-0000-0000-000000000001');
select public.clock_sub('a6000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-00000000000a', (select l.bench_order[1] from public.lineups l where l.game_id = 'a6000000-0000-0000-0000-000000000001' and l.period_index = 2));
select pg_temp.logout();
select pg_temp.login('d6000000-0000-0000-0000-000000000002');
select public.keep_stats('a6000000-0000-0000-0000-000000000001');
select throws_ok($$select public.vb_undo('a6000000-0000-0000-0000-000000000001')$$, 'P0015', null, 'a keeper cannot undo the coach''s substitution');
select pg_temp.logout();

select * from finish();
rollback;
