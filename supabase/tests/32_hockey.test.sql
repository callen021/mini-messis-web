-- Hockey (pgTAP, D122): a clock team with three periods; named forward lines and defense pairs
-- per team, readable by members and written by staff; a one-tap line change puts the line on
-- exactly as saved (a line player on the ice elsewhere moves, the displaced go to the bench, a
-- spot left empty is returned), forwards and defense never touch each other, one Undo takes the
-- whole change back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

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
-- the six spots as first letters in slot order (G, LD, RD, LW, C, RW); '-' for an open spot
create or replace function pg_temp.ice(p_game uuid)
returns text language sql as $$
  select string_agg(coalesce(left(p.first_name, 1), '-'), '' order by s.slot_index)
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

select pg_temp.mk_user('d7000000-0000-0000-0000-000000000001', 'coach-hk@test.com');
select pg_temp.mk_user('d7000000-0000-0000-0000-000000000003', 'parent-hk@test.com');
select pg_temp.mk_user('d7000000-0000-0000-0000-000000000006', 'admin-hk@test.com');
update public.profiles set is_platform_admin = true where id = 'd7000000-0000-0000-0000-000000000006';
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

select pg_temp.login('d7000000-0000-0000-0000-000000000006');
insert into ctx select 'team', public.create_team('Blades', 'hockey', 6, true, 3, '{}'::jsonb,
  (select jsonb_agg(jsonb_build_object('formation_name', 'Lines', 'slots',
     '[{"position_role":"G","position_code":"G"},{"position_role":"LD","position_code":"LD"},{"position_role":"RD","position_code":"RD"},{"position_role":"LW","position_code":"LW"},{"position_role":"C","position_code":"C"},{"position_role":"RW","position_code":"RW"}]'::jsonb))
   from generate_series(1, 3)));
select public.admin_add_member((select v from ctx where k = 'team'), 'coach-hk@test.com', 'coach');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-hk@test.com', 'parent');
select pg_temp.logout();

select is((select time_mode::text || '/' || clock_periods from public.teams where id = (select v from ctx where k = 'team')), 'clock/3', 'a hockey team is on the clock with three periods');
select is((select count(*)::int from public.skill_tests where team_id = (select v from ctx where k = 'team') and key in ('skate', 'shooting', 'sprint')), 3, 'the hockey skill tests');

-- players A–J: A–F start as G, LD, RD, LW, C, RW; G–J on the bench
insert into public.players (id, team_id, first_name, sort_order) values
  ('e7000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'team'), 'Ace', 0),
  ('e7000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'team'), 'Bo', 1),
  ('e7000000-0000-0000-0000-00000000000c', (select v from ctx where k = 'team'), 'Cy', 2),
  ('e7000000-0000-0000-0000-00000000000d', (select v from ctx where k = 'team'), 'Dax', 3),
  ('e7000000-0000-0000-0000-00000000000e', (select v from ctx where k = 'team'), 'Eli', 4),
  ('e7000000-0000-0000-0000-00000000000f', (select v from ctx where k = 'team'), 'Finn', 5),
  ('e7000000-0000-0000-0000-000000000010', (select v from ctx where k = 'team'), 'Gus', 6),
  ('e7000000-0000-0000-0000-000000000011', (select v from ctx where k = 'team'), 'Hal', 7),
  ('e7000000-0000-0000-0000-000000000012', (select v from ctx where k = 'team'), 'Ike', 8),
  ('e7000000-0000-0000-0000-000000000013', (select v from ctx where k = 'team'), 'Jed', 9);
update public.lineup_slots s set player_id = ('e7000000-0000-0000-0000-00000000000' || chr(97 + s.slot_index))::uuid
  from public.lineups l where l.id = s.lineup_id and l.team_id = (select v from ctx where k = 'team') and l.game_id is null and l.period_index = 0;
insert into public.games (id, team_id, season_id, opponent) values
  ('a7000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), (select id from public.seasons where team_id = (select v from ctx where k = 'team')), 'Sharks');

-- ---------- lines: staff write, members read ----------
select pg_temp.login('d7000000-0000-0000-0000-000000000003');
select throws_ok($$insert into public.lines (team_id, kind, slot, name, player_ids) values ((select v from ctx where k = 'team'), 'forward', 1, 'Top', '{}')$$, '42501', null, 'a parent cannot write a line');
select pg_temp.logout();
select pg_temp.login('d7000000-0000-0000-0000-000000000001');
-- F2: Gus, Hal, Ike (all on the bench); D1: Dax (a forward on the ice) and Bo (already at LD)
select lives_ok($$insert into public.lines (team_id, kind, slot, name, player_ids) values
  ((select v from ctx where k = 'team'), 'forward', 2, '  Second  ', array['e7000000-0000-0000-0000-000000000010', 'e7000000-0000-0000-0000-000000000011', 'e7000000-0000-0000-0000-000000000012']::uuid[]),
  ((select v from ctx where k = 'team'), 'defense', 1, 'Top pair', array['e7000000-0000-0000-0000-00000000000d', 'e7000000-0000-0000-0000-00000000000b']::uuid[])$$, 'the coach saves a forward line and a defense pair');
select is((select name from public.lines where team_id = (select v from ctx where k = 'team') and kind = 'forward' and slot = 2), 'Second', 'the name is trimmed');
select throws_ok($$insert into public.lines (team_id, kind, slot, player_ids) values ((select v from ctx where k = 'team'), 'defense', 3, '{}')$$, '23514', null, 'only two defense pairs');
select throws_ok($$insert into public.lines (team_id, kind, slot, player_ids) values ((select v from ctx where k = 'team'), 'forward', 3, array['e7000000-0000-0000-0000-000000000010', 'e7000000-0000-0000-0000-000000000010']::uuid[])$$, '23514', null, 'a player once per line');
select throws_ok($$insert into public.lines (team_id, kind, slot, player_ids) values ((select v from ctx where k = 'team'), 'forward', 3, array['e5000000-0000-0000-0000-00000000000a']::uuid[])$$, '23503', null, 'a player of another team is refused');
select pg_temp.logout();
select pg_temp.login('d7000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.lines where team_id = (select v from ctx where k = 'team')), 2, 'a parent reads the lines');
select pg_temp.logout();

-- ---------- the line change ----------
select pg_temp.login('d7000000-0000-0000-0000-000000000001');
select public.start_game('a7000000-0000-0000-0000-000000000001');
select public.clock_pause('a7000000-0000-0000-0000-000000000001');
select is(pg_temp.ice('a7000000-0000-0000-0000-000000000001'), 'ABCDEF', 'A–F start');
select is(pg_temp.bench('a7000000-0000-0000-0000-000000000001'), 'GHIJ', 'G–J on the bench');
select throws_ok($$select public.clock_line_change('a7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-00000000ffff')$$, 'P0011', null, 'no such line');
-- F2 on: the three forwards go to the bench, the defense and the goalie stay
select is((select public.clock_line_change('a7000000-0000-0000-0000-000000000001', (select id from public.lines where team_id = (select v from ctx where k = 'team') and kind = 'forward' and slot = 2))), '{}'::text[], 'F2 comes on with nothing left open');
select is(pg_temp.ice('a7000000-0000-0000-0000-000000000001'), 'ABCGHI', 'Gus, Hal, Ike at LW, C, RW; the goalie and the pair untouched');
select is(pg_temp.bench('a7000000-0000-0000-0000-000000000001'), 'JDEF', 'Dax, Eli, Finn join the end of the bench line');
select is((select count(*)::int from public.stints where game_id = 'a7000000-0000-0000-0000-000000000001' and clock_end is null), 6, 'six open stints');
select is(public.clock_undo('a7000000-0000-0000-0000-000000000001'), 'line', 'one Undo takes the whole change back');
select is(pg_temp.ice('a7000000-0000-0000-0000-000000000001') || '/' || pg_temp.bench('a7000000-0000-0000-0000-000000000001'), 'ABCDEF/GHIJ', 'the ice and the bench as they were');
-- D1 on: Dax moves from LW to LD, Bo moves from LD to RD, Cy goes to the bench, LW is left open
select is((select public.clock_line_change('a7000000-0000-0000-0000-000000000001', (select id from public.lines where team_id = (select v from ctx where k = 'team') and kind = 'defense' and slot = 1))), '{LW}'::text[], 'the pair comes on and LW is reported open');
select is(pg_temp.ice('a7000000-0000-0000-0000-000000000001'), 'ADB-EF', 'Dax at LD, Bo at RD, LW open, the forwards and the goalie otherwise untouched');
select is(pg_temp.bench('a7000000-0000-0000-0000-000000000001'), 'GHIJC', 'Cy to the bench');
select is((select continues from public.stints where game_id = 'a7000000-0000-0000-0000-000000000001' and clock_end is null and player_id = 'e7000000-0000-0000-0000-00000000000d'), true, 'a moved player keeps their shift');
select is((select count(*)::int from public.stints where game_id = 'a7000000-0000-0000-0000-000000000001' and clock_end is null and player_id = 'e7000000-0000-0000-0000-00000000000c'), 0, 'Cy is off the ice');
select pg_temp.logout();

select * from finish();
rollback;
