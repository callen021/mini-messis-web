-- Training → Library reorganized (D139).
--
--   1. Drill groups. The at-home drills (category `home`, shown as "Drills") are listed under six
--      groups, and the same name is the drill's tag on a Daily Drills card. A drill's group is its
--      `content.home.skill`; the ten drills are re-tagged here. The six names and their order live
--      in the app (`DRILL_GROUPS`); a group with no drill is not shown.
--
--   2. Publish / Unpublish. Until now an item left Draft by an `update` in the SQL editor.
--      `set_library_item_published` is the one way the app changes the flag, and only a platform
--      admin may call it: items are shared by every team of a sport, so it is not a coach's
--      switch. The table stays read-only from the app otherwise, and the read policy is unchanged:
--      a draft is visible to platform admins only.

-- ---------- 1. the six groups ----------
update public.library_items i
   set content = jsonb_set(i.content, '{home,skill}', to_jsonb(g.name))
  from (values
    ('juggling',                              'First Touch and Ball Control'),
    ('toe-taps',                              'Dribbling and Ball Mastery'),
    ('inside-inside-touches',                 'Dribbling and Ball Mastery'),
    ('sole-rolls',                            'Dribbling and Ball Mastery'),
    ('inside-outside-touches',                'Dribbling and Ball Mastery'),
    ('v-cuts',                                'Dribbling and Ball Mastery'),
    ('l-drags',                               'Dribbling and Ball Mastery'),
    ('cone-dribbling',                        'Dribbling and Ball Mastery'),
    ('wall-passing-and-first-touch',          'Striking (Passing and Shooting)'),
    ('first-touch-and-passing-with-a-parent', 'Striking (Passing and Shooting)')
  ) as g(slug, name)
 where i.slug = g.slug and i.category = 'home' and i.content ? 'home';

-- ---------- 2. publish / unpublish, platform admins only ----------
create or replace function public.set_library_item_published(p_item_id uuid, p_published boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_platform_admin(), false) then
    raise exception 'only a platform admin can publish library items' using errcode = '42501';
  end if;
  if p_published is null then
    raise exception 'published must be true or false' using errcode = '22023';
  end if;
  update public.library_items set is_published = p_published where id = p_item_id;
  if not found then
    raise exception 'no such library item' using errcode = '22023';
  end if;
end $$;

revoke all on function public.set_library_item_published(uuid, boolean) from public, anon;
grant execute on function public.set_library_item_published(uuid, boolean) to authenticated, service_role;
