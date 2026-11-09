-- Mini-Messi's — core schema (BUILD-PROMPT §5).
-- Sport rules (formations, codes, points) live in src/sports/; the database stores only which
-- formation name and which position codes were used.

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------- enums ----------
create type public.sport as enum ('soccer', 'baseball', 'basketball', 'lacrosse', 'football');
create type public.theme as enum ('light', 'dark', 'auto');
create type public.field_view as enum ('persp', 'flat');
create type public.member_role as enum ('coach', 'assistant', 'parent');
create type public.member_status as enum ('pending', 'active', 'removed');
create type public.guardian_status as enum ('pending', 'approved');
create type public.game_status as enum ('upcoming', 'live', 'done');
create type public.home_away as enum ('home', 'away', 'neutral');
create type public.score_side as enum ('us', 'them');
create type public.pa_result as enum (
  'none', 'single', 'double', 'triple', 'home_run', 'walk', 'hit_by_pitch',
  'strikeout', 'out', 'sacrifice', 'fielders_choice', 'reached_on_error'
);
create type public.skill_metric as enum ('count', 'time_seconds', 'distance', 'made_of_attempted');
create type public.body_side as enum ('left', 'right');

-- ---------- shared trigger: updated_at ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- profiles ----------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null default '',
  theme         public.theme not null default 'auto',
  field_view    public.field_view not null default 'persp',
  last_team_id  uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- teams ----------
create table public.teams (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null check (length(trim(name)) between 1 and 40),
  sport                  public.sport not null,
  owner_id               uuid not null references auth.users(id),
  join_code              text not null unique check (join_code ~ '^[A-Z2-9]{8}$'),
  join_code_rotated_at   timestamptz not null default now(),
  side_size              int not null check (side_size between 2 and 15),
  has_gk                 boolean not null default false,
  periods_count          int not null check (periods_count between 1 and 12),
  colors                 jsonb not null default '{}'::jsonb,
  last_batter_player_id  uuid,
  archived_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  updated_by             uuid references auth.users(id)
);
create index teams_owner_idx on public.teams(owner_id);
create trigger teams_updated_at before update on public.teams
  for each row execute function public.set_updated_at();

alter table public.profiles
  add constraint profiles_last_team_fk foreign key (last_team_id) references public.teams(id) on delete set null;

-- ---------- seasons ----------
create table public.seasons (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  name        text not null,
  starts_on   date,
  ends_on     date,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index seasons_team_idx on public.seasons(team_id);
-- exactly one current season per team
create unique index seasons_one_current_idx on public.seasons(team_id) where is_current;

-- ---------- team members ----------
create table public.team_members (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            public.member_role not null,
  status          public.member_status not null default 'pending',
  requested_role  public.member_role,
  note            text,
  approved_by     uuid references auth.users(id),
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (team_id, user_id)
);
create index team_members_user_idx on public.team_members(user_id);
create trigger team_members_updated_at before update on public.team_members
  for each row execute function public.set_updated_at();

-- ---------- players ----------
create table public.players (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references public.teams(id) on delete cascade,
  first_name     text not null check (length(trim(first_name)) between 1 and 40),
  last_name      text,
  jersey_number  text check (jersey_number is null or jersey_number ~ '^[0-9]{0,3}$'),
  is_available   boolean not null default true,
  batting_order  int,
  sort_order     int not null default 0,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users(id)
);
create index players_team_idx on public.players(team_id);
create trigger players_updated_at before update on public.players
  for each row execute function public.set_updated_at();

alter table public.teams
  add constraint teams_last_batter_fk foreign key (last_batter_player_id) references public.players(id) on delete set null;

-- ---------- player guardians ----------
create table public.player_guardians (
  id                   uuid primary key default gen_random_uuid(),
  player_id            uuid not null references public.players(id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,
  relationship         text,
  status               public.guardian_status not null default 'pending',
  unlisted_child_name  text,
  approved_by          uuid references auth.users(id),
  approved_at          timestamptz,
  created_at           timestamptz not null default now(),
  unique (player_id, user_id)
);
create index player_guardians_user_idx on public.player_guardians(user_id);

-- Requests for a child who is not on the roster yet carry no player_id; they hang off the membership.
create table public.unlisted_child_requests (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.team_members(id) on delete cascade,
  child_name  text not null,
  created_at  timestamptz not null default now()
);
create index unlisted_child_requests_member_idx on public.unlisted_child_requests(member_id);

-- ---------- games ----------
create table public.games (
  id                  uuid primary key default gen_random_uuid(),
  team_id             uuid not null references public.teams(id) on delete cascade,
  season_id           uuid not null references public.seasons(id),
  opponent            text not null default 'Opponent' check (length(opponent) <= 40),
  game_date           date not null default current_date,
  start_time          time,
  location            text,
  home_away           public.home_away,
  parent_notes        text,
  status              public.game_status not null default 'upcoming',
  team_name_snapshot  text,
  started_at          timestamptz,
  finished_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id)
);
create index games_team_date_idx on public.games(team_id, game_date desc);
create index games_season_idx on public.games(season_id);
-- only one live game per team
create unique index games_one_live_idx on public.games(team_id) where status = 'live';
create trigger games_updated_at before update on public.games
  for each row execute function public.set_updated_at();

create table public.game_coach_notes (
  game_id     uuid primary key references public.games(id) on delete cascade,
  notes       text not null default '',
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);
create trigger game_coach_notes_updated_at before update on public.game_coach_notes
  for each row execute function public.set_updated_at();

create table public.game_players (
  game_id          uuid not null references public.games(id) on delete cascade,
  player_id        uuid not null references public.players(id),
  name_snapshot    text not null,
  number_snapshot  text,
  available        boolean not null default true,
  primary key (game_id, player_id)
);

-- ---------- lineups ----------
create table public.lineups (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  game_id         uuid references public.games(id) on delete cascade,   -- null = the team's template plan
  period_index    int not null check (period_index between 0 and 11),
  formation_name  text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique nulls not distinct (team_id, game_id, period_index)
);
create index lineups_game_idx on public.lineups(game_id);
create trigger lineups_updated_at before update on public.lineups
  for each row execute function public.set_updated_at();

create table public.lineup_slots (
  lineup_id      uuid not null references public.lineups(id) on delete cascade,
  slot_index     int not null check (slot_index between 0 and 30),
  position_role  text not null,
  position_code  text not null,
  player_id      uuid references public.players(id) on delete set null,
  auto_picked    boolean not null default false,
  primary key (lineup_id, slot_index)
);
-- a player appears at most once per lineup
create unique index lineup_slots_player_once_idx on public.lineup_slots(lineup_id, player_id) where player_id is not null;
create index lineup_slots_player_idx on public.lineup_slots(player_id);

-- ---------- scoring ----------
create table public.score_events (
  id                uuid primary key default gen_random_uuid(),
  game_id           uuid not null references public.games(id) on delete cascade,
  side              public.score_side not null,
  period_index      int not null check (period_index between 0 and 20),
  event_type        text not null,
  points            smallint not null check (points between 1 and 6),
  scorer_player_id  uuid references public.players(id) on delete set null,
  assist_player_id  uuid references public.players(id) on delete set null,
  occurred_at       timestamptz not null default now(),
  created_by        uuid references auth.users(id) default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id),
  constraint score_events_them_no_player check (side = 'us' or (scorer_player_id is null and assist_player_id is null)),
  constraint score_events_assist_not_scorer check (assist_player_id is null or assist_player_id is distinct from scorer_player_id)
);
create index score_events_game_idx on public.score_events(game_id, period_index, occurred_at);
create trigger score_events_updated_at before update on public.score_events
  for each row execute function public.set_updated_at();

create table public.plate_appearances (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid not null references public.games(id) on delete cascade,
  player_id    uuid not null references public.players(id),
  inning       int not null check (inning between 1 and 20),
  sequence     int not null default 0,
  result       public.pa_result not null default 'none',
  rbi          smallint not null default 0 check (rbi between 0 and 4),
  occurred_at  timestamptz not null default now(),
  created_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id)
);
create index plate_appearances_game_idx on public.plate_appearances(game_id, inning, sequence);
create trigger plate_appearances_updated_at before update on public.plate_appearances
  for each row execute function public.set_updated_at();

-- ---------- skills ----------
create table public.skill_tests (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references public.teams(id) on delete cascade,
  key               text not null check (key ~ '^[a-z0-9_-]{1,40}$'),
  name              text not null check (length(trim(name)) between 1 and 60),
  instructions      text not null default '',
  metric            public.skill_metric not null,
  unit              text check (unit is null or unit in ('yd', 'ft', 'm')),
  has_sides         boolean not null default false,
  higher_is_better  boolean not null default true,
  sort_order        int not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id),
  unique (team_id, key)
);
create trigger skill_tests_updated_at before update on public.skill_tests
  for each row execute function public.set_updated_at();

create table public.skill_results (
  id             uuid primary key default gen_random_uuid(),
  player_id      uuid not null references public.players(id) on delete cascade,
  skill_test_id  uuid not null references public.skill_tests(id) on delete restrict,
  tested_on      date not null default current_date,
  value          numeric not null,
  attempts       numeric,
  side           public.body_side,
  note           text,
  recorded_by    uuid references auth.users(id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users(id)
);
create index skill_results_player_idx on public.skill_results(player_id, skill_test_id, tested_on desc);
create trigger skill_results_updated_at before update on public.skill_results
  for each row execute function public.set_updated_at();

-- ---------- join attempts (rate limiting) ----------
create table public.join_attempts (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  code_tried    text not null,
  attempted_at  timestamptz not null default now()
);
create index join_attempts_user_time_idx on public.join_attempts(user_id, attempted_at desc);
