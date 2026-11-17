-- Practice library (D123), prototype with one item: First Touch (soccer, Fundamentals).
--
-- `library_items` is the built-in content: one row per item, the page content as JSON with one
-- section per tab (`learn`, `setup`; a later `video` section needs no schema change). Every
-- signed-in user reads the published rows; nobody writes them from the app, content changes
-- arrive by migration.
--
-- `team_library_overrides` is what a team changed: a small JSON object of the item's adjustable
-- setup numbers (cones, spacing, duration, …). Members of the team read it, coaches and
-- assistant coaches write it, and a trigger refuses a key the item does not declare adjustable or
-- a value outside its range. The built-in row is never touched; "Reset to default" deletes the
-- override row.
--
-- Step images live in the public `practice-library` storage bucket; a step stores the object
-- path, so swapping an image is a one-row update. Nothing in the app writes to the bucket.

create table public.library_items (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sport         public.sport not null,
  category      text not null check (category in ('fundamentals', 'tactics', 'position')),
  title         text not null check (length(trim(title)) between 1 and 80),
  age_min       int check (age_min is null or age_min between 3 and 19),
  age_max       int check (age_max is null or age_max between 3 and 19),
  sort_order    int not null default 0,
  is_published  boolean not null default true,
  content       jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (age_min is null or age_max is null or age_min <= age_max)
);
create index library_items_sport_idx on public.library_items (sport, category, sort_order);
create trigger library_items_updated_at before update on public.library_items
  for each row execute function public.set_updated_at();

alter table public.library_items enable row level security;
create policy library_items_read on public.library_items for select to authenticated
  using (is_published);
-- no insert / update / delete policy: built-in content is read-only from the app
revoke insert, update, delete on public.library_items from anon, authenticated;

create table public.team_library_overrides (
  team_id     uuid not null references public.teams(id) on delete cascade,
  item_id     uuid not null references public.library_items(id) on delete cascade,
  params      jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  primary key (team_id, item_id)
);
create trigger team_library_overrides_updated_at before update on public.team_library_overrides
  for each row execute function public.set_updated_at();
create trigger team_library_overrides_stamp before insert or update on public.team_library_overrides
  for each row execute function public.stamp_updated_by();

-- A team's override may only hold the numbers its item declares adjustable, inside their range.
create or replace function public.check_library_override()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item   public.library_items%rowtype;
  v_sport  public.sport;
  v_key    text;
  v_val    jsonb;
  v_def    jsonb;
  v_num    numeric;
  v_step   numeric;
begin
  select * into v_item from public.library_items i where i.id = new.item_id;
  select t.sport into v_sport from public.teams t where t.id = new.team_id;
  if v_item.id is null or v_sport is null or v_item.sport <> v_sport then
    raise exception 'This item is not in the team''s library' using errcode = '23514';
  end if;
  for v_key, v_val in select e.key, e.value from jsonb_each(new.params) e loop
    select d into v_def
      from jsonb_array_elements(coalesce(v_item.content #> '{setup,params}', '[]'::jsonb)) d
     where d ->> 'key' = v_key;
    if v_def is null or coalesce((v_def ->> 'adjustable')::boolean, false) is not true then
      raise exception 'The setting "%" cannot be changed', v_key using errcode = '23514';
    end if;
    if jsonb_typeof(v_val) <> 'number' then
      raise exception 'The setting "%" must be a number', v_key using errcode = '23514';
    end if;
    v_num := (v_val #>> '{}')::numeric;
    v_step := coalesce((v_def ->> 'step')::numeric, 1);
    if v_num <> trunc(v_num)
       or v_num < (v_def ->> 'min')::numeric
       or v_num > (v_def ->> 'max')::numeric
       or mod(v_num - (v_def ->> 'min')::numeric, v_step) <> 0 then
      raise exception 'The setting "%" is out of range', v_key using errcode = '23514';
    end if;
    v_def := null;
  end loop;
  return new;
end;
$$;
create trigger team_library_overrides_check before insert or update on public.team_library_overrides
  for each row execute function public.check_library_override();

alter table public.team_library_overrides enable row level security;
create policy team_library_overrides_read on public.team_library_overrides for select to authenticated
  using (public.is_active_member(team_id));
create policy team_library_overrides_insert on public.team_library_overrides for insert to authenticated
  with check (public.is_staff(team_id));
create policy team_library_overrides_update on public.team_library_overrides for update to authenticated
  using (public.is_staff(team_id))
  with check (public.is_staff(team_id));
create policy team_library_overrides_delete on public.team_library_overrides for delete to authenticated
  using (public.is_staff(team_id));

-- Step images: a public bucket (the pictures are generic teaching material), WebP/JPEG/PNG only.
-- No storage policy is added, so the app can read by public URL and cannot write; uploads are
-- done from the dashboard (hosted) or scripts/upload-practice-images.mjs (local).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('practice-library', 'practice-library', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- ---------- First Touch ----------
-- Diagram coordinates are in cone gaps (x along the line of cones, y towards the viewer): the
-- picture is a schematic, the spacing label carries the distance. A point is [x, y], an anchor id
-- ("c0" = the first cone, "passer"), or [anchor, dx, dy]. "$key" reads a setup number. An arrow
-- with "repeat": "c" is drawn again at every following cone.
insert into public.library_items (slug, sport, category, title, age_min, age_max, sort_order, content)
values ('first-touch', 'soccer', 'fundamentals', 'First Touch', 6, 10, 10, $json$
{
  "learn": {
    "tagline": "First touch into space, move with it!",
    "focus": "Receive the ball and move it away from pressure, then keep the play going.",
    "steps": [
      {
        "title": "Receive the Ball",
        "text": "Focus on the ball and get ready. Use the inside of your foot to cushion the pass and keep it close.",
        "image": { "path": "first-touch/step-1.webp", "width": 368, "height": 284 }
      },
      {
        "title": "Redirect",
        "text": "Use your first touch to move the ball away from pressure, not toward a defender.",
        "image": { "path": "first-touch/step-2.webp", "width": 362, "height": 284 }
      },
      {
        "title": "Move With It",
        "text": "Keep the ball close and move after your first touch. Get into a better position and look up.",
        "image": { "path": "first-touch/step-3.webp", "width": 351, "height": 284 }
      },
      {
        "title": "Make the Next Play",
        "text": "Choose your next move: dribble, pass, or keep going into open space.",
        "image": { "path": "first-touch/step-4.webp", "width": 368, "height": 284 }
      }
    ],
    "cues": [
      "Keep your head up.",
      "Cushion the ball with the inside of your foot.",
      "Move the ball away from pressure.",
      "Keep the ball close and move with it."
    ],
    "compare": [
      { "wrong": "First touch goes toward the defender.", "right": "First touch goes into open space." },
      { "wrong": "Stopping the ball dead and standing still.", "right": "Touch and move with it." },
      { "wrong": "A hard touch that gets away.", "right": "A soft touch that stays close." },
      { "wrong": "Head down the whole time.", "right": "Look up after the touch." },
      { "wrong": "Only using the strong foot.", "right": "Practice both feet." }
    ],
    "big_picture": "A good first touch gives you time, keeps you safe, and opens up your options. It's the first step in all the other plays we'll learn!"
  },
  "setup": {
    "params": [
      { "key": "cones", "label": "Cones", "type": "count", "default": 4, "min": 3, "max": 5, "adjustable": true },
      { "key": "spacing", "label": "Spacing", "type": "distance", "default": [3, 5], "min": 2, "max": 8, "adjustable": true },
      { "key": "players", "label": "Players", "type": "text", "default": "2+" },
      { "key": "duration", "label": "Duration", "type": "duration", "default": null, "min": 5, "max": 30, "step": 5, "adjustable": true }
    ],
    "diagram": {
      "elements": [
        { "type": "cones", "id": "c", "from": [0, 0], "step": [1, 0], "count": "$cones" },
        { "type": "measure", "from": "c0", "to": "c1", "label": "$spacing" },
        { "type": "player", "id": "passer", "role": "passer", "label": "Passer", "at": ["c0", -1.2, 0.8] },
        { "type": "player", "id": "receiver", "role": "receiver", "label": "Receiver", "at": ["c0", -0.22, 0.8] },
        { "type": "arrow", "kind": "pass", "from": "passer", "to": "receiver" },
        { "type": "arrow", "kind": "touch", "from": ["c0", -0.05, 0.95], "to": ["c0", 0.4, 1.45], "repeat": "c" },
        { "type": "arrow", "kind": "dribble", "from": ["c0", 0.46, 1.45], "to": ["c1", -0.22, 1.02], "repeat": "c" }
      ]
    },
    "steps": [
      "Set up the cones in a straight line.",
      "A coach or teammate passes the ball to the player.",
      "The player takes a first touch to the side or forward, away from the cone (the cone is the \"pressure\").",
      "The player dribbles to the next cone and repeats.",
      "Repeat using both feet."
    ],
    "equipment": ["Cones", "One ball per pair"]
  }
}
$json$::jsonb)
on conflict (slug) do nothing;
