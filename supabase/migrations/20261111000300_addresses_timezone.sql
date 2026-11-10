-- Schedule round (D50): a street address on games and practices for Directions and calendar
-- exports, and a team timezone so .ics times are right wherever the file is opened.
-- Access is unchanged: the columns ride on the existing games / practices / teams policies
-- (members read, coach/assistant write).

alter table public.games
  add column if not exists address text check (address is null or length(address) <= 200);
alter table public.practices
  add column if not exists address text check (address is null or length(address) <= 200);
alter table public.teams
  add column if not exists timezone text not null default 'America/Chicago'
    check (length(timezone) between 1 and 64 and timezone !~ '[^A-Za-z0-9_/+-]');

-- Places the team has used before, for the location/address suggestions when scheduling.
create or replace function public.team_places(p_team_id uuid)
returns table (location text, address text, last_used date, uses int)
language sql
stable
security definer
set search_path = ''
as $$
  select x.location, max(x.address) as address, max(x.on_date) as last_used, count(*)::int as uses
  from (
    select g.location, g.address, g.game_date as on_date from public.games g where g.team_id = p_team_id
    union all
    select p.location, p.address, p.practice_date from public.practices p where p.team_id = p_team_id
  ) x
  where public.is_active_member(p_team_id)
    and nullif(trim(coalesce(x.location, '')), '') is not null
  group by x.location
  order by max(x.on_date) desc, count(*) desc
  limit 30;
$$;
revoke all on function public.team_places(uuid) from public;
grant execute on function public.team_places(uuid) to authenticated, service_role;
