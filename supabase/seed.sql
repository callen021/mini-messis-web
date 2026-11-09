-- Local/CI seed: a demo coach, the Strikers (soccer, 7v7 with GK, 4 quarters), a sample parent,
-- and one finished game. Passwords are "password123". Never run against production.

-- ---------- users ----------
create or replace function pg_temp.seed_user(p_id uuid, p_email text, p_name text)
returns void
language plpgsql
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', p_name), now(), now(),
    '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), p_id, p_id,
    jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now()
  );
end;
$$;

select pg_temp.seed_user('11111111-1111-1111-1111-111111111111', 'coach@example.com', 'Coach Cody');
select pg_temp.seed_user('22222222-2222-2222-2222-222222222222', 'parent@example.com', 'Nolan''s Dad');
select pg_temp.seed_user('33333333-3333-3333-3333-333333333333', 'assistant@example.com', 'Assistant Alex');

-- Run the rest as the coach so SECURITY DEFINER functions see auth.uid().
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);

-- ---------- team ----------
do $$
declare
  v_team uuid;
  v_season uuid;
  v_game uuid;
  v_lineup uuid;
  v_names text[] := array['Nolan','Teddy','Jack','Weston','Sam','Milo','Quincy','Hal','Nick','Atlas','Eli','Rowan','Jonah','Wes'];
  v_ids uuid[] := '{}';
  v_id uuid;
  i int;
  q int;
  v_codes text[] := array['LW','ST','RW','LFB','SW','RFB','GK'];
  v_roles text[] := array['ST','ST','ST','DEF','DEF','DEF','GK'];
  v_template jsonb;
begin
  -- one "3-3" plan per quarter (roles/codes come from the soccer definition in src/sports)
  select jsonb_agg(jsonb_build_object('formation_name', '3-3', 'slots',
           (select jsonb_agg(jsonb_build_object('position_role', r, 'position_code', c) order by ord)
            from unnest(v_roles, v_codes) with ordinality as t(r, c, ord))))
  into v_template
  from generate_series(1, 4);

  v_team := public.create_team('Mini-Messi''s', 'soccer', 7, true, 4,
    '{"ST":"#7b3fe4","MID":"#7b3fe4","DEF":"#7b3fe4","GK":"#14b8a6"}'::jsonb, v_template);

  for i in 1..array_length(v_names, 1) loop
    insert into public.players (team_id, first_name, jersey_number, sort_order)
    values (v_team, v_names[i], i::text, i)
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  -- template lineup: rotate the sample roster like the legacy "Load example team"
  for q in 0..3 loop
    select id into v_lineup from public.lineups where team_id = v_team and game_id is null and period_index = q;
    for i in 0..6 loop
      update public.lineup_slots set player_id = v_ids[(((q * 7) + i) % 14) + 1]
      where lineup_id = v_lineup and slot_index = i;
    end loop;
  end loop;

  -- assistant coach + parent linked to Nolan (approved) — parent also requested Teddy (pending)
  insert into public.team_members (team_id, user_id, role, status, requested_role, approved_by, approved_at)
  values (v_team, '33333333-3333-3333-3333-333333333333', 'assistant', 'active', 'assistant', '11111111-1111-1111-1111-111111111111', now());
  insert into public.team_members (team_id, user_id, role, status, requested_role, approved_by, approved_at)
  values (v_team, '22222222-2222-2222-2222-222222222222', 'parent', 'active', 'parent', '11111111-1111-1111-1111-111111111111', now());
  insert into public.player_guardians (player_id, user_id, relationship, status, approved_by, approved_at)
  values (v_ids[1], '22222222-2222-2222-2222-222222222222', 'father', 'approved', '11111111-1111-1111-1111-111111111111', now());
  insert into public.player_guardians (player_id, user_id, relationship, status)
  values (v_ids[2], '22222222-2222-2222-2222-222222222222', 'father', 'pending');

  -- a finished game last Saturday: 3–1 win vs Mini Tyler's
  select id into v_season from public.seasons where team_id = v_team and is_current;
  insert into public.games (team_id, season_id, opponent, game_date, start_time, location, home_away, parent_notes, status)
  values (v_team, v_season, 'Mini Tyler''s', current_date - 7, '09:30', 'Riverside Park, Field 3', 'home', 'Wear white', 'upcoming')
  returning id into v_game;
  perform public.start_game(v_game);
  insert into public.score_events (game_id, side, period_index, event_type, scorer_player_id, assist_player_id)
  values (v_game, 'us', 0, 'goal', v_ids[1], v_ids[2]),
         (v_game, 'them', 1, 'goal', null, null),
         (v_game, 'us', 2, 'goal', v_ids[2], null),
         (v_game, 'us', 3, 'goal', v_ids[1], v_ids[4]);
  insert into public.game_coach_notes (game_id, notes) values (v_game, 'Pressing worked. Practice throw-ins.');
  perform public.finish_game(v_game);

  -- and an upcoming game next Saturday
  insert into public.games (team_id, season_id, opponent, game_date, start_time, location, home_away)
  values (v_team, v_season, 'Little Lions', current_date + 7, '10:00', 'Riverside Park, Field 1', 'away');
end;
$$;

select set_config('request.jwt.claims', '', false);
