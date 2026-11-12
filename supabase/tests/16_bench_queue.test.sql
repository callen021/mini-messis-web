-- The bench queue (pgTAP, D79): roster order to start, off → right end, on → gap closes, bench
-- swap, undo restores the order, half-time carry-over, marked out / back in, period-mode rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

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
  perform pg_temp.login('fa000000-0000-0000-0000-000000000001');
end $$;
-- the queue of a game period as a short string of player letters (a..f)
create or replace function pg_temp.q(p_game uuid, p_period int)
returns text language sql as $$
  select coalesce(string_agg(right(x::text, 1), '' order by ord), '')
  from public.lineups l, unnest(l.bench_order) with ordinality as u(x, ord)
  where l.game_id = p_game and l.period_index = p_period;
$$;
create or replace function pg_temp.tq(p_team uuid, p_period int)
returns text language sql as $$
  select coalesce(string_agg(right(x::text, 1), '' order by ord), '')
  from public.lineups l, unnest(l.bench_order) with ordinality as u(x, ord)
  where l.team_id = p_team and l.game_id is null and l.period_index = p_period;
$$;

select pg_temp.mk_user('fa000000-0000-0000-0000-000000000001', 'coach-bq@test.com');
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

update public.profiles set is_platform_admin = true where id = 'fa000000-0000-0000-0000-000000000001';
select pg_temp.login('fa000000-0000-0000-0000-000000000001');
insert into ctx select 'team', public.create_team('Queue FC', 'soccer', 3, true, 2, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]},
    {"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select pg_temp.logout();
update public.profiles set is_platform_admin = false where id = 'fa000000-0000-0000-0000-000000000001';
select pg_temp.login('fa000000-0000-0000-0000-000000000001');
update public.teams set time_mode = 'clock', clock_periods = 2 where id = (select v from ctx where k = 'team');

-- six players a..f in roster order; a, b, c start
insert into public.players (id, team_id, first_name, sort_order) values
  ('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'team'), 'Ann', 1),
  ('ea000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'team'), 'Bo', 2),
  ('ea000000-0000-0000-0000-00000000000c', (select v from ctx where k = 'team'), 'Cy', 3),
  ('ea000000-0000-0000-0000-00000000000d', (select v from ctx where k = 'team'), 'Di', 4),
  ('ea000000-0000-0000-0000-00000000000e', (select v from ctx where k = 'team'), 'Ed', 5),
  ('ea000000-0000-0000-0000-00000000000f', (select v from ctx where k = 'team'), 'Flo', 6);
update public.lineup_slots s set player_id = case s.slot_index when 0 then 'ea000000-0000-0000-0000-00000000000a' when 1 then 'ea000000-0000-0000-0000-00000000000b' else 'ea000000-0000-0000-0000-00000000000c' end::uuid
  from public.lineups l where l.id = s.lineup_id and l.team_id = (select v from ctx where k = 'team') and l.game_id is null and l.period_index = 0;

-- ---------- period-mode rows: save_lineups persists an explicit order ----------
select public.save_lineups((select v from ctx where k = 'team'), null,
  '[{"period_index":0,"formation_name":"1-1","bench_order":["ea000000-0000-0000-0000-00000000000f","ea000000-0000-0000-0000-00000000000d"],
     "slots":[{"position_role":"ST","position_code":"ST","player_id":"ea000000-0000-0000-0000-00000000000a"},{"position_role":"DEF","position_code":"SW","player_id":"ea000000-0000-0000-0000-00000000000b"},{"position_role":"GK","position_code":"GK","player_id":"ea000000-0000-0000-0000-00000000000c"}]},
    {"period_index":1,"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST","player_id":null},{"position_role":"DEF","position_code":"SW","player_id":null},{"position_role":"GK","position_code":"GK","player_id":null}]}]'::jsonb);
select is(pg_temp.tq((select v from ctx where k = 'team'), 0), 'fde', 'a saved order is kept and the missing bench players join the right end in roster order');
select is(pg_temp.tq((select v from ctx where k = 'team'), 1), 'abcdef', 'a period without an order gets roster order of everyone not on the field');

-- ---------- a clock game ----------
insert into public.games (id, team_id, season_id, opponent) values
  ('aa000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), (select id from public.seasons where team_id = (select v from ctx where k = 'team')), 'Bears');
select public.start_game('aa000000-0000-0000-0000-000000000001');
select is(pg_temp.q('aa000000-0000-0000-0000-000000000001', 0), 'fde', 'the game starts with the template''s queue');
select is(pg_temp.q('aa000000-0000-0000-0000-000000000001', 1), 'fdeabc', 'later periods carry it too (nobody is on their field yet, so the starters trail the queue until the break copies it)');

select public.clock_start('aa000000-0000-0000-0000-000000000001');
select pg_temp.pass('aa000000-0000-0000-0000-000000000001', 60);
-- sub: Flo (leftmost) on for Ann → Ann joins the right end, Flo leaves the queue
select public.clock_sub('aa000000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-00000000000a', 'ea000000-0000-0000-0000-00000000000f');
select is(pg_temp.q('aa000000-0000-0000-0000-000000000001', 0), 'dea', 'sub: the player on leaves the queue, the player off joins the right end');
-- any order of taps: Ed on for Bo (not the leftmost)
select public.clock_sub('aa000000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-00000000000b', 'ea000000-0000-0000-0000-00000000000e');
select is(pg_temp.q('aa000000-0000-0000-0000-000000000001', 0), 'dab', 'staff may pick any bench player; the gap closes');
-- swap two on the field: the queue is untouched
select public.clock_swap('aa000000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-00000000000f', 'ea000000-0000-0000-0000-00000000000c');
select is(pg_temp.q('aa000000-0000-0000-0000-000000000001', 0), 'dab', 'a position swap leaves the queue alone');
-- bench swap: Ann and Di change places
select public.clock_bench_swap('aa000000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-00000000000a', 'ea000000-0000-0000-0000-00000000000d');
select is(pg_temp.q('aa000000-0000-0000-0000-000000000001', 0), 'adb', 'two bench jerseys swap places in the queue');
select throws_ok($$select public.clock_bench_swap('aa000000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-00000000000a', 'ea000000-0000-0000-0000-00000000000f')$$, 'P0016', null, 'a player on the field is not in the queue');
select is(public.clock_undo('aa000000-0000-0000-0000-000000000001'), 'bench', 'undo reverses a bench swap');
select is(pg_temp.q('aa000000-0000-0000-0000-000000000001', 0), 'dab', 'and the previous order is back');
-- undo a sub restores both the players and the queue
select public.clock_undo('aa000000-0000-0000-0000-000000000001'); -- the swap
select is(public.clock_undo('aa000000-0000-0000-0000-000000000001'), 'sub', 'undo reverses the second sub');
select is(pg_temp.q('aa000000-0000-0000-0000-000000000001', 0), 'dea', 'and its queue: Ed back in his place, Bo back on the field');
-- empty a spot: the player off joins the right end; fill from the queue removes the player
select public.clock_empty('aa000000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-00000000000f');
select is(pg_temp.q('aa000000-0000-0000-0000-000000000001', 0), 'deaf', 'empty: the player off joins the right end');
select public.clock_fill('aa000000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-00000000000e', 0);
select is(pg_temp.q('aa000000-0000-0000-0000-000000000001', 0), 'daf', 'fill: the player on leaves the queue');
-- marked out and back in
select public.set_player_available('ea000000-0000-0000-0000-00000000000d', false);
select is(pg_temp.q('aa000000-0000-0000-0000-000000000001', 0), 'af', 'a player marked out leaves the queue');
select public.set_player_available('ea000000-0000-0000-0000-00000000000d', true);
select is(pg_temp.q('aa000000-0000-0000-0000-000000000001', 0), 'afd', 'and joins the right end when marked back in');
-- end of the half: the queue carries over as it stands
select public.clock_end_period('aa000000-0000-0000-0000-000000000001');
select is(pg_temp.q('aa000000-0000-0000-0000-000000000001', 1), 'afd', 'the second half starts with the same queue');
-- rewriting the lineup at zero: players who leave the field join the right end in spot order
select public.clock_set_lineup('aa000000-0000-0000-0000-000000000001', '1-1',
  '[{"position_role":"ST","position_code":"ST","player_id":"ea000000-0000-0000-0000-00000000000a"},
    {"position_role":"DEF","position_code":"SW","player_id":"ea000000-0000-0000-0000-00000000000f"},
    {"position_role":"GK","position_code":"GK","player_id":"ea000000-0000-0000-0000-00000000000d"}]'::jsonb);
select is(pg_temp.q('aa000000-0000-0000-0000-000000000001', 1), 'ebc', 'a rewritten lineup: those who left join the right end in spot order, those who came on leave');
-- period-mode copy on finish keeps the order
select public.finish_game('aa000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.lineups where game_id = 'aa000000-0000-0000-0000-000000000001' and cardinality(bench_order) > 0), 2, 'a finished game keeps its queues');
select pg_temp.logout();

select * from finish();
rollback;
