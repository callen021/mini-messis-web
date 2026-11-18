-- At-home Training (D129): stopwatch times for the timed home drill (Cone Dribbling).
--
-- One row per clean run a parent chose to save: child, drill, level and the time in seconds to a
-- tenth. The course is fixed per level in the drill's text, so times at one level compare; a
-- child's personal best per level is simply the lowest. A discarded run is never sent.
--
-- Saving a clean run also marks the drill Done for the day (if it is not already), at the level
-- of the run and "with a parent": the parent runs the stopwatch.
--
-- Same people as completions: a parent with a confirmed link records and may delete a time they
-- saved, the same day only; coaches and assistant coaches read; nobody edits.

create table public.home_drill_times (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.players(id) on delete cascade,
  item_id      uuid not null references public.library_items(id) on delete cascade,
  level        int not null check (level between 1 and 3),
  seconds      numeric(6, 1) not null check (seconds > 0 and seconds < 3600),
  run_on       date not null default current_date,
  recorded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index home_drill_times_player_idx on public.home_drill_times (player_id, item_id, level, seconds);

create or replace function public.home_drill_times_stamp()
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
      and i.content #> '{home,stopwatch}' = 'true'::jsonb
  ) then
    raise exception 'That drill is not timed' using errcode = '23514';
  end if;
  new.run_on := public.team_today(v_team);
  new.recorded_by := (select auth.uid());
  new.created_at := now();
  return new;
end;
$$;
create trigger home_drill_times_stamp before insert on public.home_drill_times
  for each row execute function public.home_drill_times_stamp();

-- a saved clean run is the drill done for the day
create or replace function public.home_drill_times_done()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.home_drill_completions (player_id, item_id, level, mode)
  values (new.player_id, new.item_id, new.level, 'parent')
  on conflict (player_id, item_id, done_on) do nothing;
  return null;
end;
$$;
create trigger home_drill_times_done after insert on public.home_drill_times
  for each row execute function public.home_drill_times_done();

alter table public.home_drill_times enable row level security;
create policy home_drill_times_read on public.home_drill_times for select to authenticated
  using (public.can_see_training(player_id));
create policy home_drill_times_insert on public.home_drill_times for insert to authenticated
  with check (public.can_train(player_id));
create policy home_drill_times_delete on public.home_drill_times for delete to authenticated
  using (
    public.can_train(player_id)
    and recorded_by = (select auth.uid())
    and run_on = public.team_today(public.team_of_player(player_id))
  );
revoke update on public.home_drill_times from anon, authenticated;
