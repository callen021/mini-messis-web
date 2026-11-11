-- Stats visibility (pgTAP, D56): with parent_stats = 'own' a parent sees other children's ids
-- nowhere (log, at-bats, per-player stats, the tables themselves); scores and totals stay; 'team'
-- opens everything; staff always see all.
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

select pg_temp.mk_user('f8000000-0000-0000-0000-000000000001', 'coach-v@test.com');
select pg_temp.mk_user('f8000000-0000-0000-0000-000000000002', 'parent-vx@test.com');  -- guardian of X
select pg_temp.mk_user('f8000000-0000-0000-0000-000000000003', 'stranger-v@test.com');
select pg_temp.mk_user('f8000000-0000-0000-0000-000000000004', 'admin-v@test.com');
update public.profiles set is_platform_admin = true where id = 'f8000000-0000-0000-0000-000000000004';
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

select pg_temp.login('f8000000-0000-0000-0000-000000000004');
insert into ctx select 'team', public.create_team('Visible FC', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select public.admin_add_member((select v from ctx where k = 'team'), 'coach-v@test.com', 'coach');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-vx@test.com', 'parent');
select pg_temp.logout();
insert into public.players (id, team_id, first_name, jersey_number) values
  ('e8000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'team'), 'Child X', '1'),
  ('e8000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'team'), 'Child Y', '2');
insert into public.player_guardians (player_id, user_id, status) values
  ('e8000000-0000-0000-0000-00000000000a', 'f8000000-0000-0000-0000-000000000002', 'approved');
select is((select parent_stats::text from public.teams where id = (select v from ctx where k = 'team')), 'own', 'default is own');

-- a game with X scoring once (assist Y), Y scoring once, opponent once
select pg_temp.login('f8000000-0000-0000-0000-000000000001');
insert into public.games (id, team_id, season_id, opponent)
values ('a8000000-0000-0000-0000-000000000001', (select v from ctx where k = 'team'),
        (select id from public.seasons where team_id = (select v from ctx where k = 'team')), 'Rivals');
select public.start_game('a8000000-0000-0000-0000-000000000001');
insert into public.score_events (game_id, side, period_index, event_type, scorer_player_id, assist_player_id) values
  ('a8000000-0000-0000-0000-000000000001', 'us', 0, 'goal', 'e8000000-0000-0000-0000-00000000000a', 'e8000000-0000-0000-0000-00000000000b'),
  ('a8000000-0000-0000-0000-000000000001', 'us', 0, 'goal', 'e8000000-0000-0000-0000-00000000000b', null),
  ('a8000000-0000-0000-0000-000000000001', 'them', 0, 'goal', null, null);
select is((select count(*)::int from public.game_events('a8000000-0000-0000-0000-000000000001') where scorer_player_id is not null), 2, 'coach sees both scorers');
select is((select count(*)::int from public.player_season_stats((select v from ctx where k = 'team'), null, 'a8000000-0000-0000-0000-000000000001')), 2, 'coach gets a stats row per player');
select is((select count(*)::int from public.score_events), 3, 'coach reads the log table');
select pg_temp.logout();

-- ---------- parent of X, setting = own ----------
select pg_temp.login('f8000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.score_events), 0, 'parent cannot read the log table directly');
select is((select count(*)::int from public.plate_appearances), 0, 'nor plate appearances');
select is((select count(*)::int from public.game_events('a8000000-0000-0000-0000-000000000001')), 3, 'but game_events returns every event');
select is((select string_agg(coalesce(scorer_player_id::text, '-'), ',' order by occurred_at, created_at) from public.game_events('a8000000-0000-0000-0000-000000000001')),
  'e8000000-0000-0000-0000-00000000000a,-,-', 'only the own child''s scorer id is present');
select is((select assist_player_id from public.game_events('a8000000-0000-0000-0000-000000000001') where scorer_player_id = 'e8000000-0000-0000-0000-00000000000a'), null, 'the other child''s assist id is withheld');
select is((select string_agg(hidden::text, ',' order by occurred_at, created_at) from public.game_events('a8000000-0000-0000-0000-000000000001')), 'false,true,false', 'hidden flags the withheld goal, not the opponent''s');
select is((select us || '-' || them from public.game_scores_for(array['a8000000-0000-0000-0000-000000000001'::uuid])), '2-1', 'the score is still visible');
select is((select string_agg(player_id::text, ',') from public.player_season_stats((select v from ctx where k = 'team'), null, 'a8000000-0000-0000-0000-000000000001')), 'e8000000-0000-0000-0000-00000000000a', 'stats table has only the own child');
select is((select goals from public.player_season_stats((select v from ctx where k = 'team'), null, 'a8000000-0000-0000-0000-000000000001')), 1, 'with their goal counted');
select is(public.can_see_player_stats('e8000000-0000-0000-0000-00000000000b'), false, 'helper says no for the other child');
select is(public.can_see_player_stats('e8000000-0000-0000-0000-00000000000a'), true, 'and yes for their own');
select is((select count(*)::int from public.lineup_slots s join public.lineups l on l.id = s.lineup_id where l.game_id = 'a8000000-0000-0000-0000-000000000001'), 3, 'positions and lineups are unchanged');
update public.teams set parent_stats = 'team' where id = (select v from ctx where k = 'team');
select pg_temp.logout();
select is((select parent_stats::text from public.teams where id = (select v from ctx where k = 'team')), 'own', 'a parent cannot change the setting (silent no-op)');

-- ---------- coach switches to team ----------
select pg_temp.login('f8000000-0000-0000-0000-000000000001');
select lives_ok($$update public.teams set parent_stats = 'team' where id = (select v from ctx where k = 'team')$$, 'coach sets parent_stats = team');
select pg_temp.logout();
select pg_temp.login('f8000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.game_events('a8000000-0000-0000-0000-000000000001') where scorer_player_id is not null), 2, 'now the parent sees every scorer');
select is((select count(*)::int from public.player_season_stats((select v from ctx where k = 'team'), null, 'a8000000-0000-0000-0000-000000000001')), 2, 'and every stats row');
select is((select count(*)::int from public.score_events), 3, 'and may read the log table');
select pg_temp.logout();

-- ---------- stranger: nothing either way ----------
select pg_temp.login('f8000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.game_events('a8000000-0000-0000-0000-000000000001')), 0, 'non-member gets no events');
select is((select count(*)::int from public.game_scores_for(array['a8000000-0000-0000-0000-000000000001'::uuid])), 0, 'nor scores');
select is((select count(*)::int from public.player_season_stats((select v from ctx where k = 'team'))), 0, 'nor stats');
select pg_temp.logout();

select * from finish();
rollback;
