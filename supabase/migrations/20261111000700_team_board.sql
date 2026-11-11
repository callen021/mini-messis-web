-- Team board (round 2, D58): posts and one level of comments per team, text only, with staff
-- announcements, per-user last-read tracking for the unread dot, and realtime. Active members of
-- the team only; pending members see nothing. Authors edit and delete their own; coach, assistant
-- and admin delete anything; only staff set the announcement flag.

create table public.board_posts (
  id               uuid primary key default gen_random_uuid(),
  team_id          uuid not null references public.teams(id) on delete cascade,
  author_id        uuid not null references auth.users(id) on delete cascade,
  body             text not null check (length(trim(body)) between 1 and 2000),
  is_announcement  boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  edited_at        timestamptz
);
create index board_posts_team_idx on public.board_posts(team_id, is_announcement desc, created_at desc);

create table public.board_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.board_posts(id) on delete cascade,
  author_id   uuid not null references auth.users(id) on delete cascade,
  body        text not null check (length(trim(body)) between 1 and 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  edited_at   timestamptz
);
create index board_comments_post_idx on public.board_comments(post_id, created_at);

create table public.board_reads (
  team_id       uuid not null references public.teams(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);

create or replace function public.team_of_post(p_post_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.team_id from public.board_posts p where p.id = p_post_id;
$$;
revoke all on function public.team_of_post(uuid) from public;
grant execute on function public.team_of_post(uuid) to authenticated, service_role;

-- stamps: author fixed, edited_at when the text changes, announcement flag staff-only
create or replace function public.board_posts_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if v_uid is not null then
      new.author_id := v_uid;
    end if;
    if new.is_announcement and v_uid is not null and not public.is_staff(new.team_id) then
      raise exception 'only a coach or assistant can post an announcement' using errcode = '42501';
    end if;
    return new;
  end if;
  new.author_id := old.author_id;
  new.team_id := old.team_id;
  new.created_at := old.created_at;
  if new.is_announcement is distinct from old.is_announcement and v_uid is not null and not public.is_staff(old.team_id) then
    raise exception 'only a coach or assistant can mark an announcement' using errcode = '42501';
  end if;
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger board_posts_guard before insert or update on public.board_posts
  for each row execute function public.board_posts_guard();

create or replace function public.board_comments_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if v_uid is not null then
      new.author_id := v_uid;
    end if;
    return new;
  end if;
  new.author_id := old.author_id;
  new.post_id := old.post_id;
  new.created_at := old.created_at;
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger board_comments_guard before insert or update on public.board_comments
  for each row execute function public.board_comments_guard();

-- ---------- RLS ----------
alter table public.board_posts enable row level security;
alter table public.board_comments enable row level security;
alter table public.board_reads enable row level security;

create policy board_posts_select on public.board_posts for select to authenticated
  using (public.is_active_member(team_id));
create policy board_posts_insert on public.board_posts for insert to authenticated
  with check (public.is_active_member(team_id) and author_id = (select auth.uid()));
create policy board_posts_update_own on public.board_posts for update to authenticated
  using (author_id = (select auth.uid()) and public.is_active_member(team_id))
  with check (author_id = (select auth.uid()));
create policy board_posts_update_staff on public.board_posts for update to authenticated
  using (public.is_staff(team_id)) with check (public.is_staff(team_id));
create policy board_posts_delete on public.board_posts for delete to authenticated
  using ((author_id = (select auth.uid()) and public.is_active_member(team_id)) or public.is_staff(team_id));

create policy board_comments_select on public.board_comments for select to authenticated
  using (public.is_active_member(public.team_of_post(post_id)));
create policy board_comments_insert on public.board_comments for insert to authenticated
  with check (public.is_active_member(public.team_of_post(post_id)) and author_id = (select auth.uid()));
create policy board_comments_update_own on public.board_comments for update to authenticated
  using (author_id = (select auth.uid()) and public.is_active_member(public.team_of_post(post_id)))
  with check (author_id = (select auth.uid()));
create policy board_comments_delete on public.board_comments for delete to authenticated
  using (
    (author_id = (select auth.uid()) and public.is_active_member(public.team_of_post(post_id)))
    or public.is_staff(public.team_of_post(post_id))
  );

create policy board_reads_own on public.board_reads for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_active_member(team_id));

-- ---------- reads ----------
-- The feed: announcements first, then newest; author names come from profiles (private), so a
-- definer function supplies them. Comments ride along as JSON, oldest first.
create or replace function public.board_feed(p_team_id uuid)
returns table (
  id uuid, author_id uuid, author_name text, body text, is_announcement boolean,
  created_at timestamptz, edited_at timestamptz, comments jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.author_id,
         coalesce(nullif(pr.display_name, ''), split_part(u.email, '@', 1)),
         p.body, p.is_announcement, p.created_at, p.edited_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', c.id, 'author_id', c.author_id,
                    'author_name', coalesce(nullif(cpr.display_name, ''), split_part(cu.email, '@', 1)),
                    'body', c.body, 'created_at', c.created_at, 'edited_at', c.edited_at)
                  order by c.created_at)
           from public.board_comments c
           join auth.users cu on cu.id = c.author_id
           left join public.profiles cpr on cpr.id = c.author_id
           where c.post_id = p.id
         ), '[]'::jsonb)
  from public.board_posts p
  join auth.users u on u.id = p.author_id
  left join public.profiles pr on pr.id = p.author_id
  where p.team_id = p_team_id and public.is_active_member(p_team_id)
  order by p.is_announcement desc, p.created_at desc;
$$;

create or replace function public.board_mark_read(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member(p_team_id) then
    raise exception 'not a member of this team' using errcode = '42501';
  end if;
  insert into public.board_reads (team_id, user_id, last_read_at)
  values (p_team_id, (select auth.uid()), now())
  on conflict (team_id, user_id) do update set last_read_at = now();
end;
$$;

-- Anything by someone else since the caller last opened the board?
create or replace function public.board_unread(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as uid,
           coalesce((select r.last_read_at from public.board_reads r
                     where r.team_id = p_team_id and r.user_id = (select auth.uid())), '-infinity'::timestamptz) as since
  )
  select public.is_active_member(p_team_id) and (
    exists (select 1 from public.board_posts p, me where p.team_id = p_team_id and p.author_id <> me.uid and p.created_at > me.since)
    or exists (select 1 from public.board_comments c join public.board_posts p on p.id = c.post_id, me
               where p.team_id = p_team_id and c.author_id <> me.uid and c.created_at > me.since)
  );
$$;

revoke all on function public.board_feed(uuid) from public;
revoke all on function public.board_mark_read(uuid) from public;
revoke all on function public.board_unread(uuid) from public;
grant execute on function public.board_feed(uuid), public.board_mark_read(uuid), public.board_unread(uuid)
  to authenticated, service_role;

-- ---------- realtime ----------
alter publication supabase_realtime add table public.board_posts, public.board_comments;
