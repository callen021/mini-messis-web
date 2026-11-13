# Launch checklist

Do these in order. Each step says where to click or what to run. Dashboard labels drift a little
between Supabase releases; the section names below are the ones in use at the time of writing, and
the search box at the top of the Supabase dashboard finds any of them by name.

The live address will be **https://callen021.github.io/mini-messis-web/**. The repo is
`callen021/mini-messis-web` on GitHub. The Supabase project is the one in `.env.local`.

What is already done by code: the deploy workflow (`.github/workflows/deploy.yml`, runs on every
push to `main`), the SPA `404.html` fallback, the bundle budget check, the cleanup and restore SQL
scripts in `scripts/`, and the repository variables `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` (already set; check with `gh variable list`).

---

## 0. Push the pending migrations

Nineteen migrations are waiting since the launch build: `20261110000100_realtime_teams` (fixes live
updates for parents), the parent-feedback rounds (`admin_only_team_creation`, `invite_links`,
`addresses_timezone`, `player_details`, `stats_visibility`, `contacts_directory`, `team_board`),
clock-based playing time (`20261112000100_time_mode`, `20261112000200_game_clock_stints`), the
bench queue (`20261112000300_bench_queue`), team duplication (`20261112000400_duplicate_team`),
and the combined round (`20261112000500_new_team_defaults`, `20261112000600_example_team`,
`20261112000700_join_without_approval`, `20261112000710_members_links`,
`20261112000720_remove_player_parents`, `20261112000800_seasons`) and the clock safety stop
(`20261112000900_clock_cap`, D105) parent RSVP (`20261113000100_rsvp`, D107) and the mid-game formation change
(`20261113000200_formation_change`, D108). Nothing in the app's clock
mode works live until they are applied, the bench on the period cards falls back to roster order
until the queue migration is in, and the Members screen, joining, Load example team and Start new
season need the last six. From the repo folder:

```powershell
npm run db:push
npm run db:types
```

`db:push` asks for confirmation and applies only the new migrations. If `db:types` changes
`src/lib/database.types.ts`, commit it. After the push every team has "Approve new parents before
they join" OFF (D91); turn it on in Settings → Members for a team that wants the old approval flow. Then, for a team that wants the clock: Settings → Team
setup → **Track playing time by: Clock**, set the halves and an optional half length, and set the
starters on the Field tab. Known gap: a substitution tapped with no signal is stamped when it
reaches the server, not when it was tapped (docs/DECISIONS.md D76); fix any stint afterwards from
the game's page.

To make a test copy of a team from the dashboard's SQL editor (there is no signed-in user there, so
the owner is passed explicitly; the owner of the source team is used here):

```sql
select public.duplicate_team(
  (select id from public.teams where name = 'Strikers' and archived_at is null),
  'Test-Strikers',
  (select owner_id from public.teams where name = 'Strikers' and archived_at is null)
);
```

The copy has its own invite link, turned off, and only the owner as coach (D81). Test: open the live site as a parent on one phone and add a
score as the coach on another; the parent's screen updates within a couple of seconds.

## 1. Make GitHub Pages possible on a private repo

GitHub Pages only publishes from a **private** repository on a paid plan (Pro, Team or
Enterprise). On the Free plan the repo must be public. Pick one:

- **Keep it private:** upgrade to GitHub Pro. GitHub → avatar → **Settings → Billing and plans →
  Plans and usage → Upgrade** (Pro is per user, month to month).
- **Make it public:** repo → **Settings → General → Danger Zone → Change repository visibility →
  Make public**. Before you do: the anon key is public by design (RLS protects the data), but
  double-check nothing else sensitive is in the history (`git log -p -S "service_role"` should find
  nothing). The `legacy/` folder and `data/strikers-schedule.csv` would be visible too.

Either way, a Pages site built from this repo is readable by anyone with the link. That is fine:
nothing loads without signing in, and sign-in is enforced by Supabase.

## 2. Turn on Pages with the Actions source

1. Repo → **Settings → Pages → Build and deployment → Source**: choose **GitHub Actions**.
2. Repo → **Actions → Deploy to GitHub Pages → Run workflow → Run workflow** (on `main`). The
   first run after enabling Pages publishes the site; later pushes to `main` publish automatically.
3. Open https://callen021.github.io/mini-messis-web/ — you should see the sign-in screen. Also open
   https://callen021.github.io/mini-messis-web/settings directly: the `404.html` fallback should
   land you on sign-in, not a GitHub 404.

Until step 2 is done every push to `main` will show the **Deploy to GitHub Pages** workflow as
failed at the "Publish" job (the build half still runs). CI is a separate workflow and is unaffected.

## 3. Point Supabase Auth at the live address

Supabase dashboard → project → **Authentication → URL Configuration**:

- **Site URL:** `https://callen021.github.io/mini-messis-web/`
- **Redirect URLs** (Add URL, one per line):
  - `https://callen021.github.io/mini-messis-web/**`
  - `http://localhost:5173/**` (keep for local development)

The app sends people to `…/mini-messis-web/reset` from the password-reset email and to
`…/mini-messis-web/` from a magic link, both covered by the wildcard. Save.

## 4. Custom SMTP through Resend

Supabase's built-in mailer is limited to a few emails an hour and only to team members; real
sign-ups need your own sender.

**In Resend** (https://resend.com):

1. **Domains → Add domain**: the domain you'll send from (e.g. `minimessis.app`). Add the DNS
   records Resend shows (DKIM, SPF/return-path, DMARC) at your DNS host and wait for **Verified**.
2. **API Keys → Create API key**: name `supabase-auth`, permission **Sending access**, domain
   restricted to the one above. Copy the key once; it is shown only at creation.

**In Supabase** → **Project Settings → Authentication → SMTP Settings** (the section is also
reachable from Authentication → Emails → SMTP Settings):

- Enable Custom SMTP: on
- Sender email: `no-reply@<your domain>`
- Sender name: `Mini-Messi's`
- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend`
- Password: the API key from Resend
- Save.

Then **Authentication → Rate Limits**: raise "Rate limit for sending emails" from the default 30 per
hour if you expect a burst of parents signing up the same evening (60 is plenty for a team).

Optional but worth two minutes: **Authentication → Emails → Templates** → "Confirm signup" and
"Reset password": put the team name in the subject, keep `{{ .ConfirmationURL }}` in the body.

Test it: sign up with a personal address on the live site and confirm the email arrives from your
domain.

## 5. Turn email confirmation off

**Authentication → Sign In / Providers → Email**: turn **Confirm email** **off** (leave "Secure
email change" on). Save. The invite link creates a parent's account, signs them in and files the
join request in one step, which needs the account to be usable immediately; there is no
"check your email" page any more (D49). If confirmation is still on, the invite screen says so and
asks the parent to confirm and open the link again.

## 6. Make your account a platform admin

The flag can only be set from the SQL editor (the API refuses it). **SQL Editor → New query**,
replace the email, Run:

```sql
update public.profiles
set is_platform_admin = true
where id = (select id from auth.users where lower(email) = lower('cody.lee.allen@gmail.com'));
```

Confirm with:

```sql
select u.email, p.is_platform_admin
from public.profiles p join auth.users u on u.id = p.id
where p.is_platform_admin;
```

Reload the app: Settings shows an **Admin console** row at the bottom. Creating teams is admin-only, so this is also what lets you create a team for another coach (admin console → Create a team, then add them by email and transfer ownership).

## 7. Run the launch cleanup

This removes every team except the Strikers and resets the Strikers to a clean pre-season state
(games back to upcoming, scores and lineups cleared, every member except you removed; players,
schedule, practices, skill tests and settings kept). It first copies every table into a
`backup_prelaunch` schema.

1. **SQL Editor → New query**, paste the whole of `scripts/reset-strikers-for-launch.sql`, Run.
2. Read the **Messages** (or Results) pane: it prints the counts of what will be deleted and kept,
   then the counts after. It stops with an error if there is not exactly one soccer team named
   "Strikers", or if anything in step 3 fails (nothing is deleted then; the backup stays).
3. Spot-check in **Table Editor**: `teams` has one row, `team_members` has one (you, coach),
   `games` all `upcoming`, `players` intact.
4. It is safe to run again; a second run finds nothing to delete.

If something is wrong, `scripts/restore-from-prelaunch-backup.sql` puts every table back from the
backup. Once you are happy (give it a week of real use), drop the backup:

```sql
drop schema backup_prelaunch cascade;
```

## 8. Delete the test accounts

Do this **after** step 7, because a user who still owns a team cannot be deleted.

**Authentication → Users**: search for `claude.com`, open each test user
(`CoachClaude@`, `ParentClaude@`, `AssistantCoachClaude@` and any others you created), **⋯ →
Delete user**. Their profile and membership rows go with them.

## 9. Invite the first parents

1. In the app (signed in as coach on the Strikers): **Settings (gear) → Members**. The **invite
   link** (`…/join/ABCD2345`) is at the top with **Copy link**, **Share**, **Turn off** and
   **Replace**. Replace makes a new link if it ever leaks; Turn off closes the door without changing it.
2. Send parents the link (Share opens the phone's share sheet with a ready-made message):

   > Join the Strikers on Mini-Messi's — lineups, playing time and scores for the team. Open
   > https://callen021.github.io/mini-messis-web/join/ABCD2345, create your account and pick your
   > child from the roster; I'll approve you. Tip: use Share → Add to Home Screen so it opens like
   > an app.

   The invite also asks for an optional mobile number; on approval it becomes a contact on the
   child's card, shared with team parents unless the family turns that off.

3. Requests appear under **Settings → Members → Waiting for approval** with the child links. You or
   an assistant coach tap **Approve…** to confirm or change the children (or decline). Parents are
   read-only and only ever see their own child's skills results. Assistant coaches are promoted
   from the member list by a coach, never requested through the link.

## 10. Rolling back a bad deploy

The site is whatever the last successful **Deploy to GitHub Pages** run published. Two ways back:

- **Re-publish a known-good commit (fastest, no new commit):** repo → **Actions → Deploy to
  GitHub Pages** → open the last run that was good → **Re-run all jobs**. A re-run builds that
  run's commit again and publishes it.
- **Revert in git (keeps history honest):**

  ```powershell
  git revert <bad-commit-sha>      # creates a revert commit
  git push                         # the deploy workflow publishes it
  ```

  For several commits: `git revert <oldest-bad>^..<newest-bad>`.

The database is not touched by deploys. If a bad release also wrote bad data, the
`backup_prelaunch` schema (step 7) is the restore point until you drop it.

## 11. Still open after launch

- **Jersey sizes for the other sports.** Soccer is tuned (22.5% every row). Baseball, basketball
  and lacrosse still use the formula sizing. When you want: `npm run dev`, open `/dev/field`,
  switch on **Jersey tuner**, pick the sport, drag until it looks right, copy the snippet into
  `JERSEY_W` in `src/sports/field.ts`.
- **Team board:** there are no push notifications. Parents see new posts, comments and
  announcements only when they open the app (the header icon shows an unread dot). Tell them so
  when you share the invite, or post anything urgent somewhere they already look.
- **Offline:** changes made without signal queue in the open tab and send when it reconnects
  (the banner at the top counts them). Closing the tab before that loses them; the app warns first.
