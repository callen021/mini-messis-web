-- Practices (D40): a team's training schedule, shown next to games on the Games tab.
-- Same access as games: active members read, coach/assistant write, platform admin everything.
-- Nobody but a platform admin can hard-delete one: cancelling keeps the row so a parent who saw it
-- on the schedule sees it struck through instead of silently gone.

create type public.practice_status as enum ('scheduled', 'cancelled');

create table public.practices (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references public.teams(id) on delete cascade,
  season_id      uuid not null references public.seasons(id),
  practice_date  date not null,
  start_time     time,
  end_time       time,
  location       text check (location is null or length(location) <= 80),
  notes          text check (notes is null or length(notes) <= 500),
  status         public.practice_status not null default 'scheduled',
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users(id),
  constraint practices_end_after_start check (end_time is null or start_time is null or end_time > start_time)
);
create index practices_team_date_idx on public.practices(team_id, practice_date);
create index practices_season_idx on public.practices(season_id);

create trigger practices_updated_at before update on public.practices
  for each row execute function public.set_updated_at();

-- audit: created_by is fixed at insert; updated_by follows the caller
create or replace function public.practices_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    -- the season a practice belongs to never moves
    new.season_id := old.season_id;
    new.team_id := old.team_id;
  end if;
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  return new;
end;
$$;
create trigger practices_stamp before insert or update on public.practices
  for each row execute function public.practices_stamp();

-- the season must belong to the team
create or replace function public.practices_check_season()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.seasons s where s.id = new.season_id and s.team_id = new.team_id) then
    raise exception 'season does not belong to this team' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger practices_check_season before insert on public.practices
  for each row execute function public.practices_check_season();

-- ---------- RLS ----------
alter table public.practices enable row level security;

create policy practices_select_member on public.practices for select to authenticated
  using (public.is_active_member(team_id));
create policy practices_insert_staff on public.practices for insert to authenticated
  with check (public.is_staff(team_id));
create policy practices_update_staff on public.practices for update to authenticated
  using (public.is_staff(team_id)) with check (public.is_staff(team_id));
-- cancel, don't delete: only a platform admin can remove a row outright
create policy practices_delete_admin on public.practices for delete to authenticated
  using (public.is_platform_admin());

-- ---------- realtime ----------
alter publication supabase_realtime add table public.practices;
