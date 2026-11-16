-- Eligible positions (D117). Per player and position group, one of preferred / can / never;
-- "can" is the default and is stored as no row. Auto-fill and Suggest starters never place a
-- player in a group marked never; manual placement is never blocked. Coaches and assistant
-- coaches only: parents get nothing from this table (RLS), the platform admin acts as staff.
-- Position groups are defined per sport in src/sports (the keys here are the engine's group
-- keys: GK/DEF/MID/ST, G/F/C, P/C/IF/OF, …); the database keeps the mapping out of its way.

create type public.position_pref as enum ('preferred', 'can', 'never');

create table public.player_position_prefs (
  player_id   uuid not null references public.players(id) on delete cascade,
  group_key   text not null check (group_key ~ '^[A-Z0-9]{1,8}$'),
  level       public.position_pref not null default 'can',
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  primary key (player_id, group_key)
);
create trigger player_position_prefs_updated_at before update on public.player_position_prefs
  for each row execute function public.set_updated_at();
create trigger player_position_prefs_stamp before insert or update on public.player_position_prefs
  for each row execute function public.stamp_updated_by();

alter table public.player_position_prefs enable row level security;
create policy player_position_prefs_staff on public.player_position_prefs for all to authenticated
  using (public.is_staff(public.team_of_player(player_id)))
  with check (public.is_staff(public.team_of_player(player_id)));
