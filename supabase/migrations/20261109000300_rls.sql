-- Row Level Security (BUILD-PROMPT §5 "RLS, in words").
-- read  = active membership on the team
-- write = that membership is coach or assistant
-- owner-only: team delete / owner change (trigger) / archive (trigger)

alter table public.profiles                enable row level security;
alter table public.teams                   enable row level security;
alter table public.seasons                 enable row level security;
alter table public.team_members            enable row level security;
alter table public.players                 enable row level security;
alter table public.player_guardians        enable row level security;
alter table public.unlisted_child_requests enable row level security;
alter table public.games                   enable row level security;
alter table public.game_coach_notes        enable row level security;
alter table public.game_players            enable row level security;
alter table public.lineups                 enable row level security;
alter table public.lineup_slots            enable row level security;
alter table public.score_events            enable row level security;
alter table public.plate_appearances       enable row level security;
alter table public.skill_tests             enable row level security;
alter table public.skill_results           enable row level security;
alter table public.join_attempts           enable row level security;

-- ---------- profiles: own row only ----------
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

-- ---------- teams ----------
create policy teams_select_member on public.teams for select to authenticated
  using (public.is_active_member(id));
create policy teams_update_staff on public.teams for update to authenticated
  using (public.is_staff(id)) with check (public.is_staff(id));
create policy teams_delete_owner on public.teams for delete to authenticated
  using (public.is_owner(id));
-- insert only via create_team()

-- ---------- seasons ----------
create policy seasons_select_member on public.seasons for select to authenticated
  using (public.is_active_member(team_id));
create policy seasons_write_staff on public.seasons for all to authenticated
  using (public.is_staff(team_id)) with check (public.is_staff(team_id));

-- ---------- team_members ----------
create policy team_members_select_own_or_coach on public.team_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_coach(team_id));
create policy team_members_update_coach on public.team_members for update to authenticated
  using (public.is_coach(team_id)) with check (public.is_coach(team_id));
create policy team_members_delete_coach on public.team_members for delete to authenticated
  using (public.is_coach(team_id));
-- insert only via create_team() / request_join()

-- ---------- players ----------
create policy players_select_member on public.players for select to authenticated
  using (public.is_active_member(team_id));
create policy players_write_staff on public.players for all to authenticated
  using (public.is_staff(team_id)) with check (public.is_staff(team_id));

-- ---------- player_guardians ----------
create policy guardians_select_own_or_coach on public.player_guardians for select to authenticated
  using (user_id = (select auth.uid()) or public.is_coach(public.team_of_player(player_id)));
create policy guardians_write_coach on public.player_guardians for all to authenticated
  using (public.is_coach(public.team_of_player(player_id)))
  with check (public.is_coach(public.team_of_player(player_id)));
-- parents request links via request_join() / request_guardian_link()

create policy unlisted_select_own_or_coach on public.unlisted_child_requests for select to authenticated
  using (exists (
    select 1 from public.team_members m
    where m.id = member_id and (m.user_id = (select auth.uid()) or public.is_coach(m.team_id))
  ));
create policy unlisted_delete_coach on public.unlisted_child_requests for delete to authenticated
  using (exists (select 1 from public.team_members m where m.id = member_id and public.is_coach(m.team_id)));

-- ---------- games ----------
create policy games_select_member on public.games for select to authenticated
  using (public.is_active_member(team_id));
create policy games_write_staff on public.games for all to authenticated
  using (public.is_staff(team_id)) with check (public.is_staff(team_id));

-- coach notes: staff only, no parent read
create policy coach_notes_staff on public.game_coach_notes for all to authenticated
  using (public.is_staff(public.team_of_game(game_id)))
  with check (public.is_staff(public.team_of_game(game_id)));

create policy game_players_select_member on public.game_players for select to authenticated
  using (public.is_active_member(public.team_of_game(game_id)));
create policy game_players_write_staff on public.game_players for all to authenticated
  using (public.is_staff(public.team_of_game(game_id)))
  with check (public.is_staff(public.team_of_game(game_id)));

-- ---------- lineups ----------
create policy lineups_select_member on public.lineups for select to authenticated
  using (public.is_active_member(team_id));
create policy lineups_write_staff on public.lineups for all to authenticated
  using (public.is_staff(team_id)) with check (public.is_staff(team_id));

create policy lineup_slots_select_member on public.lineup_slots for select to authenticated
  using (public.is_active_member(public.team_of_lineup(lineup_id)));
create policy lineup_slots_write_staff on public.lineup_slots for all to authenticated
  using (public.is_staff(public.team_of_lineup(lineup_id)))
  with check (public.is_staff(public.team_of_lineup(lineup_id)));

-- ---------- scoring ----------
create policy score_events_select_member on public.score_events for select to authenticated
  using (public.is_active_member(public.team_of_game(game_id)));
create policy score_events_write_staff on public.score_events for all to authenticated
  using (public.is_staff(public.team_of_game(game_id)))
  with check (public.is_staff(public.team_of_game(game_id)));

create policy plate_appearances_select_member on public.plate_appearances for select to authenticated
  using (public.is_active_member(public.team_of_game(game_id)));
create policy plate_appearances_write_staff on public.plate_appearances for all to authenticated
  using (public.is_staff(public.team_of_game(game_id)))
  with check (public.is_staff(public.team_of_game(game_id)));

-- ---------- skills ----------
create policy skill_tests_select_member on public.skill_tests for select to authenticated
  using (public.is_active_member(team_id));
create policy skill_tests_write_staff on public.skill_tests for all to authenticated
  using (public.is_staff(team_id)) with check (public.is_staff(team_id));

-- results: staff read/write for their team's players; a parent reads only approved-linked children.
create policy skill_results_select on public.skill_results for select to authenticated
  using (
    public.is_staff(public.team_of_player(player_id))
    or public.is_guardian_of(player_id)
  );
create policy skill_results_write_staff on public.skill_results for all to authenticated
  using (public.is_staff(public.team_of_player(player_id)))
  with check (public.is_staff(public.team_of_player(player_id)));

-- ---------- join_attempts: nobody reads or writes directly ----------
-- (request_join / lookup_join_code are SECURITY DEFINER)

-- ---------- realtime ----------
alter publication supabase_realtime add table
  public.games, public.score_events, public.plate_appearances, public.lineups, public.lineup_slots,
  public.team_members, public.player_guardians, public.players;
alter table public.score_events replica identity full;
alter table public.plate_appearances replica identity full;
alter table public.lineup_slots replica identity full;
alter table public.team_members replica identity full;
