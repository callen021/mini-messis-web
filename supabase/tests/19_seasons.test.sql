-- Start a new season on the same team (pgTAP, D94): one transaction, rule 12 for the parents of
-- players not returning, a cleared template, everything else carried over, past seasons untouched.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

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
-- a fingerprint of a season's games and stats, to prove the past season is untouched
create or replace function pg_temp.season_print(p_team uuid, p_season uuid)
returns text language sql as $$
  select concat_ws('|',
    (select count(*) from public.games g where g.season_id = p_season),
    (select coalesce(sum(e.points), 0) from public.score_events e join public.games g on g.id = e.game_id where g.season_id = p_season),
    (select string_agg(s.name || ':' || s.goals || ':' || s.games_played, ',' order by s.name) from public.player_season_stats(p_team, p_season) s)
  );
$$;

select pg_temp.mk_user('fd000000-0000-0000-0000-000000000001', 'admin-s@test.com');
select pg_temp.mk_user('fd000000-0000-0000-0000-000000000002', 'coach-s@test.com');
select pg_temp.mk_user('fd000000-0000-0000-0000-000000000003', 'assistant-s@test.com');
select pg_temp.mk_user('fd000000-0000-0000-0000-000000000004', 'parent-ann@test.com');
select pg_temp.mk_user('fd000000-0000-0000-0000-000000000005', 'parent-bo@test.com');
update public.profiles set is_platform_admin = true where id = 'fd000000-0000-0000-0000-000000000001';
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

select pg_temp.login('fd000000-0000-0000-0000-000000000001');
insert into ctx select 'team', public.create_team('Season FC', 'soccer', 3, true, 1, '{"ST":"#E22400"}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select public.admin_add_member((select v from ctx where k = 'team'), 'coach-s@test.com', 'coach');
select public.admin_add_member((select v from ctx where k = 'team'), 'assistant-s@test.com', 'assistant');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-ann@test.com', 'parent');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-bo@test.com', 'parent');
select pg_temp.logout();
update public.teams set time_mode = 'periods', timezone = 'America/Denver' where id = (select v from ctx where k = 'team');
insert into ctx select 'season1', id from public.seasons where team_id = (select v from ctx where k = 'team') and is_current;
insert into public.players (id, team_id, first_name, jersey_number, sort_order) values
  ('ed000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'team'), 'Ann', '1', 1),
  ('ed000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'team'), 'Bo', '2', 2),
  ('ed000000-0000-0000-0000-00000000000c', (select v from ctx where k = 'team'), 'Cy', '3', 3);
insert into public.player_guardians (player_id, user_id, status) values
  ('ed000000-0000-0000-0000-00000000000a', 'fd000000-0000-0000-0000-000000000004', 'approved'),
  ('ed000000-0000-0000-0000-00000000000b', 'fd000000-0000-0000-0000-000000000005', 'approved');
insert into public.player_details (player_id, shirt_size) values ('ed000000-0000-0000-0000-00000000000b', 'YM');
insert into public.player_contacts (player_id, name, phone) values ('ed000000-0000-0000-0000-00000000000b', 'Bo Parent', '+15550100021');
insert into public.skill_tests (id, team_id, key, name, metric) values
  ('dd000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), 'touch', 'First touch', 'count');
insert into public.skill_results (player_id, skill_test_id, value) values
  ('ed000000-0000-0000-0000-00000000000a', 'dd000000-0000-0000-0000-000000000001', 5),
  ('ed000000-0000-0000-0000-00000000000b', 'dd000000-0000-0000-0000-000000000001', 6);
insert into public.board_posts (team_id, author_id, body) values ((select v from ctx where k = 'team'), 'fd000000-0000-0000-0000-000000000002', 'Welcome back');
-- the template has Ann and Bo placed, Cy on the bench
update public.lineup_slots s set player_id = 'ed000000-0000-0000-0000-00000000000a'
  from public.lineups l where s.lineup_id = l.id and l.team_id = (select v from ctx where k = 'team') and l.game_id is null and s.slot_index = 0;
update public.lineup_slots s set player_id = 'ed000000-0000-0000-0000-00000000000b'
  from public.lineups l where s.lineup_id = l.id and l.team_id = (select v from ctx where k = 'team') and l.game_id is null and s.slot_index = 1;
update public.lineups set bench_order = array['ed000000-0000-0000-0000-00000000000c'::uuid] where team_id = (select v from ctx where k = 'team') and game_id is null;
-- a finished game in season 1: Ann scored twice, Bo once; a practice too
insert into public.games (id, team_id, season_id, opponent, status, finished_at) values
  ('ad000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'), (select v from ctx where k = 'season1'), 'Owls', 'done', now());
insert into public.game_players (game_id, player_id, name_snapshot) values
  ('ad000000-0000-0000-0000-000000000001', 'ed000000-0000-0000-0000-00000000000a', 'Ann'),
  ('ad000000-0000-0000-0000-000000000001', 'ed000000-0000-0000-0000-00000000000b', 'Bo');
insert into public.score_events (game_id, side, period_index, event_type, points, scorer_player_id) values
  ('ad000000-0000-0000-0000-000000000001', 'us', 0, 'goal', 1, 'ed000000-0000-0000-0000-00000000000a'),
  ('ad000000-0000-0000-0000-000000000001', 'us', 0, 'goal', 1, 'ed000000-0000-0000-0000-00000000000a'),
  ('ad000000-0000-0000-0000-000000000001', 'us', 0, 'goal', 1, 'ed000000-0000-0000-0000-00000000000b');
insert into public.practices (team_id, season_id, practice_date, start_time) values
  ((select v from ctx where k = 'team'), (select v from ctx where k = 'season1'), '2026-09-01', '18:00');
create temp table before_print as select pg_temp.season_print((select v from ctx where k = 'team'), (select v from ctx where k = 'season1')) as t;
grant all on before_print to authenticated;

-- ---------- who may, and not while a game is live ----------
select pg_temp.login('fd000000-0000-0000-0000-000000000003');
select throws_ok($$select public.start_season((select v from ctx where k = 'team'), 'Spring 2027')$$, '42501', null, 'an assistant cannot start a season');
select pg_temp.logout();
select pg_temp.login('fd000000-0000-0000-0000-000000000004');
select throws_ok($$select public.start_season((select v from ctx where k = 'team'), 'Spring 2027')$$, '42501', null, 'nor a parent');
select pg_temp.logout();
select pg_temp.login('fd000000-0000-0000-0000-000000000002');
select throws_ok($$select public.start_season((select v from ctx where k = 'team'), '  ')$$, '22023', null, 'the season needs a name');
select throws_ok($$select public.start_season((select v from ctx where k = 'team'), 'Spring 2027', '2027-03-01', '2027-02-01')$$, '22023', null, 'and cannot end before it starts');
insert into public.games (id, team_id, season_id, opponent) values
  ('ad000000-0000-0000-0000-000000000002', (select v from ctx where k = 'team'), (select v from ctx where k = 'season1'), 'Bears');
select public.start_game('ad000000-0000-0000-0000-000000000002');
select throws_ok($$select public.start_season((select v from ctx where k = 'team'), 'Spring 2027')$$, 'P0006', null, 'not while a game is live');
select public.finish_game('ad000000-0000-0000-0000-000000000002');
select pg_temp.logout();

-- ---------- the coach starts Spring 2027; Ann is not returning ----------
select pg_temp.login('fd000000-0000-0000-0000-000000000002');
-- the fingerprint is taken as the coach (stats are member-only)
update before_print set t = pg_temp.season_print((select v from ctx where k = 'team'), (select v from ctx where k = 'season1'));
select lives_ok($$insert into ctx select 'season2', public.start_season((select v from ctx where k = 'team'), 'Spring 2027', '2027-03-01', '2027-06-15', array['ed000000-0000-0000-0000-00000000000a'::uuid])$$, 'the coach starts a new season with Ann not returning');
select is((select is_current from public.seasons where id = (select v from ctx where k = 'season2')), true, 'the new season is current');
select is((select is_current from public.seasons where id = (select v from ctx where k = 'season1')), false, 'the old one is not');
select is((select name || '/' || starts_on || '/' || ends_on from public.seasons where id = (select v from ctx where k = 'season2')), 'Spring 2027/2027-03-01/2027-06-15', 'with its name and dates');
select is((select count(*)::int from public.seasons where team_id = (select v from ctx where k = 'team') and is_current), 1, 'exactly one current season');
-- roster
select is((select archived_at is not null from public.players where id = 'ed000000-0000-0000-0000-00000000000a'), true, 'Ann is archived');
select is((select string_agg(first_name || '/' || jersey_number, ',' order by sort_order) from public.players where team_id = (select v from ctx where k = 'team') and archived_at is null), 'Bo/2,Cy/3', 'returning players keep their numbers');
select is((select status::text from public.team_members where user_id = 'fd000000-0000-0000-0000-000000000004'), 'removed', 'Ann''s parent lost their membership (rule 12)');
select is((select status::text from public.team_members where user_id = 'fd000000-0000-0000-0000-000000000005'), 'active', 'Bo''s parent stays');
select is((select shirt_size::text from public.player_details where player_id = 'ed000000-0000-0000-0000-00000000000b'), 'YM', 'details carry over');
select is((select count(*)::int from public.player_contacts where player_id = 'ed000000-0000-0000-0000-00000000000b'), 1, 'contacts carry over');
select is((select count(*)::int from public.skill_results), 2, 'every skill result carries over (Ann''s included)');
select is((select count(*)::int from public.skill_tests where team_id = (select v from ctx where k = 'team')), 8, 'skill tests carry over (the seven sport defaults and the custom one)');
select is((select count(*)::int from public.board_posts where team_id = (select v from ctx where k = 'team')), 1, 'the board carries over');
select is((select timezone || '/' || time_mode::text from public.teams where id = (select v from ctx where k = 'team')), 'America/Denver/periods', 'team settings carry over');
select is((select join_enabled from public.teams where id = (select v from ctx where k = 'team')), true, 'and the invite link');
-- template
select is((select count(*)::int from public.lineup_slots s join public.lineups l on l.id = s.lineup_id where l.team_id = (select v from ctx where k = 'team') and l.game_id is null and s.player_id is not null), 0, 'the template lineup is cleared');
select is((select bench_order from public.lineups where team_id = (select v from ctx where k = 'team') and game_id is null), '{}', 'and its bench order');
-- the new season is empty; the old one is untouched
select is((select count(*)::int from public.games where season_id = (select v from ctx where k = 'season2')), 0, 'the new season has an empty schedule');
select is((select count(*)::int from public.practices where season_id = (select v from ctx where k = 'season2')), 0, 'no practices either');
select is((select count(*)::int from public.player_season_stats((select v from ctx where k = 'team')) where goals > 0 or games_played > 0), 0, 'stats are zeroed for the new season');
select is(pg_temp.season_print((select v from ctx where k = 'team'), (select v from ctx where k = 'season1')), (select t from before_print), 'past-season games and stats are unchanged');
select is((select string_agg(name || ':' || goals, ',' order by name) from public.player_season_stats((select v from ctx where k = 'team'), (select v from ctx where k = 'season1'))), 'Ann:2,Bo:1,Cy:0', 'the past season stays viewable by season id, archived player included');
select pg_temp.logout();

-- ---------- a game in the new season does not touch the old season ----------
select pg_temp.login('fd000000-0000-0000-0000-000000000002');
insert into public.games (id, team_id, season_id, opponent, status, finished_at) values
  ('ad000000-0000-0000-0000-000000000003', (select v from ctx where k = 'team'), (select v from ctx where k = 'season2'), 'Lions', 'done', now());
insert into public.score_events (game_id, side, period_index, event_type, points, scorer_player_id) values
  ('ad000000-0000-0000-0000-000000000003', 'us', 0, 'goal', 1, 'ed000000-0000-0000-0000-00000000000c');
select is((select goals from public.player_season_stats((select v from ctx where k = 'team')) where name = 'Cy'), 1, 'the new season counts its own goals');
select is(pg_temp.season_print((select v from ctx where k = 'team'), (select v from ctx where k = 'season1')), (select t from before_print), 'and the old season is still unchanged');
select pg_temp.logout();

-- ---------- a platform admin can switch the current season back ----------
select pg_temp.login('fd000000-0000-0000-0000-000000000002');
select throws_ok($$select public.set_current_season((select v from ctx where k = 'team'), (select v from ctx where k = 'season1'))$$, '42501', null, 'a coach cannot switch the current season back');
select pg_temp.logout();
select pg_temp.login('fd000000-0000-0000-0000-000000000001');
select lives_ok($$select public.set_current_season((select v from ctx where k = 'team'), (select v from ctx where k = 'season1'))$$, 'a platform admin can');
select is((select is_current from public.seasons where id = (select v from ctx where k = 'season1')), true, 'season 1 is current again');
select is((select count(*)::int from public.seasons where team_id = (select v from ctx where k = 'team') and is_current), 1, 'still exactly one current season');
select throws_ok($$select public.set_current_season((select v from ctx where k = 'team'), 'ad000000-0000-0000-0000-000000000001')$$, 'P0002', null, 'a season id from elsewhere is refused');
select pg_temp.logout();

select * from finish();
rollback;
