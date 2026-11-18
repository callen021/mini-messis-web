-- At-home Training (pgTAP, D128): a parent records home drills for their own confirmed child only;
-- the date is the server's; coaches and assistant coaches read; other parents see nothing.
begin;
create extension if not exists pgtap with schema extensions;
select plan(79);

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

-- 1 coach · 2 assistant · 3 parent (confirmed, child A) · 4 other parent (confirmed, child B)
-- 5 parent with an unconfirmed link to child A · 6 another team's coach · 7 platform admin
select pg_temp.mk_user('d6000000-0000-0000-0000-000000000001', 'coach-tr@test.com');
select pg_temp.mk_user('d6000000-0000-0000-0000-000000000002', 'assistant-tr@test.com');
select pg_temp.mk_user('d6000000-0000-0000-0000-000000000003', 'parent-tr@test.com');
select pg_temp.mk_user('d6000000-0000-0000-0000-000000000004', 'parent2-tr@test.com');
select pg_temp.mk_user('d6000000-0000-0000-0000-000000000005', 'pending-tr@test.com');
select pg_temp.mk_user('d6000000-0000-0000-0000-000000000006', 'other-coach-tr@test.com');
select pg_temp.mk_user('d6000000-0000-0000-0000-000000000007', 'admin-tr@test.com');
update public.profiles set is_platform_admin = true where id = 'd6000000-0000-0000-0000-000000000007';
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

select pg_temp.login('d6000000-0000-0000-0000-000000000007');
insert into ctx select 'team', public.create_team('Training FC', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
insert into ctx select 'other', public.create_team('Other Training FC', 'soccer', 3, true, 1, '{}'::jsonb,
  '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select public.admin_add_member((select v from ctx where k = 'team'), 'coach-tr@test.com', 'coach');
select public.admin_add_member((select v from ctx where k = 'team'), 'assistant-tr@test.com', 'assistant');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-tr@test.com', 'parent');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent2-tr@test.com', 'parent');
select public.admin_add_member((select v from ctx where k = 'team'), 'pending-tr@test.com', 'parent');
select public.admin_add_member((select v from ctx where k = 'other'), 'other-coach-tr@test.com', 'coach');
select pg_temp.logout();

insert into public.players (id, team_id, first_name) values
  ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'team'), 'Kid A'),
  ('e6000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'team'), 'Kid B');
insert into public.player_guardians (player_id, user_id, status) values
  ('e6000000-0000-0000-0000-00000000000a', 'd6000000-0000-0000-0000-000000000003', 'approved'),
  ('e6000000-0000-0000-0000-00000000000b', 'd6000000-0000-0000-0000-000000000004', 'approved'),
  ('e6000000-0000-0000-0000-00000000000a', 'd6000000-0000-0000-0000-000000000005', 'pending');
insert into ctx select 'taps', id from public.library_items where slug = 'toe-taps';
insert into ctx select 'rolls', id from public.library_items where slug = 'sole-rolls';
insert into ctx select 'cones', id from public.library_items where slug = 'cone-dribbling';
insert into ctx select 'touch', id from public.library_items where slug = 'first-touch';

-- ---------- the parent records for their own child ----------
select pg_temp.login('d6000000-0000-0000-0000-000000000003');
select lives_ok($$insert into public.home_drill_completions (player_id, item_id, level, mode, done_on, recorded_by) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 2, 'solo', '2020-01-01', 'd6000000-0000-0000-0000-000000000001')$$, 'a parent marks a drill Done for their child');
select is((select done_on from public.home_drill_completions where player_id = 'e6000000-0000-0000-0000-00000000000a'), public.team_today((select v from ctx where k = 'team')), 'the date is today where the team plays, whatever the device sent');
select is((select recorded_by from public.home_drill_completions where player_id = 'e6000000-0000-0000-0000-00000000000a'), 'd6000000-0000-0000-0000-000000000003', 'and the author is the caller');
select is((select level::text || '/' || mode from public.home_drill_completions where player_id = 'e6000000-0000-0000-0000-00000000000a'), '2/solo', 'with the level and the mode');
select throws_ok($$insert into public.home_drill_completions (player_id, item_id, level, mode) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 1, 'parent')$$, '23505', null, 'the same drill counts once a day');
select throws_ok($$insert into public.home_drill_completions (player_id, item_id, level, mode) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'rolls'), 4, 'parent')$$, '23514', null, 'there are three levels');
select throws_ok($$insert into public.home_drill_completions (player_id, item_id, level, mode) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'touch'), 1, 'parent')$$, '23514', null, 'only an at-home drill can be marked Done');
select throws_ok($$insert into public.home_drill_completions (player_id, item_id, level, mode) values ('e6000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'taps'), 1, 'parent')$$, '42501', null, 'a parent cannot record for another child');
select throws_ok($$update public.home_drill_completions set level = 3 where player_id = 'e6000000-0000-0000-0000-00000000000a'$$, '42501', null, 'nobody edits a completion');
select pg_temp.logout();

-- ---------- who else may write: nobody ----------
select pg_temp.login('d6000000-0000-0000-0000-000000000005');
select throws_ok($$insert into public.home_drill_completions (player_id, item_id, level, mode) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'rolls'), 1, 'parent')$$, '42501', null, 'an unconfirmed parent cannot record');
select is((select count(*)::int from public.home_drill_completions), 0, 'and sees nothing');
select pg_temp.logout();
select pg_temp.login('d6000000-0000-0000-0000-000000000001');
select throws_ok($$insert into public.home_drill_completions (player_id, item_id, level, mode) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'rolls'), 1, 'parent')$$, '42501', null, 'a coach does not record home drills');
select is((select count(*)::int from public.home_drill_completions where player_id = 'e6000000-0000-0000-0000-00000000000a'), 1, 'the coach reads the child''s completions');
delete from public.home_drill_completions where player_id = 'e6000000-0000-0000-0000-00000000000a';
select pg_temp.logout();
select pg_temp.login('d6000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.home_drill_completions where player_id = 'e6000000-0000-0000-0000-00000000000a'), 1, 'so does the assistant coach, and the coach''s delete removed nothing');
select pg_temp.logout();

-- ---------- other parents and other teams see nothing ----------
select pg_temp.login('d6000000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.home_drill_completions), 0, 'another parent on the team sees nothing');
delete from public.home_drill_completions where player_id = 'e6000000-0000-0000-0000-00000000000a';
select pg_temp.logout();
select pg_temp.login('d6000000-0000-0000-0000-000000000006');
select is((select count(*)::int from public.home_drill_completions), 0, 'another team''s coach sees nothing');
select pg_temp.logout();

-- ---------- undo: the same day, by the parent who recorded it ----------
insert into public.home_drill_completions (player_id, item_id, level, mode) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'rolls'), 1, 'parent');
update public.home_drill_completions set done_on = done_on - 1, recorded_by = 'd6000000-0000-0000-0000-000000000003'
 where item_id = (select v from ctx where k = 'rolls');
select pg_temp.login('d6000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.home_drill_completions where player_id = 'e6000000-0000-0000-0000-00000000000a'), 2, 'the parent sees both days');
delete from public.home_drill_completions where item_id = (select v from ctx where k = 'rolls');
select is((select count(*)::int from public.home_drill_completions where player_id = 'e6000000-0000-0000-0000-00000000000a'), 2, 'yesterday''s Done cannot be taken back');
delete from public.home_drill_completions where item_id = (select v from ctx where k = 'taps');
select is((select count(*)::int from public.home_drill_completions where player_id = 'e6000000-0000-0000-0000-00000000000a'), 1, 'today''s can');
select pg_temp.logout();

-- ---------- stopwatch times on Cone Dribbling (D129) ----------
select pg_temp.login('d6000000-0000-0000-0000-000000000003');
select lives_ok($$insert into public.home_drill_times (player_id, item_id, level, seconds, run_on) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'cones'), 2, 12.34, '2020-01-01')$$, 'a parent saves a clean run');
select is((select seconds::text || '/' || level || '/' || (run_on = public.team_today((select v from ctx where k = 'team')))::text from public.home_drill_times where player_id = 'e6000000-0000-0000-0000-00000000000a'), '12.3/2/true', 'kept to a tenth of a second, at its level, dated today');
select is((select level::text || '/' || mode from public.home_drill_completions where player_id = 'e6000000-0000-0000-0000-00000000000a' and item_id = (select v from ctx where k = 'cones') and done_on = public.team_today((select v from ctx where k = 'team'))), '2/parent', 'saving a clean run marks the drill Done for the day');
select lives_ok($$insert into public.home_drill_times (player_id, item_id, level, seconds) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'cones'), 2, 11.9), ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'cones'), 1, 15)$$, 'more runs the same day are saved too');
select is((select count(*)::int from public.home_drill_completions where player_id = 'e6000000-0000-0000-0000-00000000000a' and item_id = (select v from ctx where k = 'cones')), 1, 'and the drill is still Done once');
select is((select string_agg(level || ':' || best, ' ' order by level) from (select level, min(seconds) as best from public.home_drill_times where player_id = 'e6000000-0000-0000-0000-00000000000a' group by level) b), '1:15.0 2:11.9', 'the personal best is the lowest time per level');
select throws_ok($$insert into public.home_drill_times (player_id, item_id, level, seconds) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'rolls'), 1, 10)$$, '23514', null, 'only the timed drill takes a time');
select throws_ok($$insert into public.home_drill_times (player_id, item_id, level, seconds) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'cones'), 1, 0)$$, '23514', null, 'a time is more than zero');
select throws_ok($$insert into public.home_drill_times (player_id, item_id, level, seconds) values ('e6000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'cones'), 1, 9)$$, '42501', null, 'a parent cannot save a time for another child');
select throws_ok($$update public.home_drill_times set seconds = 1 where player_id = 'e6000000-0000-0000-0000-00000000000a'$$, '42501', null, 'nobody edits a time');
select pg_temp.logout();
select pg_temp.login('d6000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.home_drill_times where player_id = 'e6000000-0000-0000-0000-00000000000a'), 3, 'the coach reads the child''s times');
select throws_ok($$insert into public.home_drill_times (player_id, item_id, level, seconds) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'cones'), 1, 9)$$, '42501', null, 'and does not save one');
select pg_temp.logout();
select pg_temp.login('d6000000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.home_drill_times), 0, 'another parent sees no times');
select pg_temp.logout();

-- ---------- the streak count (D130). 2 March 2026 is a Monday. ----------
select is((select current_streak || '/' || longest_streak || '/' || misses from public.streak_from_days(array['2026-03-02','2026-03-03','2026-03-04']::date[], '2026-03-04')), '3/3/0', 'one a day counts one a day');
select is((select current_streak || '/' || longest_streak || '/' || misses from public.streak_from_days(array['2026-03-02','2026-03-03']::date[], '2026-03-04')), '2/2/0', 'today is not a miss until it is over');
select is((select current_streak || '/' || longest_streak || '/' || misses from public.streak_from_days(array['2026-03-02','2026-03-03','2026-03-06','2026-03-07','2026-03-08']::date[], '2026-03-08')), '5/5/2', 'two missed days in a week do not break it');
select is((select current_streak || '/' || longest_streak || '/' || misses from public.streak_from_days(array['2026-03-02','2026-03-03','2026-03-04','2026-03-08']::date[], '2026-03-08')), '1/3/3', 'the third missed day in a week resets it');
select is((select current_streak || '/' || longest_streak || '/' || misses from public.streak_from_days(array['2026-03-02','2026-03-05','2026-03-07','2026-03-08']::date[], '2026-03-08')), '2/2/3', 'three misses in a week reset it even when they are apart: two days since count');
select is((select current_streak || '/' || longest_streak || '/' || misses from public.streak_from_days(array['2026-03-02','2026-03-03','2026-03-04','2026-03-05','2026-03-06','2026-03-10']::date[], '2026-03-10')), '1/5/1', 'three missed days in a row reset it across a week boundary');
select is((select current_streak || '/' || longest_streak || '/' || misses from public.streak_from_days(array['2026-03-02','2026-03-03','2026-03-04','2026-03-05','2026-03-06','2026-03-07','2026-03-10']::date[], '2026-03-10')), '7/7/1', 'two in a row across the boundary do not');
select is((select current_streak || '/' || longest_streak || '/' || misses from public.streak_from_days(array['2026-03-02','2026-03-03','2026-03-04','2026-03-05','2026-03-06','2026-03-09','2026-03-10']::date[], '2026-03-10')), '7/7/0', 'a weekend off is two days off');
select is((select current_streak || '/' || longest_streak || '/' || misses from public.streak_from_days(array['2026-03-02','2026-03-03','2026-03-04']::date[], '2026-03-09')), '0/3/0', 'a stopped streak reads zero and the longest is kept');
select is((select current_streak || '/' || longest_streak from public.streak_from_days('{}'::date[], '2026-03-04')), '0/0', 'nothing done is no streak');

-- ---------- what makes a day count ----------
-- Kid A so far: one home drill dated yesterday, Cone Dribbling done today.
select pg_temp.login('d6000000-0000-0000-0000-000000000003');
select is((select current_streak || '/' || longest_streak || '/' || today_counts from public.training_streak('e6000000-0000-0000-0000-00000000000a')), '2/2/true', 'home drills on two days are a two-day streak');
select pg_temp.logout();
select is((select longest_streak from public.player_training where player_id = 'e6000000-0000-0000-0000-00000000000a'), 2, 'the longest streak is stored');

-- a game two days ago: on the schedule only, then started with the child in the lineup
insert into public.games (id, team_id, season_id, opponent, game_date, status)
select 'a6000000-0000-0000-0000-000000000001', t.v, s.id, 'Rivals', public.team_today(t.v) - 2, 'upcoming'
  from ctx t join public.seasons s on s.team_id = t.v and s.is_current where t.k = 'team';
insert into public.lineups (id, team_id, game_id, period_index, formation_name)
select 'a6000000-0000-0000-0000-000000000002', v, 'a6000000-0000-0000-0000-000000000001', 0, '1-1' from ctx where k = 'team';
insert into public.lineup_slots (lineup_id, slot_index, position_role, position_code, player_id)
values ('a6000000-0000-0000-0000-000000000002', 0, 'ST', 'ST', 'e6000000-0000-0000-0000-00000000000a');
select pg_temp.login('d6000000-0000-0000-0000-000000000003');
select is((select current_streak from public.training_streak('e6000000-0000-0000-0000-00000000000a')), 2, 'a game that was never started does not count');
select pg_temp.logout();
update public.games set status = 'done' where id = 'a6000000-0000-0000-0000-000000000001';
select pg_temp.login('d6000000-0000-0000-0000-000000000003');
select is((select current_streak from public.training_streak('e6000000-0000-0000-0000-00000000000a')), 3, 'a played game counts its day');
select is((select current_streak from public.training_streak('e6000000-0000-0000-0000-00000000000a')), 3, 'reading the streak again adds nothing');
select pg_temp.logout();
update public.lineup_slots set player_id = 'e6000000-0000-0000-0000-00000000000b' where lineup_id = 'a6000000-0000-0000-0000-000000000002';
select pg_temp.login('d6000000-0000-0000-0000-000000000003');
select is((select current_streak from public.training_streak('e6000000-0000-0000-0000-00000000000a')), 2, 'a game the child did not play in does not count');
select pg_temp.logout();

-- ---------- "We went" ----------
insert into public.practices (id, team_id, season_id, practice_date, start_time, status)
select x.id::uuid, t.v, s.id, public.team_today(t.v) + x.day, x.start::time, x.status::public.practice_status
  from ctx t join public.seasons s on s.team_id = t.v and s.is_current,
       (values ('b6000000-0000-0000-0000-000000000001', -2, '09:00', 'scheduled'),
               ('b6000000-0000-0000-0000-000000000002', 1, '09:00', 'scheduled'),
               ('b6000000-0000-0000-0000-000000000003', -3, '09:00', 'cancelled'),
               ('b6000000-0000-0000-0000-000000000004', -3, null, 'scheduled')) as x(id, day, start, status)
 where t.k = 'team';
insert into public.practices (id, team_id, season_id, practice_date, status)
select 'b6000000-0000-0000-0000-000000000009', t.v, s.id, public.team_today(t.v) - 1, 'scheduled'
  from ctx t join public.seasons s on s.team_id = t.v and s.is_current where t.k = 'other';

select pg_temp.login('d6000000-0000-0000-0000-000000000003');
select is((select current_streak from public.training_streak('e6000000-0000-0000-0000-00000000000a')), 2, 'a practice on the schedule does not count by itself');
select throws_ok($$select public.set_practice_went('b6000000-0000-0000-0000-000000000002', 'e6000000-0000-0000-0000-00000000000a')$$, 'P0005', null, '"We went" is not offered before the practice starts');
select throws_ok($$select public.set_practice_went('b6000000-0000-0000-0000-000000000003', 'e6000000-0000-0000-0000-00000000000a')$$, 'P0005', null, 'nor for a cancelled practice');
select throws_ok($$select public.set_practice_went('b6000000-0000-0000-0000-000000000009', 'e6000000-0000-0000-0000-00000000000a')$$, '22023', null, 'nor for another team''s practice');
select throws_ok($$select public.set_practice_went('b6000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-00000000000b')$$, '42501', null, 'nor for another child');
select throws_ok($$insert into public.practice_checkins (practice_id, player_id) values ('b6000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-00000000000a')$$, '42501', null, 'the table is not written directly');
select lives_ok($$select public.set_practice_went('b6000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-00000000000a')$$, 'a parent marks "We went" after the start');
select is((select current_streak from public.training_streak('e6000000-0000-0000-0000-00000000000a')), 3, 'and that practice day counts');
select lives_ok($$select public.set_practice_went('b6000000-0000-0000-0000-000000000004', 'e6000000-0000-0000-0000-00000000000a')$$, 'a practice with no start time opens on its date');
select is((select current_streak from public.training_streak('e6000000-0000-0000-0000-00000000000a')), 4, 'four days in a row now');
select lives_ok($$select public.set_practice_went('b6000000-0000-0000-0000-000000000004', 'e6000000-0000-0000-0000-00000000000a', false)$$, 'it can be taken back the same day');
select is((select current_streak from public.training_streak('e6000000-0000-0000-0000-00000000000a')), 3, 'and the day no longer counts');
select pg_temp.logout();
update public.practice_checkins set created_at = created_at - interval '2 days' where practice_id = 'b6000000-0000-0000-0000-000000000001';
select pg_temp.login('d6000000-0000-0000-0000-000000000003');
select throws_ok($$select public.set_practice_went('b6000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-00000000000a', false)$$, 'P0005', null, 'but not on a later day');
select pg_temp.logout();
select pg_temp.login('d6000000-0000-0000-0000-000000000001');
select throws_ok($$select public.set_practice_went('b6000000-0000-0000-0000-000000000004', 'e6000000-0000-0000-0000-00000000000a')$$, '42501', null, 'a coach does not mark "We went"');
select is((select count(*)::int from public.practice_checkins where player_id = 'e6000000-0000-0000-0000-00000000000a'), 1, 'the coach sees the parent''s mark');
select pg_temp.logout();

-- ---------- who sees the streak ----------
select pg_temp.login('d6000000-0000-0000-0000-000000000001');
select is((select current_streak || '/' || coalesce(celebrate::text, '-') from public.training_streak('e6000000-0000-0000-0000-00000000000a')), '3/-', 'the coach sees the child''s streak');
select pg_temp.logout();
select pg_temp.login('d6000000-0000-0000-0000-000000000002');
select is((select current_streak from public.training_streak('e6000000-0000-0000-0000-00000000000a')), 3, 'so does the assistant coach');
select pg_temp.logout();
select pg_temp.login('d6000000-0000-0000-0000-000000000004');
select throws_ok($$select * from public.training_streak('e6000000-0000-0000-0000-00000000000a')$$, '42501', null, 'another parent does not');
select is((select count(*)::int from public.player_training), 0, 'nor the stored longest streak');
select is((select count(*)::int from public.practice_checkins), 0, 'nor the "We went" marks');
select pg_temp.logout();
select pg_temp.login('d6000000-0000-0000-0000-000000000005');
select throws_ok($$select * from public.training_streak('e6000000-0000-0000-0000-00000000000a')$$, '42501', null, 'an unconfirmed parent does not');
select pg_temp.logout();
select pg_temp.login('d6000000-0000-0000-0000-000000000006');
select throws_ok($$select * from public.training_streak('e6000000-0000-0000-0000-00000000000a')$$, '42501', null, 'another team''s coach does not');
select pg_temp.logout();

-- ---------- milestones: each celebrated once ----------
select pg_temp.login('d6000000-0000-0000-0000-000000000003');
select throws_ok($$select public.celebrate_training_milestone('e6000000-0000-0000-0000-00000000000a', 5)$$, '22023', null, 'a milestone not reached cannot be celebrated');
select pg_temp.logout();
-- five days running: a home drill on each of the two days before the practice
insert into public.home_drill_completions (player_id, item_id, level, mode) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 1, 'parent');
insert into public.home_drill_completions (player_id, item_id, level, mode) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'cones'), 1, 'parent') on conflict do nothing;
update public.home_drill_completions set done_on = public.team_today((select v from ctx where k = 'team')) - 3 where player_id = 'e6000000-0000-0000-0000-00000000000a' and item_id = (select v from ctx where k = 'taps');
insert into public.home_drill_completions (player_id, item_id, level, mode) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 1, 'parent');
update public.home_drill_completions set done_on = public.team_today((select v from ctx where k = 'team')) - 4 where player_id = 'e6000000-0000-0000-0000-00000000000a' and item_id = (select v from ctx where k = 'taps') and done_on = public.team_today((select v from ctx where k = 'team'));
select pg_temp.login('d6000000-0000-0000-0000-000000000001');
select is((select current_streak || '/' || coalesce(celebrate::text, '-') from public.training_streak('e6000000-0000-0000-0000-00000000000a')), '5/-', 'five days: the coach is told of no celebration');
select pg_temp.logout();
select pg_temp.login('d6000000-0000-0000-0000-000000000003');
select is((select current_streak || '/' || celebrate from public.training_streak('e6000000-0000-0000-0000-00000000000a')), '5/5', 'the parent is told of the five-day milestone');
select lives_ok($$select public.celebrate_training_milestone('e6000000-0000-0000-0000-00000000000a', 5)$$, 'and celebrates it');
select is((select coalesce(celebrate::text, '-') from public.training_streak('e6000000-0000-0000-0000-00000000000a')), '-', 'once');
select throws_ok($$select public.celebrate_training_milestone('e6000000-0000-0000-0000-00000000000a', 7)$$, '22023', null, 'seven days is not a milestone');
select throws_ok($$update public.player_training set longest_streak = 100 where player_id = 'e6000000-0000-0000-0000-00000000000a'$$, '42501', null, 'the stored streak is not written directly');
select pg_temp.logout();
select is((select longest_streak::text || '/' || milestones::text from public.player_training where player_id = 'e6000000-0000-0000-0000-00000000000a'), '5/{5}', 'the longest streak and the celebrated milestone are stored');

-- ---------- a child who left the roster ----------
update public.players set archived_at = now() where id = 'e6000000-0000-0000-0000-00000000000a';
select pg_temp.login('d6000000-0000-0000-0000-000000000003');
select throws_ok($$insert into public.home_drill_completions (player_id, item_id, level, mode) values ('e6000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 1, 'parent')$$, '42501', null, 'nothing is recorded for a player off the roster');
select pg_temp.logout();

select * from finish();
rollback;
