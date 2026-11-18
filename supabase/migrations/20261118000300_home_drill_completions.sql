-- At-home Training (D128): a child's finished home drills.
--
-- One row per drill per child per day: the date, the drill, the level the child picked (1 to 3)
-- and how it was done (with a parent or alone). Doing a drill again the same day changes nothing;
-- any drill counts, the day's three or another of the ten.
--
-- Who:
--   · a parent records for their own confirmed child (an approved link, on a team they are an
--     active member of, a player still on the roster), and may take back a Done they recorded,
--     the same day only;
--   · the team's coaches and assistant coaches read; other parents see nothing;
--   · nobody edits a row.
-- The date is never taken from the device: a trigger writes today in the team's timezone, so a
-- drill cannot be backdated.

-- ---------- today, where the team plays ----------
create or replace function public.team_today(p_team_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone coalesce((select t.timezone from public.teams t where t.id = p_team_id), 'UTC'))::date;
$$;
revoke all on function public.team_today(uuid) from public;
grant execute on function public.team_today(uuid) to authenticated, service_role;

-- ---------- who may record training for a child, and who may see it ----------
create or replace function public.can_train(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_player_id is not null
     and public.is_guardian_of(p_player_id)
     and coalesce(public.is_active_member(public.team_of_player(p_player_id)), false)
     and exists (select 1 from public.players p where p.id = p_player_id and p.archived_at is null);
$$;
create or replace function public.can_see_training(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_player_id is not null
     and (public.is_staff(public.team_of_player(p_player_id)) or public.can_train(p_player_id));
$$;
revoke all on function public.can_train(uuid) from public;
revoke all on function public.can_see_training(uuid) from public;
grant execute on function public.can_train(uuid), public.can_see_training(uuid) to authenticated, service_role;

-- ---------- completions ----------
create type public.drill_mode as enum ('parent', 'solo');

create table public.home_drill_completions (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.players(id) on delete cascade,
  item_id      uuid not null references public.library_items(id) on delete cascade,
  done_on      date not null default current_date,
  level        int not null check (level between 1 and 3),
  mode         public.drill_mode not null,
  recorded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (player_id, item_id, done_on)
);
create index home_drill_completions_player_idx on public.home_drill_completions (player_id, done_on desc);

-- The drill must be an at-home drill of the team's sport; date and author are the server's.
create or replace function public.home_drill_completions_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid := public.team_of_player(new.player_id);
begin
  if not exists (
    select 1 from public.library_items i
    join public.teams t on t.id = v_team
    where i.id = new.item_id and i.category = 'home' and i.is_published and i.sport = t.sport
  ) then
    raise exception 'That is not one of the team''s at-home drills' using errcode = '23514';
  end if;
  new.done_on := public.team_today(v_team);
  new.recorded_by := (select auth.uid());
  new.created_at := now();
  return new;
end;
$$;
create trigger home_drill_completions_stamp before insert on public.home_drill_completions
  for each row execute function public.home_drill_completions_stamp();

alter table public.home_drill_completions enable row level security;
create policy home_drill_completions_read on public.home_drill_completions for select to authenticated
  using (public.can_see_training(player_id));
create policy home_drill_completions_insert on public.home_drill_completions for insert to authenticated
  with check (public.can_train(player_id));
create policy home_drill_completions_delete on public.home_drill_completions for delete to authenticated
  using (
    public.can_train(player_id)
    and recorded_by = (select auth.uid())
    and done_on = public.team_today(public.team_of_player(player_id))
  );
revoke update on public.home_drill_completions from anon, authenticated;
