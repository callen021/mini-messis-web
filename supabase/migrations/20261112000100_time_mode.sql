-- Clock-based playing time, part 1 (D65): the team setting.
-- teams.time_mode decides how playing time is tracked: 'periods' (the existing per-period lineups,
-- unchanged) or 'clock' (a game clock and stints, part 2). Clock mode keeps its own period count
-- (default 2 halves) and an optional period length in minutes; the period-mode count stays as it
-- is so switching back and forth never resizes a team's plan.

create type public.time_mode as enum ('periods', 'clock');

alter table public.teams
  add column if not exists time_mode public.time_mode not null default 'periods',
  add column if not exists clock_periods int not null default 2 check (clock_periods between 1 and 6),
  add column if not exists period_minutes int check (period_minutes is null or period_minutes between 1 and 90);

-- The mode and the clock period count cannot change while a game is live: a live clock game has
-- stints per period and the Field page is built around them. The period length may change mid-game
-- (it only drives "time remaining"). Staff-only writes are already enforced by RLS on teams.
create or replace function public.teams_guard_time_mode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.time_mode is distinct from old.time_mode or new.clock_periods is distinct from old.clock_periods)
     and exists (select 1 from public.games g where g.team_id = old.id and g.status = 'live') then
    raise exception 'finish the game in progress before changing how playing time is tracked' using errcode = 'P0006';
  end if;
  return new;
end;
$$;
drop trigger if exists teams_guard_time_mode on public.teams;
create trigger teams_guard_time_mode before update on public.teams
  for each row execute function public.teams_guard_time_mode();

-- The number of periods a game has for this team under its current mode.
create or replace function public.team_period_count(p_team_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case t.time_mode when 'clock' then t.clock_periods else t.periods_count end
  from public.teams t where t.id = p_team_id;
$$;
revoke all on function public.team_period_count(uuid) from public;
grant execute on function public.team_period_count(uuid) to authenticated, service_role;
