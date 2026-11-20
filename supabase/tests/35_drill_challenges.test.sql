-- Drill challenges (pgTAP, D140): a recorded score is an attempt; the server decides a record (a tie
-- is not one), the day's first score is the Done, a score that meets the target at the child's
-- level unlocks the next; bests per child, drill and level; old five-cone times never count.
begin;
create extension if not exists pgtap with schema extensions;
select plan(62);

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

-- 1 coach · 3 parent of child A · 4 parent of child B · 5 a second confirmed parent of child A · 7 platform admin
select pg_temp.mk_user('da000000-0000-0000-0000-000000000001', 'coach-ch@test.com');
select pg_temp.mk_user('da000000-0000-0000-0000-000000000003', 'parent-ch@test.com');
select pg_temp.mk_user('da000000-0000-0000-0000-000000000004', 'parent2-ch@test.com');
select pg_temp.mk_user('da000000-0000-0000-0000-000000000005', 'parent3-ch@test.com');
select pg_temp.mk_user('da000000-0000-0000-0000-000000000007', 'admin-ch@test.com');
update public.profiles set is_platform_admin = true where id = 'da000000-0000-0000-0000-000000000007';
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;
select pg_temp.login('da000000-0000-0000-0000-000000000007');
insert into ctx select 'team', public.create_team('Challenge FC', 'soccer', 3, true, 1, '{}'::jsonb, '[{"formation_name":"1-1","slots":[{"position_role":"ST","position_code":"ST"},{"position_role":"DEF","position_code":"SW"},{"position_role":"GK","position_code":"GK"}]}]'::jsonb);
select public.admin_add_member((select v from ctx where k = 'team'), 'coach-ch@test.com', 'coach');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent-ch@test.com', 'parent');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent2-ch@test.com', 'parent');
select public.admin_add_member((select v from ctx where k = 'team'), 'parent3-ch@test.com', 'parent');
select pg_temp.logout();
insert into public.players (id, team_id, first_name) values ('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'team'), 'Kid A'), ('ea000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'team'), 'Kid B');
insert into public.player_guardians (player_id, user_id, status) values ('ea000000-0000-0000-0000-00000000000a', 'da000000-0000-0000-0000-000000000003', 'approved'), ('ea000000-0000-0000-0000-00000000000b', 'da000000-0000-0000-0000-000000000004', 'approved'), ('ea000000-0000-0000-0000-00000000000a', 'da000000-0000-0000-0000-000000000005', 'approved');
insert into ctx select 'taps', id from public.library_items where slug = 'toe-taps';
insert into ctx select 'rolls', id from public.library_items where slug = 'sole-rolls';
insert into ctx select 'cones', id from public.library_items where slug = 'cone-dribbling';
insert into ctx select 'touch', id from public.library_items where slug = 'first-touch';

-- ---------- the content: a challenge per level, a target on Levels 1 and 2 only ----------
select is((select count(*)::int from public.library_items i, jsonb_array_elements(i.content #> '{home,levels}') l where i.category = 'home' and l #>> '{challenge,mode}' in ('timer', 'stopwatch') and l ->> 'parent_job' <> ''), 30, 'all thirty levels have a challenge and a parent''s job');
select is((select string_agg(distinct i.slug, ',') from public.library_items i, jsonb_array_elements(i.content #> '{home,levels}') l where l #>> '{challenge,mode}' = 'stopwatch'), 'cone-dribbling', 'only Cone Dribbling is a stopwatch course');
select is((select count(*)::int from public.library_items i, jsonb_array_elements(i.content #> '{home,levels}') with ordinality l(v, n) where i.category = 'home' and (l.v #> '{challenge,target}' is not null) = (l.n < 3)), 30, 'Levels 1 and 2 have a target, Level 3 has none');
select is((select count(*)::int from public.library_items i, jsonb_array_elements(i.content #> '{home,levels}') l where i.category = 'home' and l #>> '{challenge,mode}' = 'timer' and (l #>> '{challenge,seconds}')::int = 60 and l ->> 'text' ~ 'Count every'), 27, 'every timer level runs 60 seconds and says what one count is');
select is((select count(*)::int from public.library_items i, jsonb_array_elements(i.content #> '{home,levels}') l where i.slug = 'cone-dribbling' and l ->> 'text' like '%4 cones set about 3 yards apart, down and back%'), 3, 'Cone Dribbling is four cones about 3 yards apart at every level');
select is((select content #>> '{home,levels,0,challenge,target}' || '/' || (content #>> '{home,levels,1,challenge,target}') from public.library_items where slug = 'cone-dribbling'), '10.0/8.0', 'with 10.0 and 8.0 seconds to beat');
select is((select jsonb_array_length(content #> '{home,diagram,elements}') from public.library_items where slug = 'cone-dribbling'), 7, 'and a diagram of the course');

-- ---------- a timer score: saved, the day's first is the Done, a tie is not a record ----------
select pg_temp.login('da000000-0000-0000-0000-000000000003');
select lives_ok($$insert into ctx select 't1', public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 1, 12, null);$$, 'a parent records a score');
select is((select kind || '/' || reps || '/' || is_record || '/' || coalesce(previous_best_reps::text, 'none') || '/' || coalesce(unlocked_level::text, 'none') || '/' || (done_on = public.team_today((select v from ctx where k = 'team'))) || '/' || (recorded_by = 'da000000-0000-0000-0000-000000000003') from public.home_drill_attempts where id = (select v from ctx where k = 't1')), 'reps/12/false/none/none/true/true', 'kept with its level, dated today, by the caller; a first score is not a record');
select is((select level::text || '/' || mode from public.home_drill_completions where player_id = 'ea000000-0000-0000-0000-00000000000a' and item_id = (select v from ctx where k = 'taps')), '1/parent', 'the first score of the day marks the drill Done');
select lives_ok($$insert into ctx select 'r1', public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'rolls'), 1, 0, null);$$, 'a score of zero is recorded');
select is((select count(*)::int from public.home_drill_completions where player_id = 'ea000000-0000-0000-0000-00000000000a' and item_id = (select v from ctx where k = 'rolls')), 1, 'and counts as Done');
select is((select today_counts from public.training_streak('ea000000-0000-0000-0000-00000000000a')), true, 'so today counts toward the streak');
insert into ctx select 't2', public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 1, 12, null);
select is((select is_record || '/' || previous_best_reps from public.home_drill_attempts where id = (select v from ctx where k = 't2')), 'false/12', 'a tie is not a new record');
insert into ctx select 't3', public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 1, 13, null);
select is((select is_record || '/' || previous_best_reps from public.home_drill_attempts where id = (select v from ctx where k = 't3')), 'true/12', 'one more is');
select is((select count(*)::int from public.home_drill_completions where player_id = 'ea000000-0000-0000-0000-00000000000a' and item_id = (select v from ctx where k = 'taps')), 1, 'every attempt is saved, and the drill is Done once');
select is((select best_reps || '/' || attempts from public.home_drill_bests('ea000000-0000-0000-0000-00000000000a') where item_id = (select v from ctx where k = 'taps') and level = 1), '13/3', 'the personal best is the most reps at the level');

-- ---------- the target unlocks the next level, from the child's current level only ----------
select is((select level from public.home_drill_levels('ea000000-0000-0000-0000-00000000000a') where item_id = (select v from ctx where k = 'taps')), 1, 'below the target the child stays on Level 1');
insert into ctx select 't4', public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 1, 39, null);
select is((select coalesce(unlocked_level::text, 'none') from public.home_drill_attempts where id = (select v from ctx where k = 't4')), 'none', 'one short of the target unlocks nothing');
insert into ctx select 't5', public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 1, 40, null);
select is((select unlocked_level from public.home_drill_attempts where id = (select v from ctx where k = 't5')), 2, 'meeting the target unlocks Level 2');
select is((select level from public.home_drill_levels('ea000000-0000-0000-0000-00000000000a') where item_id = (select v from ctx where k = 'taps')), 2, 'and the child is on it');
insert into ctx select 't6', public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 1, 55, null);
select is((select coalesce(unlocked_level::text, 'none') from public.home_drill_attempts where id = (select v from ctx where k = 't6')) || '/' || (select level from public.home_drill_levels('ea000000-0000-0000-0000-00000000000a') where item_id = (select v from ctx where k = 'taps')), 'none/2', 'a score at a level the child has left unlocks nothing');
insert into ctx select 't7', public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 2, 70, null);
select is((select unlocked_level from public.home_drill_attempts where id = (select v from ctx where k = 't7')) || '/' || (select level from public.home_drill_levels('ea000000-0000-0000-0000-00000000000a') where item_id = (select v from ctx where k = 'taps')), '3/3', 'the Level 2 target unlocks Level 3');
insert into ctx select 't8', public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 3, 999, null);
select is((select coalesce(unlocked_level::text, 'none') from public.home_drill_attempts where id = (select v from ctx where k = 't8')) || '/' || (select level from public.home_drill_levels('ea000000-0000-0000-0000-00000000000a') where item_id = (select v from ctx where k = 'taps')), 'none/3', 'Level 3 has no target');
select public.set_home_drill_level('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 1);
select is((select level from public.home_drill_levels('ea000000-0000-0000-0000-00000000000a') where item_id = (select v from ctx where k = 'taps')), 1, 'a parent can still set the level');
select is((select best_reps from public.home_drill_bests('ea000000-0000-0000-0000-00000000000a') where item_id = (select v from ctx where k = 'taps') and level = 1), 55, 'bests are kept per level');

-- ---------- a stopwatch score: less is better ----------
insert into ctx select 'c1', public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'cones'), 1, null, 12.344);
select is((select kind || '/' || seconds || '/' || is_record from public.home_drill_attempts where id = (select v from ctx where k = 'c1')), 'time/12.34/false', 'a time is kept to a hundredth');
insert into ctx select 'c2', public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'cones'), 1, null, 12.34);
select is((select is_record from public.home_drill_attempts where id = (select v from ctx where k = 'c2')), false, 'the same time is a tie, not a record');
insert into ctx select 'c3', public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'cones'), 1, null, 11.2);
select is((select is_record || '/' || previous_best_seconds || '/' || coalesce(unlocked_level::text, 'none') from public.home_drill_attempts where id = (select v from ctx where k = 'c3')), 'true/12.34/none', 'a faster one is a record; over the target it unlocks nothing');
insert into ctx select 'c4', public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'cones'), 1, null, 10.0);
select is((select unlocked_level from public.home_drill_attempts where id = (select v from ctx where k = 'c4')) || '/' || (select level from public.home_drill_levels('ea000000-0000-0000-0000-00000000000a') where item_id = (select v from ctx where k = 'cones')), '2/2', 'a time on the target unlocks Level 2');
select is((select best_seconds from public.home_drill_bests('ea000000-0000-0000-0000-00000000000a') where item_id = (select v from ctx where k = 'cones') and level = 1), 10.00, 'the personal best is the least time');

-- ---------- what is refused ----------
select throws_ok($$select public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'cones'), 1, 5, null)$$, '22023', null, 'reps on a stopwatch level');
select throws_ok($$select public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 1, null, 9.5)$$, '22023', null, 'a time on a timer level');
select throws_ok($$select public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 1, 5, 9.5)$$, '22023', null, 'both at once');
select throws_ok($$select public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 1, -1, null)$$, '22023', null, 'fewer than zero reps');
select throws_ok($$select public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'cones'), 1, null, 0)$$, '22023', null, 'a time of zero');
select throws_ok($$select public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 4, 5, null)$$, '22023', null, 'a fourth level');
select throws_ok($$select public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'touch'), 1, 5, null)$$, '22023', null, 'an item that is not an at-home drill');
select throws_ok($$select public.record_drill_attempt('ea000000-0000-0000-0000-00000000000b', (select v from ctx where k = 'taps'), 1, 5, null)$$, '42501', null, 'another parent''s child');
select throws_ok($$insert into public.home_drill_attempts (player_id, item_id, level, kind, reps, done_on) values ('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 1, 'reps', 500, current_date)$$, '42501', null, 'a row written directly');
select throws_ok($$update public.home_drill_attempts set reps = 500 where id = (select v from ctx where k = 't1')$$, '42501', null, 'an edit');
select throws_ok($$delete from public.home_drill_attempts where id = (select v from ctx where k = 't1')$$, '42501', null, 'a direct delete');
select pg_temp.logout();

-- ---------- old five-cone times: in the history, never a personal best ----------
insert into public.home_drill_attempts (player_id, item_id, level, kind, seconds, done_on, old_course) values ('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'cones'), 1, 'time', 5.9, public.team_today((select v from ctx where k = 'team')) - 30, true);
select pg_temp.login('da000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.home_drill_attempts where player_id = 'ea000000-0000-0000-0000-00000000000a' and old_course), 1, 'the old time is still read');
select is((select best_seconds || '/' || attempts from public.home_drill_bests('ea000000-0000-0000-0000-00000000000a') where item_id = (select v from ctx where k = 'cones') and level = 1), '10.00/4', 'and is not the personal best');
insert into ctx select 'c5', public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'cones'), 1, null, 9.5);
select is((select is_record || '/' || previous_best_seconds from public.home_drill_attempts where id = (select v from ctx where k = 'c5')), 'true/10.00', 'a new time is judged against the four-cone best only');
select pg_temp.logout();

-- ---------- who sees them: the child's parents and the team's coaches ----------
select pg_temp.login('da000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.home_drill_attempts where player_id = 'ea000000-0000-0000-0000-00000000000a'), 15, 'the coach reads the child''s attempts');
select is((select best_reps from public.home_drill_bests('ea000000-0000-0000-0000-00000000000a') where item_id = (select v from ctx where k = 'taps') and level = 2), 70, 'and the bests');
select throws_ok($$select public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 1, 5, null)$$, '42501', null, 'and records none');
select pg_temp.logout();
select pg_temp.login('da000000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.home_drill_attempts), 0, 'another child''s parent sees no attempts');
select throws_ok($$select * from public.home_drill_bests('ea000000-0000-0000-0000-00000000000a')$$, '42501', null, 'and no bests');
select pg_temp.logout();

-- ---------- Delete this score: the parent who recorded it, the same day ----------
select pg_temp.login('da000000-0000-0000-0000-000000000005');
select is((select count(*)::int from public.home_drill_attempts where player_id = 'ea000000-0000-0000-0000-00000000000a'), 15, 'the child''s other parent sees them too');
select throws_ok($$select public.delete_drill_attempt((select v from ctx where k = 't3'))$$, '42501', null, 'but does not delete a score someone else recorded');
select pg_temp.logout();
select pg_temp.login('da000000-0000-0000-0000-000000000003');
select lives_ok($$select public.delete_drill_attempt((select v from ctx where k = 't3'))$$, 'the parent who recorded it deletes it');
select is((select count(*)::int from public.home_drill_attempts where id = (select v from ctx where k = 't3')) || '/' || (select count(*)::int from public.home_drill_completions where player_id = 'ea000000-0000-0000-0000-00000000000a' and item_id = (select v from ctx where k = 'taps')), '0/1', 'it is gone; the drill is still Done by the day''s other scores');
select lives_ok($$select public.delete_drill_attempt((select v from ctx where k = 'r1'))$$, 'deleting the day''s only score of a drill');
select is((select count(*)::int from public.home_drill_completions where player_id = 'ea000000-0000-0000-0000-00000000000a' and item_id = (select v from ctx where k = 'rolls')), 0, 'takes the Done back');
select public.delete_drill_attempt((select v from ctx where k = 'c4'));
select is((select level from public.home_drill_levels('ea000000-0000-0000-0000-00000000000a') where item_id = (select v from ctx where k = 'cones')), 2, 'a level it unlocked stays');
select pg_temp.logout();
update public.home_drill_attempts set done_on = done_on - 1 where id = (select v from ctx where k = 't1');
select pg_temp.login('da000000-0000-0000-0000-000000000003');
select throws_ok($$select public.delete_drill_attempt((select v from ctx where k = 't1'))$$, '42501', null, 'an earlier day''s score stays');
select throws_ok($$select public.delete_drill_attempt('ea000000-0000-0000-0000-0000000000ff')$$, '42501', null, 'an unknown score is refused');
select pg_temp.logout();

-- ---------- nobody signed out gets anything ----------
select set_config('request.jwt.claims', '', true);
select set_config('role', 'anon', true);
select is((select count(*)::int from public.home_drill_attempts), 0, 'signed out: no attempts');
select throws_ok($$select public.record_drill_attempt('ea000000-0000-0000-0000-00000000000a', (select v from ctx where k = 'taps'), 1, 5, null)$$, '42501', null, 'and no recording');
select pg_temp.logout();
select ok((select relrowsecurity from pg_class where oid = 'public.home_drill_attempts'::regclass), 'row security is on');

select * from finish();
rollback;
