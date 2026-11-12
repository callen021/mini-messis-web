-- duplicate_team (pgTAP, D81): the copy is complete, shares no ids with the source, and changing
-- the copy never touches the source. Admin only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

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
  perform pg_temp.login('fb000000-0000-0000-0000-000000000001');
end $$;
-- row counts per team for every copied table, as one text so a single `is` compares them all
create or replace function pg_temp.shape(p_team uuid)
returns text language sql as $$
  select concat_ws('|',
    (select count(*) from public.players p where p.team_id = p_team),
    (select count(*) from public.players p where p.team_id = p_team and p.archived_at is not null),
    (select count(*) from public.player_details d join public.players p on p.id = d.player_id where p.team_id = p_team),
    (select count(*) from public.player_contacts c join public.players p on p.id = c.player_id where p.team_id = p_team),
    (select count(*) from public.player_contacts c join public.players p on p.id = c.player_id where p.team_id = p_team and not c.share_with_team),
    (select count(*) from public.skill_tests t where t.team_id = p_team),
    (select count(*) from public.skill_results r join public.players p on p.id = r.player_id where p.team_id = p_team),
    (select count(*) from public.lineups l where l.team_id = p_team and l.game_id is null),
    (select count(*) from public.lineups l where l.team_id = p_team and l.game_id is not null),
    (select count(*) from public.lineup_slots s join public.lineups l on l.id = s.lineup_id where l.team_id = p_team and s.player_id is not null),
    (select count(*) from public.practices x where x.team_id = p_team),
    (select count(*) from public.games g where g.team_id = p_team),
    (select count(*) from public.game_players gp join public.games g on g.id = gp.game_id where g.team_id = p_team),
    (select count(*) from public.score_events e join public.games g on g.id = e.game_id where g.team_id = p_team),
    (select count(*) from public.stints s join public.games g on g.id = s.game_id where g.team_id = p_team),
    (select coalesce(sum(e.points), 0) from public.score_events e join public.games g on g.id = e.game_id where g.team_id = p_team and e.side = 'us'),
    (select coalesce(sum(s.clock_end - s.clock_start), 0) from public.stints s join public.games g on g.id = s.game_id where g.team_id = p_team)
  );
$$;

select pg_temp.mk_user('fb000000-0000-0000-0000-000000000001', 'admin-dup@test.com');
select pg_temp.mk_user('fb000000-0000-0000-0000-000000000002', 'parent-dup@test.com');
select pg_temp.mk_user('fb000000-0000-0000-0000-000000000003', 'coach-dup@test.com');
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

-- ---------- a source team with everything in it ----------
update public.profiles set is_platform_admin = true where id = 'fb000000-0000-0000-0000-000000000001';
select pg_temp.login('fb000000-0000-0000-0000-000000000001');
insert into ctx select 'src', public.create_team('Source FC', 'soccer', 3, true, 2, '{"ST":"#123456"}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]},
    {"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select public.admin_add_member((select v from ctx where k = 'src'), 'parent-dup@test.com', 'parent');
update public.teams set time_mode = 'clock', clock_periods = 2, period_minutes = 25, timezone = 'America/Denver', parent_stats = 'team'
  where id = (select v from ctx where k = 'src');
insert into public.players (id, team_id, first_name, jersey_number, sort_order, is_available, archived_at) values
  ('eb000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'src'), 'Ann', '1', 1, true, null),
  ('eb000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'src'), 'Bo', '2', 2, true, null),
  ('eb000000-0000-0000-0000-00000000000c', (select v from ctx where k = 'src'), 'Cy', '3', 3, false, null),
  ('eb000000-0000-0000-0000-00000000000d', (select v from ctx where k = 'src'), 'Di', '4', 4, true, null),
  ('eb000000-0000-0000-0000-00000000000e', (select v from ctx where k = 'src'), 'Old', '5', 5, true, now());
insert into public.player_guardians (player_id, user_id, status) values ('eb000000-0000-0000-0000-00000000000a', 'fb000000-0000-0000-0000-000000000002', 'approved');
insert into public.player_details (player_id, birthdate, shirt_size) values ('eb000000-0000-0000-0000-00000000000a', '2018-04-05', 'YM');
insert into public.player_contacts (player_id, name, relationship, phone, share_with_team) values
  ('eb000000-0000-0000-0000-00000000000a', 'Pat Parent', 'mother', '+15550100001', true),
  ('eb000000-0000-0000-0000-00000000000b', 'Quinn Parent', 'father', '+15550100002', false);
insert into public.skill_results (player_id, skill_test_id, value)
  select 'eb000000-0000-0000-0000-00000000000a', t.id, 12 from public.skill_tests t where t.team_id = (select v from ctx where k = 'src') limit 1;
select public.save_lineups((select v from ctx where k = 'src'), null,
  '[{"period_index":0,"formation_name":"1-1","bench_order":["eb000000-0000-0000-0000-00000000000d"],
     "slots":[{"position_role":"ST","position_code":"ST","player_id":"eb000000-0000-0000-0000-00000000000a"},{"position_role":"DEF","position_code":"SW","player_id":"eb000000-0000-0000-0000-00000000000b"},{"position_role":"GK","position_code":"GK","player_id":null}]},
    {"period_index":1,"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST","player_id":"eb000000-0000-0000-0000-00000000000a"},{"position_role":"DEF","position_code":"SW","player_id":"eb000000-0000-0000-0000-00000000000b"},{"position_role":"GK","position_code":"GK","player_id":null}]}]'::jsonb);
insert into public.practices (team_id, season_id, practice_date, start_time, location) values
  ((select v from ctx where k = 'src'), (select id from public.seasons where team_id = (select v from ctx where k = 'src')), '2026-11-20', '17:00', 'Park');
insert into public.games (id, team_id, season_id, opponent, start_time, location, address, home_away, parent_notes) values
  ('ab000000-0000-0000-0000-000000000001', (select v from ctx where k = 'src'), (select id from public.seasons where team_id = (select v from ctx where k = 'src')), 'Bears', '09:30', 'Field 2', '1 Example Way', 'home', 'Wear white'),
  ('ab000000-0000-0000-0000-000000000002', (select v from ctx where k = 'src'), (select id from public.seasons where team_id = (select v from ctx where k = 'src')), 'Owls', null, null, null, null, null);
-- a finished clock game with a sub, a goal and stints
select public.start_game('ab000000-0000-0000-0000-000000000001');
select public.clock_start('ab000000-0000-0000-0000-000000000001');
select pg_temp.pass('ab000000-0000-0000-0000-000000000001', 300);
select public.clock_sub('ab000000-0000-0000-0000-000000000001', 'eb000000-0000-0000-0000-00000000000a', 'eb000000-0000-0000-0000-00000000000d');
insert into public.score_events (game_id, side, period_index, event_type, scorer_player_id, assist_player_id)
  values ('ab000000-0000-0000-0000-000000000001', 'us', 0, 'goal', 'eb000000-0000-0000-0000-00000000000b', 'eb000000-0000-0000-0000-00000000000d');
select pg_temp.pass('ab000000-0000-0000-0000-000000000001', 300);
select public.finish_game('ab000000-0000-0000-0000-000000000001');
insert into public.board_posts (team_id, author_id, body) values ((select v from ctx where k = 'src'), 'fb000000-0000-0000-0000-000000000001', 'hello');
select pg_temp.logout();

-- ---------- only a platform admin ----------
select pg_temp.login('fb000000-0000-0000-0000-000000000003');
select throws_ok($$select public.duplicate_team((select v from ctx where k = 'src'), 'Nope')$$, '42501', null, 'a non-admin cannot duplicate a team');
select pg_temp.logout();

-- ---------- the copy ----------
select pg_temp.login('fb000000-0000-0000-0000-000000000001');
insert into ctx select 'copy', public.duplicate_team((select v from ctx where k = 'src'), 'Copy FC');
select isnt((select v from ctx where k = 'copy'), (select v from ctx where k = 'src'), 'a new team id');
select is(pg_temp.shape((select v from ctx where k = 'copy')), pg_temp.shape((select v from ctx where k = 'src')),
  'every copied table has the same rows (players incl. archived, details, contacts incl. private, tests, results, template and game lineups, filled slots, practices, games, snapshots, score events, stints, points, seconds)');
select is((select name || '|' || sport || '|' || side_size || '|' || has_gk || '|' || periods_count || '|' || colors::text || '|' || timezone || '|' || parent_stats || '|' || time_mode || '|' || clock_periods || '|' || period_minutes
           from public.teams where id = (select v from ctx where k = 'copy')),
  'Copy FC|soccer|3|true|2|{"ST": "#123456"}|America/Denver|team|clock|2|25', 'settings copied, name new');
select is((select owner_id from public.teams where id = (select v from ctx where k = 'copy')), 'fb000000-0000-0000-0000-000000000001', 'the admin owns the copy');
select is((select string_agg(user_id::text || ':' || role || ':' || status, ',') from public.team_members where team_id = (select v from ctx where k = 'copy')),
  'fb000000-0000-0000-0000-000000000001:coach:active', 'the admin is the only member, as coach');
select is((select count(*)::int from public.player_guardians g join public.players p on p.id = g.player_id where p.team_id = (select v from ctx where k = 'copy')), 0, 'guardian links are not copied');
select is((select count(*)::int from public.board_posts where team_id = (select v from ctx where k = 'copy')), 0, 'board posts are not copied');
select is((select count(*)::int from public.clock_ops o join public.games g on g.id = o.game_id where g.team_id = (select v from ctx where k = 'copy')), 0, 'the op log is not copied');
select is((select join_enabled from public.teams where id = (select v from ctx where k = 'copy')), false, 'the copy''s invite link is off');
select isnt((select join_code from public.teams where id = (select v from ctx where k = 'copy')), (select join_code from public.teams where id = (select v from ctx where k = 'src')), 'and its join code is new');
select is((select count(*)::int from public.seasons where team_id = (select v from ctx where k = 'copy') and is_current), 1, 'one current season');
select is((select count(*)::int from public.player_contacts c join public.players p on p.id = c.player_id where p.team_id = (select v from ctx where k = 'copy') and c.user_id is not null), 0, 'contacts carry no account links');

-- ---------- no ids shared ----------
select is((select count(*)::int from public.players a join public.players b on b.id = a.id where a.team_id = (select v from ctx where k = 'src') and b.team_id = (select v from ctx where k = 'copy')), 0, 'no player id is shared');
select is((select count(*)::int from public.games a join public.games b on b.id = a.id where a.team_id = (select v from ctx where k = 'src') and b.team_id = (select v from ctx where k = 'copy')), 0, 'no game id is shared');
select is((select count(*)::int from public.lineup_slots s join public.lineups l on l.id = s.lineup_id join public.players p on p.id = s.player_id
           where l.team_id = (select v from ctx where k = 'copy') and p.team_id <> (select v from ctx where k = 'copy')), 0, 'every lineup slot points at a copied player');
select is((select count(*)::int from public.stints s join public.games g on g.id = s.game_id join public.players p on p.id = s.player_id
           where g.team_id = (select v from ctx where k = 'copy') and p.team_id <> (select v from ctx where k = 'copy')), 0, 'every stint points at a copied player');
select is((select count(*)::int from public.score_events e join public.games g on g.id = e.game_id join public.players p on p.id = e.scorer_player_id
           where g.team_id = (select v from ctx where k = 'copy') and p.team_id <> (select v from ctx where k = 'copy')), 0, 'every scorer points at a copied player');
select is((select count(*)::int from public.skill_results r join public.skill_tests t on t.id = r.skill_test_id join public.players p on p.id = r.player_id
           where p.team_id = (select v from ctx where k = 'copy') and t.team_id <> (select v from ctx where k = 'copy')), 0, 'every result points at a copied test');
select is((select count(*)::int from public.lineups l, unnest(l.bench_order) as b(id) join public.players p on p.id = b.id
           where l.team_id = (select v from ctx where k = 'copy') and p.team_id <> (select v from ctx where k = 'copy')), 0, 'the bench queue is remapped');
select is((select bench_order[1] from public.lineups where team_id = (select v from ctx where k = 'copy') and game_id is null and period_index = 0),
  (select p.id from public.players p where p.team_id = (select v from ctx where k = 'copy') and p.first_name = 'Di'), 'and keeps its order (Di first)');

-- ---------- the copy reads the same stats ----------
select is((select seconds_played from public.player_season_stats((select v from ctx where k = 'copy')) where name = 'Ann'),
          (select seconds_played from public.player_season_stats((select v from ctx where k = 'src')) where name = 'Ann'), 'Ann''s minutes match');
select is((select goals from public.player_season_stats((select v from ctx where k = 'copy')) where name = 'Bo'), 1, 'Bo''s goal is there');
select is((select birthdate::text || '/' || shirt_size from public.player_details d join public.players p on p.id = d.player_id where p.team_id = (select v from ctx where k = 'copy')), '2018-04-05/YM', 'details copied');

-- ---------- changing the copy never touches the source ----------
create temp table before_src as select pg_temp.shape((select v from ctx where k = 'src')) as s;
update public.players set first_name = 'Annie' where team_id = (select v from ctx where k = 'copy') and first_name = 'Ann';
delete from public.stints where game_id in (select id from public.games where team_id = (select v from ctx where k = 'copy'));
insert into public.score_events (game_id, side, period_index, event_type) select id, 'them', 1, 'goal' from public.games where team_id = (select v from ctx where k = 'copy') and status = 'done';
delete from public.player_contacts where player_id in (select id from public.players where team_id = (select v from ctx where k = 'copy'));
update public.teams set name = 'Renamed Copy', period_minutes = 30 where id = (select v from ctx where k = 'copy');
select is(pg_temp.shape((select v from ctx where k = 'src')), (select s from before_src), 'the source''s rows are untouched');
select is((select first_name from public.players where id = 'eb000000-0000-0000-0000-00000000000a'), 'Ann', 'the source player keeps its name');
select is((select name || '|' || period_minutes from public.teams where id = (select v from ctx where k = 'src')), 'Source FC|25', 'the source settings are untouched');
select is((select count(*)::int from public.player_contacts c join public.players p on p.id = c.player_id where p.team_id = (select v from ctx where k = 'src')), 2, 'the source contacts are untouched');

-- ---------- a second copy in the same transaction, and from the SQL editor (no JWT) ----------
insert into ctx select 'copy2', public.duplicate_team((select v from ctx where k = 'src'), 'Copy Two');
select is(pg_temp.shape((select v from ctx where k = 'copy2')), (select s from before_src), 'a second copy is just as complete');
select pg_temp.logout();
select throws_ok($$select public.duplicate_team((select v from ctx where k = 'src'), 'No owner')$$, '22023', null, 'with no signed-in user an owner must be given');
insert into ctx select 'copy3', public.duplicate_team((select v from ctx where k = 'src'), 'Editor Copy', 'fb000000-0000-0000-0000-000000000001');
select is((select owner_id from public.teams where id = (select v from ctx where k = 'copy3')), 'fb000000-0000-0000-0000-000000000001', 'from the SQL editor the given user owns the copy');

select * from finish();
rollback;
