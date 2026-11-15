-- Duplicate contacts, apply (D116). Run in the Supabase SQL editor AFTER reviewing the dry run
-- (scripts/contact-duplicates-dry-run.sql). Merges only the "phone" and "email" pairs: the
-- coach-typed row survives with its name, label and share setting, takes the account and any
-- field it had blank, and the auto-created account row is deleted. Name-only pairs are left for
-- the coaches to decide in the app. Prints one line per merge.
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select k.id as keep_id, d.id as drop_id, k.name as keep_name, d.name as drop_name, p.first_name as player, t.name as team
    from public.player_contacts k
    join public.player_contacts d on d.player_id = k.player_id and d.id <> k.id
    join public.players p on p.id = k.player_id
    join public.teams t on t.id = p.team_id
    where k.user_id is null and d.user_id is not null
      and (
        (public.phone_digits(k.phone) is not null and public.phone_digits(k.phone) = public.phone_digits(d.phone))
        or (public.email_key(k.email) is not null and public.email_key(k.email) = public.email_key(d.email))
      )
    order by t.name, p.first_name, k.sort_order, k.created_at
  loop
    -- the kept row may already have been attached by an earlier pair of the same person
    if exists (select 1 from public.player_contacts c where c.id = r.keep_id and c.user_id is null)
       and exists (select 1 from public.player_contacts c where c.id = r.drop_id) then
      update public.player_contacts k
        set user_id = d.user_id,
            relationship = coalesce(k.relationship, d.relationship),
            email = coalesce(k.email, d.email),
            phone = coalesce(k.phone, d.phone)
        from public.player_contacts d
        where k.id = r.keep_id and d.id = r.drop_id;
      delete from public.player_contacts where id = r.drop_id;
      n := n + 1;
      raise notice 'merged % into % (% on %)', r.drop_name, r.keep_name, r.player, r.team;
    end if;
  end loop;
  raise notice '% merge(s) applied', n;
end $$;
