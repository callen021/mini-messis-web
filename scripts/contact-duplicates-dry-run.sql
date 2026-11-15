-- Duplicate contacts, dry run (D116). Run in the Supabase SQL editor; it changes nothing.
-- Lists, across all teams, every player with two contact rows that look like the same person:
--   · "phone" / "email": the auto-created account row next to a coach-typed row with the same
--     phone digits or the same email. These are what scripts/contact-duplicates-apply.sql merges:
--     the coach's row survives (its name, label and share setting), the account moves over,
--     blank fields are filled from the account row, the account row is deleted.
--   · "name": the same name only. Listed for review, never merged by the script; the coach gets
--     a "Possible duplicate" prompt in the app and decides.
with pairs as (
  select t.name as team, p.first_name as player,
         k.id as keep_id, k.name as keep_name, k.relationship as keep_label, k.phone as keep_phone, k.email as keep_email, k.share_with_team as keep_shared,
         d.id as drop_id, d.name as drop_name, d.phone as drop_phone, d.email as drop_email,
         case
           when public.phone_digits(k.phone) is not null and public.phone_digits(k.phone) = public.phone_digits(d.phone) then 'phone'
           when public.email_key(k.email) is not null and public.email_key(k.email) = public.email_key(d.email) then 'email'
           else 'name'
         end as match
  from public.player_contacts k
  join public.player_contacts d on d.player_id = k.player_id and d.id <> k.id
  join public.players p on p.id = k.player_id
  join public.teams t on t.id = p.team_id
  where k.user_id is null and d.user_id is not null
    and (
      (public.phone_digits(k.phone) is not null and public.phone_digits(k.phone) = public.phone_digits(d.phone))
      or (public.email_key(k.email) is not null and public.email_key(k.email) = public.email_key(d.email))
      or lower(trim(k.name)) = lower(trim(d.name))
    )
)
select match, team, player, keep_name, keep_label, keep_phone, keep_email, keep_shared, drop_name, drop_phone, drop_email, keep_id, drop_id
from pairs
order by match, team, player, keep_name;
