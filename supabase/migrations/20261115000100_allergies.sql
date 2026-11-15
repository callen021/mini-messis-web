-- Allergies on the player profile (D114). One row per player, three states: no row = the family
-- has not answered, status 'none', or status 'has' with the allergens (a fixed list plus "other"
-- with its own name) and a free-text note (severity, EpiPen…). Private like the birthdate: the
-- coaches, assistants and the player's APPROVED guardians read and write it; a self-linked parent
-- waits for the coach to confirm the link (can_see_player_private, D52/D91). The team summary
-- names the allergens, never a player and never the notes, and is open to every active member.

create type public.allergy_status as enum ('none', 'has');

create table public.player_allergies (
  player_id   uuid primary key references public.players(id) on delete cascade,
  status      public.allergy_status not null,
  allergens   text[] not null default '{}',
  other       text check (other is null or length(other) <= 80),
  notes       text check (notes is null or length(notes) <= 500),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  constraint player_allergies_known check (
    allergens <@ array['peanuts', 'tree_nuts', 'dairy', 'eggs', 'wheat', 'soy', 'sesame', 'fish', 'shellfish', 'other']::text[]
  ),
  constraint player_allergies_none_is_empty check (status = 'has' or (allergens = '{}' and other is null)),
  constraint player_allergies_other_named check (not ('other' = any (allergens)) or nullif(trim(other), '') is not null)
);
create trigger player_allergies_updated_at before update on public.player_allergies
  for each row execute function public.set_updated_at();
create trigger player_allergies_stamp before insert or update on public.player_allergies
  for each row execute function public.stamp_updated_by();

alter table public.player_allergies enable row level security;
create policy player_allergies_private on public.player_allergies for all to authenticated
  using (public.can_see_player_private(player_id))
  with check (public.can_see_player_private(player_id));

-- the app listens for changes (the player page, the team summary); a table a channel listens to
-- must be in the publication or the whole team channel fails to subscribe
alter publication supabase_realtime add table public.player_allergies;
alter table public.player_allergies replica identity full;

-- The team's combined list, no names: every allergen any family ticked, the "other" names, and
-- whether some family has not answered yet. Archived players are left out.
create or replace function public.team_allergy_summary(p_team_id uuid)
returns table (allergens text[], others text[], unanswered boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with roster as (
    select p.id from public.players p where p.team_id = p_team_id and p.archived_at is null
  ),
  answered as (
    select a.* from public.player_allergies a join roster r on r.id = a.player_id
  )
  select
    coalesce((select array_agg(distinct x order by x) from answered a, unnest(a.allergens) as x where x <> 'other'), '{}'::text[]),
    coalesce((select array_agg(distinct trim(a.other) order by trim(a.other)) from answered a where 'other' = any (a.allergens) and nullif(trim(a.other), '') is not null), '{}'::text[]),
    exists (select 1 from roster r where not exists (select 1 from answered a where a.player_id = r.id))
  where public.is_active_member(p_team_id);
$$;
revoke all on function public.team_allergy_summary(uuid) from public;
grant execute on function public.team_allergy_summary(uuid) to authenticated, service_role;
