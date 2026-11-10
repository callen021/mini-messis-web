-- The season-belongs-to-team check must see the seasons row regardless of who is inserting,
-- otherwise a non-member gets "season does not belong to this team" (23503) instead of the RLS
-- refusal (42501). Definer with an empty search_path; it reads one row and changes nothing.
create or replace function public.practices_check_season()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.seasons s where s.id = new.season_id and s.team_id = new.team_id) then
    raise exception 'season does not belong to this team' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function public.practices_check_season() from public;
