-- Player details and contacts (parent-feedback round, D52). Private to the player's own people:
-- coach, assistant, platform admin and that player's APPROVED guardians can read and write;
-- every other parent on the team gets nothing (pgTAP 10 proves it).

create type public.shirt_size as enum ('YXS', 'YS', 'YM', 'YL', 'YXL', 'AS', 'AM', 'AL', 'AXL');

create table public.player_details (
  player_id   uuid primary key references public.players(id) on delete cascade,
  birthdate   date check (birthdate is null or (birthdate > '1990-01-01' and birthdate <= current_date)),
  shirt_size  public.shirt_size,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);
create trigger player_details_updated_at before update on public.player_details
  for each row execute function public.set_updated_at();
create trigger player_details_stamp before insert or update on public.player_details
  for each row execute function public.stamp_updated_by();

create table public.player_contacts (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references public.players(id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 80),
  relationship  text check (relationship is null or length(relationship) <= 40),
  email         text check (email is null or (length(email) <= 120 and position('@' in email) > 1)),
  phone         text check (phone is null or length(phone) <= 40),
  -- an optional link to an app account (the parent themselves, usually)
  user_id       uuid references auth.users(id) on delete set null,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id)
);
create index player_contacts_player_idx on public.player_contacts(player_id, sort_order);
create trigger player_contacts_updated_at before update on public.player_contacts
  for each row execute function public.set_updated_at();
create trigger player_contacts_stamp before insert or update on public.player_contacts
  for each row execute function public.stamp_updated_by();

-- Staff of the player's team (admins included through is_staff), or an approved guardian.
create or replace function public.can_see_player_private(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_staff(public.team_of_player(p_player_id)) or public.is_guardian_of(p_player_id);
$$;
revoke all on function public.can_see_player_private(uuid) from public;
grant execute on function public.can_see_player_private(uuid) to authenticated, service_role;

alter table public.player_details enable row level security;
alter table public.player_contacts enable row level security;

create policy player_details_private on public.player_details for all to authenticated
  using (public.can_see_player_private(player_id))
  with check (public.can_see_player_private(player_id));
create policy player_contacts_private on public.player_contacts for all to authenticated
  using (public.can_see_player_private(player_id))
  with check (public.can_see_player_private(player_id));
