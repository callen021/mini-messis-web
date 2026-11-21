# Technical decisions

Short, dated records of technical choices not spelled out in `BUILD-PROMPT.md`. Product
decisions are asked, not recorded here.

## 2026-11-09 — Phase 1

### D1. Vite 8 / Vitest 5 / TypeScript 6, React pinned to 18.3

The spec requires React 18 but leaves tooling versions open. `@vitejs/plugin-react` 6 only
supports Vite 8, and every other plugin we need (Tailwind, PWA, Vitest) already supports Vite 8,
so we start on the current majors rather than pin a year-old toolchain. React stays at exactly
18.3.1 (`--save-exact`) because React 19 changes ref/forwardRef and `act` semantics that the
spec did not ask for.

### D2. Theme and sport attributes live on `<html>`, not `<body>`

The legacy app put `data-theme` / `data-sport` on `<body>`. We put them on `<html>` so a tiny
inline script in `index.html` can apply the saved theme from `localStorage` before React
mounts, avoiding a white flash for dark-mode users opening the PWA. The token selectors in
`tokens.css` are otherwise a verbatim port. `color-scheme` is set in the dark blocks so native
controls (date pickers, selects) follow the theme.

### D3. Legacy CSS is ported as global, class-named stylesheets; Tailwind for layout glue

The legacy component CSS is tightly tuned and heavily cross-referenced
(`.prow .toggle`, `.form .seg button`, print overrides). Splitting it into CSS Modules would
scatter those relationships. It is ported almost line-for-line into `components.css`,
`field.css` and `print.css` under the same class names so it can be diffed against the legacy
file. Tailwind v4 provides the reset and utilities; tokens are exposed to Tailwind through
`@theme inline` (`bg-panel`, `text-text2`, `border-sep`, …) for new layout work. Unlayered
legacy rules win over Tailwind's `@layer base` reset by design.

### D4. Tab bar at the bottom (product decision), Field actions become a sticky in-page toolbar

The legacy app fixed its tab bar to the top; the product owner chose the **bottom**, matching
`docs/prototypes/skills.html`, with the Settings gear at the right end of the same bar. The
Field page's Auto-fill / Clear / Print strip is therefore no longer a separate fixed bottom bar:
`<Toolbar sticky>` renders it inside the content, `position: sticky` just above the tab bar.
`Tabbar` keeps a `position="top"` escape hatch because it costs nothing, but nothing uses it.

### D5. Device-local UI state in Zustand (`mm-ui`), server copy later

Theme, field view and the current sport (for the tint) are kept in a persisted Zustand store.
From Phase 3 the profile row is the source of truth and this store becomes the local cache so
the first paint is right before the profile loads.

### D6. Sheets are React components plus one imperative hook

Legacy `sheet()` / `formSheet()` were promise-returning functions. We keep that ergonomics for
confirmations (`useActionSheet()` returns a promise) because dozens of call sites are "ask,
then act". Forms are declarative (`<FormSheet open onClose>`) because they hold React state.
Both share the `Sheet` primitive: portal, focus trap, Escape/backdrop close, body scroll lock,
focus returned to the opener, content kept mounted through the exit animation.

### D7. Dev gallery is a lazy route behind `import.meta.env.DEV`

`/dev/components` is registered only when `DEV` is true or `VITE_DEV_ROUTES=true`. The dynamic
import sits inside that dead branch so production bundles do not include the chunk. No
Storybook, per the spec.

### D8. Vite `base` comes from `BASE_PATH`

GitHub Pages serves project sites under `/<repo>/`. The deploy workflow (Phase 8) sets
`BASE_PATH=/mini-messis-web/`; everywhere else it is `/`. React Router's `basename` is derived
from `import.meta.env.BASE_URL` so the same build logic works on Cloudflare/Vercel/Amplify at
the root. Moving to a custom domain later is a one-line change to that variable in the workflow.

### D11. Dev server listens on the LAN

`server.host = true` (and `preview.host`) so `npm run dev` is reachable from a phone on the same
Wi-Fi without `--host`; Vite prints the Network URL on start.

## 2026-11-09 — Phase 2

### D12. Sports engine is pure and immutable

`src/sports/` has no React, no Supabase and no shared state. Every lineup function
(`remap`, `fixPeriods`, `autoFill`, `assignSlot`, …) takes periods/players/formations as
arguments and returns new objects instead of mutating, so TanStack Query and React can diff
results and optimistic updates stay cheap. The legacy code mutated `state` in place; the rules
were ported line for line, with the random tie-break injectable for deterministic tests.

### D13. Positions carry an explicit `code`

Legacy positions had `code` only for soccer/lacrosse and fell back to `role` elsewhere
(`pos.code || pos.role` scattered through the renderer). The port normalises every position to
`{ role, code, x, y }` at generation time so the database (`lineup_slots.position_code`) and the
UI never need the fallback.

### D14. Field artwork is static files, runtime-cached

The eight base64 WebP images (≈2.3 MB) were extracted to `public/fields/<sport>-<view>.webp`.
Image dimensions and homographies live in `src/sports/field.ts`. They are excluded from the
service worker precache and cached on first use (CacheFirst, 90 days) so installing the PWA stays
fast and a baseball-only team never downloads the soccer pitch. Football has no artwork and reuses
the soccer pitch; the sport is disabled anyway.

## 2026-11-09 — Phase 3

### D16. Hosted Supabase for development; local Supabase only in CI

The product owner's laptop targets the hosted project (`supabase link`, `db push`). GitHub
Actions runs `supabase start`, applies every migration from scratch, runs the pgTAP tests and
regenerates the types. Secrets never touch the agent: `login`/`link`/`db push` are run by a human
in a terminal, and only the anon key lives in `.env.local` / Actions variables.

### D17. Authorization helpers are SECURITY DEFINER functions

Policies call `is_active_member(team_id)`, `is_staff`, `is_coach`, `is_owner`, `is_guardian_of`
and `team_of_*` instead of sub-selecting `team_members` inline. This avoids RLS recursion on
`team_members`, keeps each policy one line, and gives the planner a stable, inlinable predicate.
All helpers set an empty `search_path` and are granted to `authenticated` only.

### D18. Column-level rules live in triggers, not policies

Postgres RLS is row-level. "Assistants may edit setup but not rename or change sport",
"owner_id changes only through transfer_ownership", "a team keeps ≥ 1 active coach" and
"a test's metric locks once it has results" are enforced by BEFORE triggers that raise `42501`
or `23514`, so a client bypassing the UI still cannot do them.

### D19. The client supplies the default template and skill tests to `create_team`

Sport rules live in `src/sports/`, so the database cannot know the default formation or the
default skill-test list. `create_team(...)` takes `p_template` (one lineup per period with role +
code per slot) and `p_skill_tests` (Phase 6) as jsonb built from the sport definition. The
function validates shape and inserts atomically.

### D20. Join codes are server-generated base32 without I/L/O/U/0/1

`generate_join_code()` draws 8 characters from a 30-letter alphabet (≈ 6.6 × 10¹¹ codes) using
`gen_random_bytes`. Lookups and join requests are rate-limited to 5 per 10 minutes per user via
`join_attempts`. A join-code preview (`lookup_join_code`) returns only the team name, sport and
roster first names + numbers so a parent can pick their child before the coach approves.

### D21. Unlisted-child requests are their own table

A parent whose child is not on the roster yet has no `player_id` to link to.
`unlisted_child_requests(member_id, child_name)` carries the free-text name on the membership
request and is cleared on approval; the coach adds the player and links them afterwards.

### D22. Profiles are private, so member names come from a function

`profiles` is readable only by its owner. Coaches see members' names and emails through
`list_team_members(team_id)` (staff only), which joins `auth.users` and `profiles` under
SECURITY DEFINER. Pending users see their own request's team name through
`my_pending_requests()` for the same reason.

## 2026-11-09 — Phase 4

### D23. A plan is saved whole, atomically, with last-write-wins

Every lineup edit (jersey tap, formation change, auto-fill, clear) computes the next plan with the
pure engine and sends all periods to `save_lineups(team_id, game_id, periods)`, which rewrites the
lineups and slots in one transaction. A plan is at most 12 × 15 slots, so the payload is tiny, the
client never has to diff slots, and partial writes cannot leave a period half-updated. Concurrent
coaches overwrite each other at the plan level (last write wins), as the spec allows for v1; the
Realtime subscription makes the loser see the result within a second or two.

### D24. Optimistic updates through TanStack Query, no local draft state

Mutations set the query cache to the expected result in `onMutate`, roll back in `onError` and
refetch in `onSettled`. Pages render straight from the cache, so the UI is instant on a bad
signal and self-corrects. The offline mutation queue (Phase 8) will sit underneath the same hooks.

### D25. Players are soft-deleted; "out" clears them from the plan server-side

`archive_player` sets `archived_at` and nulls the player out of the template and live game in one
call, so game history keeps the snapshot while the roster and plan drop them.
`set_player_available(false)` does the same clearing (legacy "out · positions cleared"). Completed
games are never touched by either.

### D26. Player picker is a bottom sheet, bench first

The legacy jersey `<select>` is replaced by `PlayerPickerSheet`: bench players (with their period
count) first, then "move from X" for players already on the field, then Clear. Semantics match the
legacy `onchange`: picking a player who holds another slot moves them and opens their old slot.
The rotation grid's chip menu keeps the legacy swap semantics (`placePlayer`).

### D15. Jerseys are SVG strings injected once per jersey

`jerseySvg()` returns the legacy SVG markup (gradients keyed by a per-jersey id) and the
`<Jersey/>` component injects it with `dangerouslySetInnerHTML`. Rewriting ~60 path elements as
JSX bought nothing and risked drift from the legacy artwork; the string is generated from our
own constants, never from user input. Shared patterns live in `<JerseyDefs/>`, rendered once per
page.

### D9. App icon is a vector (`public/icon.svg`); PNG sizes are derived from it

No hi-res source of the legacy icon exists, so the mark was redrawn as an SVG in the same spirit
(soccer ball on a striped green pitch), full-bleed so the same artwork serves as the maskable
icon. `pwa-192/512`, `pwa-512-maskable`, `apple-touch-icon` (180) and `favicon` (64) are rendered
from it with sharp; re-run that render whenever the SVG changes. The SVG is also the favicon.

### D10. Playwright runs against the dev server with chromium only

Smoke tests need `/dev/components`, so the Playwright web server is `vite dev`. Two projects:
a Pixel 7 profile (phone width, touch) and Desktop Chrome. WebKit is not installed in CI to keep
it fast; iOS-specific checks are done manually on device.

### D27. The score is always the sum of `score_events`; the client never stores a total

Every screen that shows a score (Field cards, Games list, game detail, Stats tiles) sums the log,
either through the `game_scores` view or from the cached event list. Adding, editing or deleting an
event is an optimistic list mutation that also invalidates the game, the games list, the live game
and the stats queries. Realtime on `score_events` and `plate_appearances` (unfiltered, RLS-scoped)
does the same for other viewers. The 400 ms double-tap guard from the legacy `addGoal` lives in
`scoring.ts` and is shared by every score button.

### D28. Per-sport scoring rules live in the sport definition, mirrored by the SQL trigger

`SportDefinition.scoring` names the event kinds (`goal`; `free_throw`/`field_goal`/`three_pointer`;
`run`), their points, whether assists exist, the panel layout and the stat columns. The database
trigger `score_events_validate` is the authority on points; the client sends the same value so
optimistic rows render correctly before the round trip. Basketball's panel shows the scorer picker
inline (defaulting to the last scorer) above the six +1/+2/+3 buttons so one tap posts the score;
the spec's "tapping opens the scorer picker" was read as "the scorer is chosen in the same sheet".

### D29. Stats are computed in SQL by `player_season_stats`

One `security invoker` function returns every column for every sport (periods played, goals,
assists, basketball points by type, runs, batting line). Column selection, AVG and sorting happen
in the client from the sport's `columns`. Scope is the current season (live + done games) or one
game. Removed players appear with their last `game_players` snapshot name and `removed = true`;
rows with nothing to show are hidden client-side, as in the legacy table.

### D30. Baseball batting order is stored on the player row

`players.batting_order` (set atomically by `set_batting_order`) and `teams.last_batter_player_id`
replace the legacy `order[]`/`lastBat`. Players marked out are skipped when computing the order,
so their slot is kept for when they return. The "batted" tap sets the last batter and, during a
live game, opens the optional result sheet; "Save · batted, no result" keeps the one-tap flow.
Extra innings append an empty period to the live game's lineups through `save_lineups`; the
template is untouched.

### D31. Schedule fields and `.ics` export are client-only additions

`games` already carried `start_time`, `location`, `home_away` and `parent_notes`. The Games page
shows an Upcoming section with those fields (parents read it), the detail page edits them inline,
and "Add to calendar" builds an RFC 5545 file in the browser (floating local time, 90-minute
default length, all-day when no start time). No server component is involved.

### D32. Skills: defaults live in the sport definition, teams own their copies

`DEFAULT_SKILL_TESTS` (src/skills/defaults.ts) holds the per-sport sets; `create_team` seeds them and
`restore_skill_tests` re-adds missing or hidden ones by `key` without overwriting edits. A team test
whose key matches a default shows DRAFT (non-soccer sets) or nothing; other keys show CUSTOM.
There is no cross-sport library (see D38). `skill_tests.attempts` was
added so the metric lock covers it, as the spec lists.

### D33. Personal bests are computed in the client from the raw result rows

Results are fetched per team (`skill_results` for the roster's player ids; RLS trims parents to
their children) and best/latest/trend/sparkline are pure functions over that list. Two-sided tests
use the right side for the headline numbers, as in the prototype. No aggregate view is exposed to
the database layer, which keeps the parent-only-own-child rule enforceable by RLS alone.

### D34. Legacy import is normalised in the client, loaded atomically by SQL

The old `mini-messis-coach-v5` file is parsed by `normalizeLegacyBackup` with the same rules as the
legacy `normalize()` (status fallback, quarter clamp, 40-char names, duplicate games dropped, one live
game), then mapped onto roles/codes with the sports engine, which SQL cannot do. `import_legacy_backup`
wipes the team's players, lineups and games when `replace` is true and inserts the payload in one
transaction. "Load example team" reuses the same path with the sport's sample roster.

### D35. Team setup changes re-shape plans client-side through `save_lineups`

Changing players on the field, goalkeeper or period count updates the team row, then resizes and
remaps the template and any live game with the engine (`resizePeriods` + `fixPeriods`, the legacy
`tidy()`), saving each through `save_lineups`. Completed games keep their lineups. Deleting a team
archives it (`archived_at`), so history survives for a later restore by hand.

### D36. Baseball shows no formation picker

Baseball has one formation per field size ("Standard"), so the Field cards and the game detail hide
the formation select and name whenever a sport exposes a single formation.

### D37. 3D view: perspective placement, constant jersey size

Jerseys in the perspective view keep their homography position but no longer shrink with depth;
`placeFixed()` uses the formation's `w` as a constant percent of the stage, multiplied by a per-sport
factor (`PERSP_JERSEY_SCALE`: soccer 0.84, lacrosse 0.82, baseball and basketball 1). The factors were
chosen so that no two jerseys in the same row touch at a 343px stage (a 375px phone) for any size or
formation; a test enforces that. Goals and hoops still scale with depth so the field reads as 3D. The
flat view is unchanged, and the dev field page has a "Depth-scaled jerseys" switch to compare with the
legacy look. Football's offensive line overlaps as it did in the legacy app; the sport is disabled.

### D38. No cross-sport test library; defaults are seeded server-side

A soccer coach never sees baseball drills, so "Add from library" is gone. Shared athletic tests
(sprint speed) sit in every sport's own default set under the key `sprint`, with sport-appropriate
wording. The default sets are duplicated in SQL (`default_skill_tests(sport)`, kept in step with
`src/skills/defaults.ts` by a unit test) so the server can seed them: a backfill migration loads the
set for every team with zero tests, `create_team` falls back to it when given an empty list, and
`restore_skill_tests` with no payload seeds a team that has none. Restore defaults is therefore the
only way to bring built-ins back and Add a custom test the only way to add something new.

### D39. Platform admin is a profile flag that acts as a coach everywhere

`profiles.is_platform_admin` (default false) can only be changed in the SQL editor: a trigger refuses
any change made with a JWT, and no RPC or UI sets it. `member_role_on()` returns `coach` for an admin
and `is_owner()` is true for them, so every existing policy and RPC admits them without changing the
coach/assistant/parent rules for anyone else; pgTAP proves a non-admin gains nothing. The console at
`/admin` (visible only to admins) lists teams and users through two admin-only RPCs, and a team page
renames, resets the code, manages members and requests, archives, and "opens as coach" by storing
the team id in session storage, which `RequireTeam` turns into a coach context. Changing a team's
sport is admin-only (`admin_change_sport`): the team shape, template lineups, any live game's lineups
and the skill tests reset for the new sport (tests with results are hidden, not deleted); players,
games and members stay. Coaches have no sport control in Settings.

### D40. Practices live beside games; they are cancelled, never deleted

Practices get their own table (`practices`: date, start, optional end, location, a note parents can
read, `scheduled|cancelled`) with the games policies: active members read, coach/assistant insert and
update, and only a platform admin can delete a row. A coach "cancels" instead, and the row stays on
the schedule struck through with a Cancelled badge, so a parent who saw it earlier learns it was
called off rather than finding it gone. Audit columns (`created_by`, `updated_by`) are stamped by
trigger; `team_id` and `season_id` cannot be moved after insert. Practices appear on the Schedule
tab merged with upcoming games by date then start time, drawn quieter with a Practice badge (the
tab's layout is D41). A repeating practice is expanded on the client (weekday between two
dates, capped at 60 weeks, with a checkbox per date to skip) and inserted as independent rows: there
is no series object, so editing or cancelling one never touches the others. Start time is nullable
like a game's (an all-day .ics event); the .ics for a practice ends at `end_time` or an hour after the
start. `scripts/strikers-practices-2026.sql` seeds the Strikers' winter dates idempotently from the
SQL editor, matching the team by name and skipping existing (date, start time) pairs.

### D41. The Games tab is the Schedule; results live under Stats

The tab is labelled **Schedule** (same calendar icon, same `/games` and `/games/:id` routes, so
links and the back button keep working). It shows only what is coming up: segments **All | Games |
Practices**, All by default and merged by date then start time; the live-game card is pinned above
the segments so it is on top whichever one is chosen. Cancelled practices stay in All and
Practices (D40); past practices simply drop off. The New game / New practice buttons became one
round "+" in the page header, shown to coach, assistant and admin only, that opens an action sheet
with the two choices, so the list starts at the top of the screen and parents see no controls.
Completed games moved to **Stats → Season** as a **Results** section between the team tiles and
the player table: newest first with opponent, date, score and a W/L/D badge, tapping opens the
game, three shown with a "See all results" row that expands the rest in place. The remembered
segment (`gamesView`) was re-versioned: the old schedule | results values migrate to All.

### D42. Jersey size is a per-sport table tuned by eye

`JERSEY_W` in `src/sports/field.ts` gives a sport's jersey width by the player count of the
formation's widest row (1–5; wider rows use the 5 value), as a percent of the field in the top-down
view and of the stage in 3D. The numbers come from the dev field page's jersey tuner (/dev/field):
tune, copy the snippet, paste it over the sport's entry. A sport without an entry keeps the D37
rule (formation `w` × per-sport 3D factor), so sports are tuned one at a time. Soccer is tuned to
22.5% for every row, which the coach preferred over the D37 "never touch" sizing: on a 375px phone
far-end rows of three overlap by about a tenth of a jersey and rows of four or five by up to a
third. The field test therefore only requires that tuned jerseys overlap a neighbour by less than
half their width (enough to keep names readable), while untuned sports still must not touch.

### D43. Offline: paused mutations, retried network errors, last write wins

Every edit is already optimistic (D24). The query client sets mutations to `networkMode: 'online'`,
so while `navigator.onLine` is false TanStack Query holds them paused in order and sends them when
the connection returns; a request that fails at the network level (fetch itself throws) retries up
to three times with 1s/2s/4s backoff, while a server refusal (RLS, validation) fails at once and
the screen's toast shows it. `SyncBanner` at the top of every tab page counts the unsent changes
("Offline · 2 unsaved changes will send…", "Saving 1 unsaved change…") and the app warns before the
tab closes while any remain. The queue lives in memory only: closing the tab drops it, which is
documented rather than solved with a persisted mutation log (serialising mutation functions and
replaying them against a changed server state is more machinery than a youth team needs). Conflicts
are last write wins, as the spec allows for v1.

### D44. Three error boundaries and page-shaped skeletons

A class `ErrorBoundary` wraps the router (outermost, plain-HTML fallback with Try again / Reload),
React Router's root `errorElement` covers routing errors, and a pathless route inside `TabLayout`
gives every tab page its own `TabError` so the team switcher and tab bar survive a crash on one
screen. `LoadingScreen` now renders a `SkeletonPage` (title, subtitle and a grouped list of
shimmering rows, animation off under reduced motion) with the label kept for screen readers, so
every screen that showed "Loading…" shows the shape of what is coming instead.

### D45. GitHub Pages deploy from Actions with a bundle budget

`deploy.yml` runs on push to `main`: build at `BASE_PATH=/mini-messis-web/`, fail if the
initial JS (entry chunk plus modulepreloads) is over 250 kB gzipped (`scripts/check-bundle.mjs`),
copy `index.html` to `404.html` (Pages serves it for unknown paths, so deep links and reloads
work), add `.nojekyll`, upload and publish. The Supabase URL and anon key are repository
variables, not secrets: the anon key ships in the bundle anyway and RLS is the protection. Pages
publishing from a private repo needs a paid GitHub plan, so enabling Pages (and choosing between
Pro and making the repo public) is a documented owner step in `docs/LAUNCH.md`; the workflow's
Publish job fails visibly until it is done. Lighthouse is a local script (`npm run lighthouse`)
rather than a CI gate, because scores on shared runners swing too much to block merges on.

### D46. No `user-scalable=no`; double-tap zoom is stopped with `touch-action`

The legacy viewport tag disabled zoom so a fast double tap on a jersey during a game never zoomed
the page. That tag fails Lighthouse's accessibility audit (and iOS has ignored it since iOS 10
anyway), and it kept the audit at 89 against the ≥ 95 bar. `touch-action: manipulation` on the
document gives the same protection (no double-tap zoom, panning and pinch zoom untouched), so the
viewport tag is now the plain `width=device-width, initial-scale=1, viewport-fit=cover`. Inline
links inside footnotes also get an 8px tap padding for the target-size audit.

## 2026-11-10 — Parent-feedback round

### D47. Auth errors are translated before a parent sees them

Supabase Auth's messages are written for developers: "Signups not allowed for otp" is what a
parent gets when they ask for a magic link with an email that has no account, and "Invalid login
credentials" covers both a typo in the email and a wrong password. `src/auth/errors.ts` maps the
error code (preferred) or message to one sentence and an optional follow-up action: no account →
"We couldn't find an account for that email" with a **Create an account** button that carries the
typed email to the sign-up form; wrong password → a reset link; 429 / `over_*_rate_limit` → "Too
many attempts"; duplicate account, unconfirmed email, weak password and network failures each get
their own line; anything unknown falls back to the raw message so nothing is hidden. The sign-in
screen's "Create an account" is a full-width secondary button under the form rather than a
footnote link, since for parents it is the second most common tap on that screen.

### D48. Only a platform admin creates teams

Parents and coaches never create teams themselves: `create_team()` refuses anyone without the
admin flag (42501) and an explicit insert policy on `teams` refuses a direct insert too, with
pgTAP covering both and the signed-out case. The admin who creates a team becomes its owner and
coach, then hands it over from the admin console (add the coach by email, transfer ownership). The
"I'm a coach" entry on the welcome page and the "Create a new team" items in the team switcher,
Settings and the pending screen are gone for everyone else; a signed-in user with no team sees
"Ask your coach for an invite link" and a box to paste a code. Locally and in CI the seeded demo
coach carries the flag so the Playwright coach flow can still create its team; the pgTAP suites
flag a creator only around the `create_team` call so the rest of each suite keeps exercising
plain coach permissions.

### D49. The invite link: one screen from "tap" to "waiting for approval"

Parents were getting lost between sign-up, the verification email, the code and the child picker,
so joining is now one URL: `…/join/<code>`. `lookup_invite(code)` is callable signed out and
returns the team name, sport, roster first names and whether the invite is on, so the page can
show the whole form before an account exists; a visitor fills in name, email, password and picks
their child, and one tap runs `signUp` → `request_join`. A signed-in user who opens the link
sees only the picker. Email confirmation is off in Supabase for this to work (LAUNCH step 5), so
the verify page is gone; if a project still has confirmation on, the screen says so rather than
silently failing. Requests are parent-only (`request_join` rejects other roles): assistants are
promoted by a coach or admin from the member list, never requested. Typing a code by hand opens
the same screen. `teams.join_enabled` lets a coach turn the link (and the typed code) off and on
without changing it; Replace (`rotate_join_code`) makes a new code and turns the invite back on.
Approvals, declines and child-link confirmations are for coach, assistant and admin alike
(`is_staff`), and staff can read membership / guardian rows, but only a coach may approve someone
as an assistant or coach. The signed-in path keeps the join rate limit; the signed-out preview has
no user to key it on, so the 30^8 code space is the protection there, as it already was for typed
codes.

### D50. Schedule rows say how soon; addresses, directions and one calendar file

Every upcoming row gets a timing badge from a pure helper (`timingLabel`): Today, Tomorrow, This
week (2–6 days away), otherwise Upcoming; practices keep their Practice label and get the same
badge, cancelled ones only say Cancelled. The date-and-time line is bold and full-contrast, the
place and note stay muted. Games and practices gain an optional street `address` (≤ 200 chars)
next to the location name; the scheduling sheets and detail pages suggest the team's earlier
location/address pairs (`team_places`) and fill the address in when a known location is picked.
Directions is a Google Maps link (`https://www.google.com/maps/dir/?api=1&destination=…`) with
the address when there is one, otherwise the location name: a button-sized row on the detail pages
and a small arrow at the right of each schedule row (a sibling of the row link, since links cannot
nest). "Add all to calendar" builds one .ics with every upcoming non-cancelled game and practice.
Times are converted from the team's `timezone` setting (Settings → Team setup, default
America/Chicago, validated against `Intl.supportedValuesOf`) to UTC stamps, which every calendar
app reads without a VTIMEZONE block; all-day events stay dates. Delivery: desktop and Android
download the file; on iOS (Safari and the installed home-screen app) the `download` attribute is
ignored for blobs, so the page navigates to the blob URL, which opens Safari's calendar preview with
"Add All". That path could not be exercised on a real iPhone from this environment and is the one
thing in this round to try by hand.

### D51. Position key and "3 of 4" totals on the rotation grid

Parents did not know what LFB or RCM meant. `src/sports/positions.ts` holds a full name for every
code the formation generators produce (a test walks every sport × size × goalkeeper setting and
fails on a nameless code); a generated fallback code such as DEF7 takes the role's label. The
rotation grid shows a **Position key** under the players listing only the codes used anywhere in
the current plan, in field order, each once, with its group colour; staff also see
"dot = picked by Auto-fill" there. A chip is a button for everyone now: staff get the position
picker, parents get a toast with the full name (the chip's accessible label carries it too). The
totals column has a header named by the sport's period (Qtrs, Halves, Inn) and each total reads
"3 of 4" rather than a bare number, with the same colour thresholds as before.

### D52. Player details and contacts are private to the player's own people

Two new tables, `player_details` (birthdate, shirt size as an enum from youth XS to adult XL)
and `player_contacts` (name, relationship, email, phone, optional link to an app account), each
with a single RLS policy for every operation: `can_see_player_private(player)`, true for staff of
the player's team (coach, assistant, admin through `is_staff`) and for an approved guardian of
that player. A pending guardian, another parent on the same team and a non-member all read zero
rows and cannot insert, which pgTAP 10 checks row by row. The player page shows a Details section
to exactly those people, editable by both staff and the child's own guardians (a parent keeps their
own child's size and contacts current; the coach can fix anything). Contacts are plain rows rather
than links to accounts because most emergency contacts are not app users; "This is me" sets the
optional `user_id` when they are.

### D53. Parents land on their child's tab

A parent's first tab is their child's first name ("My players" with a segmented switcher when they
have more than one; "Home" until a link is approved) at `/home`, and "/" sends parents there and
staff to the field. The page is the parent's whole evening in one scroll: the next game or practice
with a live countdown (ticks every 30 s), place, Directions and Add to calendar; the child's
position per period from the current plan with the full position name under each chip (or that the
coach has not set a lineup / has not placed them yet); the four season tiles; the skills bests with
sparklines (`SkillsBests`, now shared with the player page); and the Details section from D52,
editable. Coaches never see this tab. Five tabs is the limit at phone width, so when a parent's
sport has a Lineup tab (baseball) it is folded into the Field tab as a "Diamond | Batting order"
segment for parents only; `tabsFor()` in the tab layout is where that rule lives and is unit tested.

### D54. A parent's own child: gold star, first in every list, no auto-fill dot

The white outline around a parent's child on the field was easy to miss on a bright pitch and
looked like a selection state. The jersey now carries a small gold star badge at the shoulder and
the name is printed in gold (`.shirt.highlight`, no outline), which reads at a glance in both
field views and in print. The same child leads every list a parent sees: rotation and roster
already did this, the stats table and the skills table now do too, through one helper
(`pinFirst`) that keeps the normal order for the rest. The Auto-fill dot is a coaching note
("I did not pick this by hand"), so it is only drawn for staff, on jerseys and on rotation chips
alike, and the Position key explains it to them; parents never see it.

## 2026-11-10 — Parent-feedback round 2

### D55. Read-only detail rows wrap instead of overlapping; layout checked in Playwright

On the parent's game page the "When" value ran under its label at 375px: the value span had no
shrink rules, so a long "Sat, Nov 14, 2026 · 9:30 AM · Riverside… · Home" string overflowed the
flex row. `.row .val` now shrinks, right-aligns and wraps, and read-only rows carry a `detail`
variant that lets a long value drop under its label. "When" shows only the date and time, since
Where, Address and Home / away have rows of their own. The regression check is a Playwright test in
the coach/parent flows that opens the parent's game page at 375px, asserts every detail row's
label and value boxes are side by side or stacked (never overlapping), asserts no horizontal
scroll, and attaches a full-page screenshot to the report. A pixel-snapshot comparison was
considered and rejected: baselines differ between Windows (where they would be generated) and the
Linux CI runners, so the geometric assertions are the stable form of the same check.

### D56. "Parents can see stats for": own children by default, enforced in the database

`teams.parent_stats` ('own' | 'team', default own) is a staff setting on the Settings page. With
own, a parent sees individual stats only for their linked children: the stats table returns just
those rows, and in the goal log, at-bats and anything built from the log, other children's scorer
and assist ids are withheld so the row reads "Goal · Q2". Team totals, results and the score are
untouched; positions, rotation and playing time are unchanged; skills stay own-child only whatever
the setting. The rule is server-side: the select policies on `score_events` and
`plate_appearances` now admit staff and 'team' parents only, and everyone reads the log through
definer functions (`game_events`, `game_plate_appearances`, `game_scores_for`,
`player_season_stats`) that apply `can_see_player_stats(player)` and flag withheld rows with
`hidden`, so the UI can say "Goal" rather than "Unknown scorer". Because parents on an own team
can no longer receive realtime rows from the log, a trigger touches the game row on every log
change and the existing `games` subscription keeps their live score fresh. pgTAP 11 covers a
parent under both settings, the coach, and a non-member.

### D57. The roster is the team directory; contacts are shared by choice

Team → Roster is one clean list for everyone: number, name and the parents' first names the
viewer may see; tapping opens the player's contact card. Staff management (numbers, names, remove,
add) sits behind an **Edit roster** button, and the game-day out switch lives on Rotation only. The
contact card merges what were the Guardians and Contacts sections into one **Parents** list
(`player_people`): contact rows plus guardian accounts without one, "In app" for linked accounts,
"Pending link" for staff, with Call, Text, Email and Add to contacts (a vCard 3.0) under each person
and **Add all to contacts** on the roster for every contact the viewer may read. Season tiles left
the card (they live on the parent home tab and the Stats tab); details and skills stay for staff
and the child's own parents. Sharing is per contact: `share_with_team` (default on) lets any active
member read name, relationship, phone and email; off keeps it to staff and that child's guardians.
Birthdate and shirt size never widen. Phone numbers are normalised on save (E.164, +1 assumed for
ten digits) and formatted for display. The invite asks for an optional mobile number; on approval
it becomes a contact on each linked child, so the directory fills itself. Staff get a **Team sheet**
(`/team/sheet`, `team_sheet()`): every child with birthdate, shirt size and parents, Copy (text) and
CSV. A player page goes back to where it was opened from (roster, stats, skills, home) through
router state rather than always to Team. vCards and .ics files share the same iOS delivery path
(navigate to the blob); it still needs a check on a real iPhone. pgTAP 12 covers shared vs private
contacts for another parent, a guardian's edits, staff and the pending-link rule; nothing in the
repo uses real names or numbers.

### D58. A team board, text only, seen when the app is opened

The board is two tables and three functions rather than a chat service: `board_posts` (text up to
2000 characters, a staff-only announcement flag) and `board_comments` (one level, up to 1000),
with `board_feed` supplying author names (profiles are private), `board_unread` driving the dot
on the header icon from a per-user `board_reads` stamp, and `board_mark_read` set whenever the
board is open and new activity arrives. Realtime on both tables refreshes the feed and the dot.
Access is the team's: active members read, post and comment; pending members and non-members get
nothing; authors edit and delete their own, coach, assistant and admin delete anything, and only
staff can mark or unmark an announcement (a trigger, so the UI cannot be bypassed). An
announcement pins to the top of the board and shows as a banner on the Schedule page and the
parent home tab, dismissed per post per device. Links in text become tappable; there are no
images. When staff cancel or restore a practice, or change a game's date, time or place, an
action sheet offers "Post this to the board" with the message pre-filled as an announcement.
There are no push notifications in this round, which docs/LAUNCH.md says plainly: the board is
only seen when someone opens the app. pgTAP 13 covers posting, the announcement rule, editing and
deleting by author, staff and admin, the pending member, and the unread flag.

## 2026-11-11 — Bug-fix and skills-entry round

### D59. Per-player caches are keyed by the ids, never by how many there are

A parent opening one child after another, or a coach recording for one player and opening the
next, saw the first player's skill results on the second player's page (and "1 results" with
nothing listed). The database was fine: a result's `player_id` always comes from the page's route
and the insert policy admits only staff of that player's team, and an integrity query (results
whose player and test are on different teams) returns nothing. The cause was in the client:
`useSkillResults(teamId, playerIds)` keyed its TanStack Query cache by `playerIds.length`, so
every single-player page shared the entry `['team', t, 'skill-results', 1]`, and the optimistic
add pushed new rows into every results cache. The key now carries the sorted ids, the optimistic
update only touches caches that cover the row's player, and the same mistake in the team-contacts
query is fixed; an audit found no other per-player query keyed by a count. A hook test reproduces
the bug against the old key (it fails there) and guards the fix. "1 results" reads "1 result".

### D60. Two player pages: the contact card and the skills page

One page tried to be both and parents got lost in it. `/players/:id` is the contact card
(jersey, name, Parents, birthdate and shirt size), opened from Team → Roster; `/players/:id/skills`
is the skills page (jersey, name, skills bests, Record a result for staff), opened from Stats →
Skills, the stats table, the parent home tab's "Full skills history" link and a test's own page.
The parent home tab keeps its own layout and links to both.

### D61. Back goes to the opener

Every link into a player page passes router state saying where it came from. The page's back
control then goes _back in history_ (`navigate(-1)`) instead of pushing a fixed route, so the
opener returns exactly as it was: the Stats → Skills table keeps its segment and scroll position
(React Router's ScrollRestoration restores on a history pop), the Roster is the Roster, the home
tab the home tab. With no in-app history (a deep link, a reload) the control is a plain link to the
sensible fallback: Team for the card, Stats for the skills page, the skills page for a test page.
Playwright covers each entry point.

### D62. Recording skills: a session, a tapped cell, and "Save and add another"

Coaches record a test for the whole team at once: **Record results** on Stats → Skills opens one
sheet with the test and date on top and every active player below, each with the inputs the
metric needs (count, seconds with decimals, distance, made-of-attempted with attempts, right and
left rows for two-sided tests), numeric keyboards, and Enter / Next jumping to the following
player; blank rows are skipped and one Save writes them all. Staff can also tap any cell in the
table to add a result for that player and test, or edit the latest one. The single-player sheet
always lists every shown test, preselecting rather than locking the one it was opened for, and
"Save and add another" saves, stays on the player and moves to the next test with a running count.
The table and the player pages refresh through the existing optimistic update and invalidation.

### D63. Layout fixes: open jerseys, the sitting-out strip, the status bar, plurals

An open jersey printed "Select" over its position code; it now shows the code alone, larger, with
a small "+" badge, and keeps the breathing glow. The "Sitting out" strip under each period wraps
its names and the sticky Auto-fill / Clear / Print bar gets a margin so the last strip scrolls
clear of it. A fixed strip the height of the top safe-area inset sits behind the phone's status
bar on every tab page, so scrolled content no longer shows through it on the installed app.
"2 halfs" is gone: `periodPlural()` gives quarters / halves / innings wherever a period noun is
pluralised. The parent game page "When" fix from D55 is confirmed in the deployed bundle. The
Playwright flows check all three at 375px: the Field empty state (code inside the shirt, no
"Select", strip above the bar), a scrolled player page (the strip exists, is fixed at the top and
layered above content), and the parent game detail rows (D55).

## 2026-11-12 — Clock-based playing time

### D64. The rotation total is just the number

"3 of 4" never fit the bubble on a phone. The bubble shows "3"; the column header (Qtrs / Halves
/ Inn, D51) and the accessible label still say what it is out of.

### D65. "Track playing time by": periods or the clock, with its own period count

`teams.time_mode` ('periods', the default and the existing behaviour, or 'clock') is a staff
setting in Team setup. Clock mode keeps its own `clock_periods` (default two halves) and an
optional `period_minutes`; the period-mode `periods_count` is never touched, so switching back and
forth never resizes a team's plan. A trigger refuses a change of mode or clock period count while
a game is live (the period length may still change; it only drives "time remaining").
`team_period_count(team)` gives the count for the current mode. Teams in period mode take exactly
the code paths they did before: the Field, Team and Stats pages branch on the mode at the top and
the period components are untouched (the Playwright flows prove the four quarter cards and the
sitting-out strip come back after a round trip through clock mode).

### D66. The clock is three columns and a server timestamp, never a counter

A live game carries `clock_period`, `clock_seconds` (banked while paused) and
`clock_running_since` (null when paused), plus the final `clock_period_lengths` of the periods
ended so far. Elapsed time is `clock_seconds + (now() − clock_running_since)`, computed from
timestamps on every device and on every tick, so a locked phone, a closed app or a second staff
phone joining all read the same number. The device's clock skew is measured from `server_time()`
and from every clock read (`game_clock()` returns `server_now`), and all displays use the corrected
time. `clock_start` / `clock_pause` / `clock_end_period` are atomic, staff-only, refuse period-mode
teams, and the games-row realtime that already existed keeps parents in step. With a period
length set the header shows time remaining, turns red at zero, buzzes and toasts "Time", and does
nothing else: the half ends only when staff end it. A screen wake lock is requested while a live
clock game is on the Field (where the browser allows it; iOS needs the installed app).

### D67. Stints are the ledger; minutes are derived; every change is one undoable op

Who is on the field is `stints` (game, player, period, spot, role, code, clock start, clock end).
An open stint is a player on the field now; one open stint per player per game and per spot per
period (partial unique indexes). `clock_sub`, `clock_swap`, `clock_empty`, `clock_fill` and
`clock_set_lineup` close and open stints at the current clock second inside one transaction,
mirror the open stints into the game's lineup row for that period (so parents' existing views and
the game page keep working), and write a `clock_ops` row. A stint that would be zero seconds long
is deleted rather than closed and remembered on the op, so pre-kickoff changes leave no debris.
`clock_undo` reverses the latest op of the current period (delete what it opened, reopen what it
closed, re-insert what it deleted); ending a period is never undone. `clock_end_period` closes
everyone at the final second, records the period's length and carries the same players into the
next period as its starters at 0:00 (or stops at full time on the last period). Minutes played
are summed from stints wherever they are shown: `player_season_stats.seconds_played` (an open
stint counts up to the game's current clock), `season_minutes()` per player and position group for
Auto-fill, and `playerTimes()` on the client for the live views. After a game staff correct a
player's stints with `stint_update`, `stint_add` and `stint_delete`: a stint must end after it
starts, stay inside its period's recorded length and never overlap the same player's other
stints; `updated_by` records who edited. Parents read stints (playing time is team-visible, like
positions) and can call nothing. pgTAP 15 walks a whole game: pause and resume maths, every
substitution kind and its undo, the half-time carry-over, minutes during and after the game, the
score stamp, the starters-as-template rule, corrections and the period-mode control team.

### D68. Starting and finishing a clock game

`start_game` on a clock team copies the template's first period into every clock period of the
game, resets the clock and opens a stint at zero for each starter. `finish_game` stops the clock,
records the last period's length, closes open stints, sets `done`, and writes the **starting**
lineup (first-period stints that begin at zero) into every template period, not the last players
on the field. Period-mode teams take the old paths unchanged.

### D69. Scores carry the clock

`score_events.clock_seconds`: during a live clock game an inserted score is stamped with the
current period and clock second by a trigger, whatever period the client sent; an edit keeps what
it is given. The log shows "H2 23'" (the running minute of the period, football style) and the
edit sheet in clock mode has a Minute field: leaving the minute as it was keeps the exact second,
a new minute starts at :00, clearing it drops the stamp. `game_events()` returns the second.

### D70. The clock-mode Field: one field, a bench row, select-then-target

The period cards are replaced by one card for the whole game: the period and clock in the header
beside the score button, the field, and under it a bench row of the same jersey art at about
two-thirds size (a 44px tap target, wrapping) with name and number; players marked out are not on
the bench. Substitution is select-then-target with no sheet: the first tap selects a jersey
(outlined, `aria-pressed`, and a hint line "Tap a player to swap with Nolan"), the second completes
it: field then bench or bench then field swaps those two, two on-field jerseys swap positions, an
on-field jersey then an empty spot moves the player, tapping the selected jersey again cancels,
two bench jerseys does nothing. An empty spot with nothing selected still opens the picker sheet.
`resolveTap()` is a pure function with its own tests. Before a game the same field edits the
template's starters (saved into every template period so `start_game` and a switch back to period
mode both find a complete plan); during a game each outcome is one server call on the running
clock; on-field jerseys show the current shift and bench jerseys minutes played and time resting,
fewest minutes then longest rest first (`benchOrder()`). The formation can change while the clock
stands at zero (`clock_set_lineup`); since D108 a soccer team may also change it mid-game while the
clock is paused (`clock_change_formation`, the same players kept). Staff get Start / Pause / Resume, End H1,
Undo and, at zero, Auto-fill or Suggest starters; parents see the clock and the bench read-only
with their child starred. The bench row and small jerseys exist in clock mode only: period mode
keeps its "Sitting out" strip exactly as before (asked for explicitly).

### D71. Auto-fill in clock mode ranks by seconds

Before a game, Auto-fill fills the open starter spots with the players who have the fewest
seconds this season, then the fewest seconds in that spot's position group (`season_minutes()`),
then at random; goalie first; hand-picked spots are never moved. At a break (the clock at zero of a
later period) "Suggest starters" re-picks every spot by minutes this game, from the stints.
`fillByTime()` mirrors the period engine's rules and has the same kind of tests.

### D72. Rotation in clock mode: minutes bars

Team → Rotation for a clock team is one row per player: minutes this game as a bar against the
most-used player, the number of shifts, "on at LW" with the on-field dot, the out switch for
staff, and a Balance summary in minutes (range and average; more than five minutes between the
most- and least-used player turns the meter orange; informational only). It follows the live game,
else the most recent completed one, updating live through the stints realtime. Parents see it
read-only with their own child first.

### D73. Minutes replace periods in the stats

`statColumns()` and `profileTiles()` swap the periods-played column and tile for MIN / Minutes
when the team is in clock mode (whole minutes, rounded down, from `seconds_played`). The existing
"parents can see stats for" rule applies unchanged because the minutes come from the same
`player_season_stats` row. The parent home tab's "in this game" block becomes one row: on the
field at a position with the current shift, or on the bench with minutes played and rest; before a
game, the starting position or "not in the starting lineup yet".

### D74. Where the minute shows

The game page log tag, the undo and toast descriptions and the edit sheet all use `eventTag()`,
which appends the minute only when the event has one, so period-mode games read exactly as
before.

### D75. Corrections are made on the game page, after the game

A clock game's page replaces the per-period lineup lists with Playing time: the starters, then
minutes and shifts per player, live while the game is on. After the game staff tap a player to
open their stints: edit the start and end of each (m:ss), delete one, or add one for a period,
position and range; the sheet applies the same checks as the server before calling.

### D76. Offline, noted

The clock functions are plain RPCs under the same retry-on-reconnect hooks as everything else
(D43), but a substitution is stamped with the clock second at the moment the server runs it, not
the moment it was tapped. At a venue with no signal a sub recorded late lands at a later minute.
This is a known gap: the venues have good signal, and the correction sheet (D75) fixes any stint
after the game. Queuing taps with their intended second is possible later by adding a `p_at`
argument to the functions.

### D77. Jersey-and-swap on every field; the second tap is confirmed too; no layout jump

Phone testing of the clock round changed three things. The bench row of small jerseys and the
select-then-target taps now live on the period cards as well (the user preferred them to the
picker list): each quarter card draws its sitting-out players as jerseys under the field, fewest
periods first with the count beneath, and the first tap selects while the second completes (field
and bench substitute, two field jerseys swap, an empty spot moves the selected player, the same
jersey again cancels, two bench jerseys does nothing). An open spot with nothing selected still
opens the picker sheet, and a selected on-field jersey offers **Open the spot** (period mode and
the clock template clear the spot; a live clock game takes the player off with nobody on, the
injury case). Auto-fill and Redo moved into that hint line. The jerseys sit above the hint text.
Both jerseys of a completed tap get the same gold outline for a moment (`.shirt.flash`), so a coach
does not have to look back to check which player they tapped. The "Saving…" pill in the subtitle
is gone from the clock page: it wrapped the line and shifted the whole field up and down on every
Start / Pause; a visually hidden live region says "Saving" instead, and the hint line has a fixed
height so a change of text never moves the field either. PeriodCard, ClockFieldPage and the
flows cover the new taps; the earlier "small jerseys only in clock mode" note is superseded.

### D78. Saving never moves the page

The sync banner at the top of every tab page said "Saving 1 unsaved change…" for the fraction of
a second each save was in flight, in the page flow, so every jersey tap, score and settings change
pushed the whole page down and back up (the "glitch" seen on the phone; D77 had only removed the
clock page's own pill). Online saving is now a floating pill fixed under the status bar that takes
no layout space, and it appears only once a save has run for 1.2 seconds, so a normal save shows
nothing at all. The offline strip is unchanged (it is persistent and worth the space). The
period-mode Field page's inline "Saving…" pill is gone the same way as the clock page's, replaced
by a visually hidden live region.

## 2026-11-12 — Bench queue and team duplication

### D79. The bench is a queue, not a sort

Sorting the bench by minutes or periods played kept rearranging the players under a coach's
thumb. The bench is now an explicit, persisted order on every lineup row (`lineups.bench_order`):
each period card in period mode, each clock period of a game, and the template. Left to right,
the leftmost is next in line. A player who comes off joins the right end; one who goes on leaves
the queue and the gap closes; a player marked out leaves it and joins the right end when marked
back in; the initial order is roster order of everyone not on the field. Staff may still pick any
bench player and any on-field player in either tap order, and tapping two bench jerseys swaps
their places (`clock_bench_swap` during a live clock game, a plan save otherwise). The database
owns the rule: `bench_normalize` keeps a row's queue honest (drops the on-field, archived and
marked-out, appends the missing in roster order), `bench_apply` removes and appends, and every
clock function calls them; `save_lineups` accepts a `bench_order` per period from the period-mode
Field and normalizes it; `copy_lineups`, `start_game` and the half-time carry-over copy it along;
`set_player_available` re-normalizes the template and any live game. Every `clock_ops` row
remembers `bench_before`, so Undo restores the order as well as the players, and Undo now steps
back through the period's changes that are still in effect rather than stopping at the first
undone one. On the client `benchQueue` / `benchAfterEdit` / `benchSwap` mirror the rule so the
row draws right before the server answers; minutes and rest (clock) or periods played (period
mode) stay under each bench jersey as information only. Realtime on `lineups` keeps the order the
same on every device. Auto-fill and Suggest starters keep their ranking logic. pgTAP 16 walks the
queue through a game; the Playwright flows check roster order, a bench swap that survives a
reload, independent queues per card and the right-end rule on the parent's phone.

### D80. Toasts sit above the sticky toolbar

A swap toast covered the Clear button. Toasts are now positioned above the action bar as well as
the tab bar, so they never sit on a control; a flow asserts the toast box ends above the bar.

### D81. duplicate_team: a platform-admin copy with new ids throughout

`duplicate_team(source, name, owner?)` builds a new team in one transaction: settings (sport,
sizes, periods, playing-time mode and clock settings, colours, timezone, stats visibility), the
current season, players with numbers, availability and the archived flag, player details, player
contacts with their sharing switches (account links dropped), skill tests and results, the
template lineups with their bench queues, practices, and the season's games with schedule fields,
status, snapshots, score events (scorer, assist, clock second), plate appearances, lineups and
stints, every id remapped through temp tables. It does not copy members (the caller becomes owner
and coach), guardian links, pending requests, board posts, coach notes, the op log or the join
code: the copy gets a fresh invite link, turned off. Only a platform admin may call it from the
app; from the SQL editor there is no JWT, so the owner is passed as the third argument. The admin
console has a copy button on every team row that asks for a name and opens the copy. pgTAP 17
compares a row-count signature across every copied table, proves no id is shared, that each
remapped reference lands in the copy, that the copy's stats match, and that renaming, deleting
and scoring in the copy leaves the source byte-for-byte the same.

## 2026-11-12 — Bench polish, defaults, performance, joining without approval, seasons

### D82. Bench captions use the real plural

The period-mode bench caption was built with a bare "s" and read "0 halfs" on a two-half team.
`PeriodCard` takes the period count and uses `periodPlural` ("0 halves", "1 half"); in clock mode
nothing is shown under a bench jersey before kickoff and minutes · rest during a game, as before.

### D83. The bench queue runs right to left

The next player in is the rightmost jersey of the top bench row; the line continues leftward along
that row, then right to left along the next, and rows are right-aligned. A player coming off joins
the end of the queue, the leftmost of the last row. The stored order (`lineups.bench_order`) and
the DOM order are still queue order, next in first, so nobody's place in line changed and no data
migration was needed; only the drawing changed (`.benchq` is a wrapping `row-reverse` flex box).
Everything else about the queue (D79) is unchanged.

### D84. "Up Next" over the next-in jersey

The bench header carries an "Up Next" label, right-aligned and exactly one jersey wide, so it sits
over the next-in jersey in both modes; that jersey also says "up next" in its accessible name.

### D85. Bigger bench jerseys: five to a row

Each bench slot is a fifth of the row (4 px gaps, 8 px side padding, capped at 76 px on wide
screens), so five fit at 375 px with name, number and caption legible.

### D86. No picker sheet on the Field

Players are assigned only by tapping jerseys, in both modes. An empty spot is selected like a
jersey (gold outline, "Tap a bench player for LS"); a bench tap fills it, an on-field tap moves that
player into it, another empty spot takes over the selection, the same spot again cancels; the
other order (bench first, then the spot) works as before. "Open the spot" stays for clearing a
selected on-field jersey. `PlayerPickerSheet` and its code are gone from the Field page; the
position picker on Team → Rotation is untouched.

### D87. Defaults for new teams

`create_team` sets playing time to the clock for every sport where it applies (every enabled sport
but baseball); the column default stays `periods`, so existing teams are untouched. Every jersey
colour group of a new team, goalkeeper included, starts as `#E22400` (`DEFAULT_JERSEY`).

### D88. Team setup responds at once; rapid taps save once

The page's team comes from the memberships list (RequireTeam), not from the team's own query, so
the old optimistic update never reached the controls and every stepper tap waited a second or two
for the server. `patchTeamCaches` now updates every cached copy (the team query and every
memberships list) and hands back a restore; `useCoalescedSetup` applies it the moment a control is
tapped, merges taps within 400 ms into one save (a stepper tapped three times saves once, a mode
switch and a tap in one burst save as one request), sends what is still queued when the page is
left or hidden, and on a failed save puts every copy back and shows one plain sentence. The
parent-stats switch, renaming, the invite on/off switch and the approval switch go through the
same path. No other settings control waits on the server: theme and field view are local.

### D89. Cold start: the frame first, the last screen from cache, fewer round trips

Measured with `npm run perf:coldstart` (a production build against the local Supabase, Playwright
on a phone viewport, 4x CPU throttle, slow 4G; `CPU=1` for an unthrottled CPU), signed in as the
seeded coach and parent, a FIRST launch (fresh profile with the session only) and a REPEAT launch
(service worker and caches warm, persisted query cache present). Where the time went before: the
app JS (one 230 kB gzipped bundle, about 1.4 s to arrive on slow 4G and 0.6 s to parse at 4x),
then a waterfall — memberships in two requests (team_members, then teams), a render, the team's
queries (players, links, board), the live-game check, then the template lineups, then their slots,
then the lazily loaded field image, then the field render. Changes:

- the query cache is persisted to localStorage (`PersistQueryClientProvider`, 24 h, build-keyed,
  successful queries only, never one-off lookups, the clock or data that would not survive JSON
  such as a Map); restored data is marked stale on arrival so the last-known screen paints at once
  and every mounted query refetches in the background; sign-out drops it;
- memberships are one request (team_members with the team embedded); lineups come with their
  slots embedded; the template is fetched alongside the live-game check instead of after it;
- the sport's field image is preloaded as soon as the team is known and the first field on the page
  loads it eagerly with high priority; the service worker keeps it in its runtime cache;
- the frame (status strip, top bar, tab bar, page skeleton) renders before the memberships arrive;
- every page a launch does not need is a lazy chunk (the other tabs, settings, the admin console,
  the board, one-off screens): initial JS 233.7 → 200.5 kB gzipped, 40 chunks on demand.

Medians of three launches, time to useful content (coach: the first field jersey; parent: the
child's tab), in milliseconds:

| launch                           | before | after |
| -------------------------------- | ------ | ----- |
| coach, first (4x CPU)            | 4088   | 3601  |
| coach, repeat (4x CPU)           | 2817   | 1838  |
| parent, first (4x CPU)           | 3309   | 3088  |
| parent, repeat (4x CPU)          | 1928   | 1618  |
| coach, repeat (CPU unthrottled)  | —      | 274   |
| parent, repeat (CPU unthrottled) | —      | 261   |

The shell (tab bar) shows at about 1.0 s on a repeat launch at 4x (was 1.5 s). The remaining
repeat-launch time at 4x is JS parse and the field render; the first launch is bound by the JS
download on slow 4G plus one round trip per query level. A session whose access token has expired
(the app opened after an hour away) adds one token refresh before any query; that is not
measured here and cannot be avoided.

### D90. Load example team works through the API; no raw database text on screen

The hosted API role (`authenticator`) preloads pg-safeupdate, which refuses any DELETE without a
WHERE clause; `import_legacy_backup` emptied its temp map with one, so "Load example team" failed
with "DELETE requires a WHERE clause" (pgTAP runs as postgres and never saw it). The map is
truncated now. A payload flagged `example` is accepted only from a platform admin onto a team with
no players, and the row is shown only then. Every query wrapper throws a `DbError` that keeps the
SQLSTATE, and `errorMessage` maps engine text (constraints, policies, PostgREST codes, dropped
connections, JS TypeErrors) to one plain sentence by code or by wording while our own
raise-exception text passes through; the stats page, the route and tab error screens and the app
crash screen use it. Checked end to end against local PostgREST: first load 200, a second replace
200, a third onto a team with players refused with P0008.

### D91. Joining without approval; unconfirmed child links

`teams.require_approval`, staff-editable in Members, is off for every team, existing ones included.
When off, submitting the invite link makes the parent an active member at once (no pending
screen) and links the children they picked as unconfirmed. An unconfirmed link gives everything
any team parent sees plus the child starred, pinned first and on the home tab (next event,
positions), and the child's individual stats under "own child only" (`is_linked_to`). It withholds
the child's birthdate and shirt size, contacts not shared with the team, skill results, and editing
of the child's details or other people's contacts: those stay on `is_guardian_of`, a staff-confirmed
link. A parent may add and edit one contact entry for themselves on a linked child
(`can_write_contact`). A parent cannot add, change or remove their own child links after joining:
`request_guardian_link` refuses, RLS refuses, and opening the invite again as a member changes
nothing; staff do it from Members. When the setting is on, the approval flow (pending →
`approve_member`) and its tests are unchanged; parents approved before stay confirmed; the link
only ever grants the parent role; the join rate limit and the Turn off / Replace controls stay;
there is no coach invite link. Realtime on the user's own links and membership keeps the home tab
honest. pgTAP 18 covers each withheld item.

### D92. New this week; one-tap link actions; the count badge

Members starts with "New this week": everyone who joined in the last seven days (`joined_at`),
their children and whether each link is confirmed, with one-tap Confirm and Remove per link, a
picker to change the set of children (`set_member_children`, every link confirmed), Change role and
Remove member. Confirming a link makes the parent a contact on the child (D57), as approval did. A
parent with an unconfirmed link reads "Your coach will confirm your link to <child> to show their
details." on their tab, and the Members row in Settings carries the number of links to confirm.

### D93. Removing a player removes their parents

`archive_player_core` archives the player, clears them from plans and bench queues and, in the
same transaction, sets to removed every active parent membership whose only linked child on the
team was that player; a parent with another child stays, coaches and assistants keep their role.
The player's games and stats are kept as before. `parents_losing_access()` previews who that would
be, and the roster's Remove sheet names them. `start_season` uses the same core.

### D94. Seasons on the same team

Settings → Start new season (coach or platform admin; not while a game is live): name and dates,
then a roster review with a Returning switch per player, default on; the confirmation names the
players not returning and the parents who lose access. `start_season` does it in one transaction:
the new season becomes current, non-returners are archived with D93, the template lineup and its
bench order are cleared; returning players with numbers, details and contacts, parents, team
settings, skill tests and every result, the board and the invite link carry over; the schedule and
stats start empty. Stats → Season gets a season picker (results and the player table follow it);
a game of a past season opens read-only. The admin console lists seasons and can make an earlier
one current again (`set_current_season`) for a season started by mistake. pgTAP 19 proves each
rule and that past-season games and stats are byte-for-byte unchanged.

## 2026-11-12 — Live-game goal sheet and single periods

### D95. The ticking clock never touches an open sheet

Opening the Scorer or Assist select during a live clock game showed the native menu, which closed
a second later with focus back on Scorer. Cause, confirmed by a failing test: the clock page
re-rendered every second and handed the goal sheet a new `onClose` closure; `useFocusTrap` had
that handler in its effect dependencies, so every tick re-ran the trap, restored focus to the
previously focused element and set initial focus again on the first control. The trap now reads
its escape handler through a ref and sets initial focus once per open. The page itself no longer
ticks: the clock display, the per-shift and bench times (computed inside `ClockCard`), the stamp in
the goal sheet (`ClockStamp`) and the period-over alert (`PeriodOverAlert`) each tick on their own,
so an open sheet's subtree is never re-rendered or remounted by the clock and its controls keep
their identity and values. Audit of everything that can be open during a live clock game: the
edit-goal sheet and the undo confirmation sit on pages that do not tick (the game page does not
poll the clock); the stint-corrections sheet opens only on finished games; the skill-result and
board sheets live on pages without a clock; all of them go through the same trap. Tests: a trap
re-render keeps focus; the clock page ticks three times with an Assist control focused and the
sheet node, the control node and the focus are unchanged; a Playwright flow at 375px keeps the
sheet open for three seconds with a scorer focused.

### D96. Player buttons instead of selects in the goal sheet

Scorer and Assist are rows of tappable buttons, number and first name on each: the players on the
field right now first (field order), the bench behind "Show bench players" for the rare goal
credited to someone who just came off, then Unknown / No assist. The selected button turns green,
the scorer is greyed out in the assist row (a kid cannot assist their own goal), picking a player
as scorer clears them as assist, and the last scorer is preselected as before. In clock mode the
sheet shows the period and clock time the goal is stamped with. The edit-goal sheet uses the same
buttons (everyone in one group, removed players kept selectable). A goal with an assist is three
taps one-handed at 375px and nothing opens that the clock could close.

### D97. A single period

Team setup allows one period in both modes for every sport where it makes sense (soccer,
basketball, lacrosse and football; baseball keeps its innings). `periodName(1)` is "Game": the
Field shows a single card called Game (its title is for screen readers only since D108, so the chips
in the bar never overlap it), the Rotation column is headed Game, and no copy says
"1 half" or "1 quarter" (`periodCountText` says "one period", `periodsNoun` "period", the totals
column is "Played"). In clock mode with one period: one continuous clock with Start and Pause, no
End control, a Finish game button that goes to the game page, the optional period length is the
whole game, score events show the minute only with no period label, and Suggest starters is not
offered. Existing teams keep their count. pgTAP 20 plays a full one-period clock game with a
pause, a goal and a sub, and a one-period game in period mode; a flow switches a team to one
period and back.

## 2026-11-12 — Field polish, the action bar, the Schedule button and a clock safety stop

### D98. Basketball name pill

On basketball jerseys only, the name sits in a white pill with dark text across the chest, the
number below it and the position small at the hem; bench jerseys get the pill and number with no
position. The pill hugs the text, never wraps and never outgrows the shirt: `Jersey` sets `--n`
(the name length) and the pill's font size is `80cqw / --n`, clamped, so HAYDEN and PRESLEY shrink
to fit. A parent's own child keeps the gold mark as a gold pill. Open spots keep the plain look;
every other sport's jersey is untouched.

### D99. Nothing under a bench jersey

The minutes · rest caption (clock mode) and the periods-played caption (period mode) under bench
jerseys are gone, in both modes; the shift time under an on-field jersey stays. The bench is the
queue and nothing more; minutes per player live on the Rotation view. `BenchEntry` is just the
player, `periodsPlayed` and its caption helper are deleted, the footer copy no longer promises
minutes under the bench.

### D100. No Print button on the Field

The Print button is gone from the Field in both modes and for both roles; Auto-fill and Clear keep
their place and behaviour. The team sheet (`/team/sheet`) keeps its Print button, since printing
is that page's purpose. `print.css` stays for it.

### D101. The action bar is a fixed overlay with matching page padding

The Field's action bar was `position: sticky` inside the page; on a phone it could sit over the
bench and the help text at the end of the scroll. It is now a fixed strip just above the tab bar
(same offset, safe area included, centred to the page width) and the page that carries it gets
`padding-bottom: var(--act-h) + 8px`, so the bench, the hint line and the footer always scroll
clear of the bar, the tab bar and the safe area, in every state (setting starters, a live period
game, a live clock game), both views, every sport. Toasts still measure the bar and sit above it
(D80). Measured at 375×812 in Chromium: zero pixels of the last bench row, the hint or the footer
under the bar at the end of the scroll in every state.

### D102. One on-field jersey size

On-field jerseys had the 3D width (a percent of the stage) in the 3D view and the formation width
times the field fraction (about 6% less) in the flat view. `FieldStage` now uses the 3D width in
both views; the bench size is unchanged. The dev tuner's width applies the same way.

### D103. Rows spread so jerseys clear each other and their shift times

With one size in both views, the generated formations were re-spaced instead of shrinking jerseys:

- Soccer rows sit at field depths chosen per row count (`SOCCER_ROWS`): the far row starts where a
  shirt just fits inside the stage (y 18), the rows between are even in screen pixels of the 3D
  view, the deepest outfield row is at y 75 (88 open-goal shapes) and the keeper stands on the
  goal line (y 98). Across a row, `rowX` spreads neighbours up to 29% apart (never past the
  touchlines), so 2-, 3- and 4-wide rows clear each other in both views.
- Basketball shapes are written in court coordinates: the front line at the far basket (y 20), the
  wings mid-court (y ~52) and the guards back (y 86); in a row neighbours are at least a jersey
  apart.
- Lacrosse rows: attack 22, midfield 44.5, defence 64, keeper 81 (in the crease in front of the
  goal at 85); the behind-the-goal attacker stays at 9.
- Goals and hoops draw behind every jersey (`z-index` 5 under the slots), so the keeper's position
  label and shift time are never behind the near net.

Measured at a 343px stage: the flat view is clear of every shirt-on-shirt and shirt-on-label
overlap for every soccer shape up to 9-a-side, every basketball and lacrosse shape, and 11-a-side
shapes with rows of four or fewer. What remains, by geometry rather than choice: in the 3D view the
far rows are compressed, so where columns line up the shift-time pill of a far-row jersey is still
partly behind the collar of the row in front (≈6 px of 16 for three-row soccer shapes, 13 px for
the one-column basketball stacks 1-1-1 and 1-3-1, 4 px for lacrosse); rows of five (3-5-2, 5-3-2)
touch at the sides in both views; and the four-row 11-a-side shapes (4-2-3-1, 4-1-4-1) overlap in
the 3D view because four rows plus the keeper do not fit the stage at this size. The 3-wide far
row in the 3D view overlaps by about 10 px at the sides, as it did before (the user tuned that width
by eye, D42).

### D104. "+ Add" on the Schedule

The round plus at the top right of the Schedule was invisible in dark mode. It is a small filled
capsule reading "+ Add" in the accent colour (the `btn sm` primary, readable in light and dark), in
the same spot, for coaches and assistants only. On the All tab it asks New game / New practice as
before; on the Games or Practices tab it opens that form straight away. The round `.hbtn` style is
gone with its only user.

### D105. Runaway clock safety stop

A test game left running kept adding minutes for over an hour and wrecked the playing-time
stats. A running period now pauses itself once it has run 30 minutes past the period length, or
at 90 minutes when the team sets no length; player time is credited only up to that cap. It is
decided from stored timestamps alone, so it holds when the app was closed the whole time and for
games already running away when the migration lands:

- `games.clock_limit` is the period second the running stretch pauses itself at, written by
  `clock_start` (`clock_limit_for`: the cap, or 30 minutes after a restart at or past the cap);
  `games.clock_auto_paused` marks the safety stop.
- `clock_settle(game)` turns a stretch at or past its limit into a pause at the limit. `clock_game`
  (every clock action), `game_clock` (every read, now volatile), `finish_game` and the score stamp
  settle first; `player_season_stats` and `season_minutes` use the three-argument
  `clock_elapsed(seconds, running_since, limit)` so the stats are right before anyone opens the
  game. The two-argument reading stays raw. The migration backfills `clock_limit` for live games
  running at that moment.
- `game_clock` returns `limit_seconds` and `auto_paused` (true only while paused at the limit by
  the stop; Resume, End and a new period clear it). The client's `elapsedAt` never passes the
  limit, `PeriodOverAlert` refetches the clock the second the limit is reached and toasts
  "Clock paused automatically at 40:00", and the Field and the game page show a short orange note
  with the cap and why ("it ran 30 minutes past the 10-minute period length"; "it ran 90 minutes")
  and that Resume runs it for up to another 30 minutes.
- The clock does not stop at the exact period length; that is a separate decision still open.

pgTAP 21 (32 assertions) plays it out: the limit on start, the read that settles the stop, stats at
the cap, Resume for another 30 minutes and a second stop, ending the period clearing the note, a
substitution and a goal during a runaway stamped at the cap, finishing during a runaway ending at
the cap, and a team without a period length stopping at 90:00.

### D106. Basketball is a half court

D103 spread the five across the full court — the point guard stood in the opponent's paint — which
is not what a basketball formation looks like. Basketball now draws only our attacking half: the
basket at the top, the half-court line (with the near half of the centre circle) at the bottom, in
both views and in every state. The 3D tilt is gentle (the far end is 75% of the near end, against
60% before) so the back row is not squeezed.

- The court is vector artwork, `public/fields/basketball-{flat,persp}.svg`, drawn by
  `scripts/gen-court.mjs` from the same homographies that place the jerseys (`FIELDS.basketball`:
  flat 1000×900, 3D 1200×1060), so lines and spots cannot drift apart; the two WebP full courts
  are gone. The script works in feet (a 50 ft wide, 47 ft deep half; 12×19 ft key, 19.75 ft arc)
  and prints the H to paste into `field.ts`. The flat view draws its own hoop; the 3D view keeps
  the standing `hoop-far` overlay, its stanchion just behind the baseline (`y −6`); there is no
  near hoop any more. `public/fields/` is now explicitly excluded from the precache
  (`globIgnores`), since the SVGs would otherwise have matched the `*.svg` pattern (D14).
- Field coordinates: y 0 is the baseline, 100 the half-court line; the key ends at y 40 and the
  arc bottoms out near y 53. Every formation was re-placed by hand for the half court: post players
  on the blocks (x 20–28 / 72–80, y 16–20), a lone centre at the free-throw line (under the basket
  the hoop overlay would be covered), wings out wide (x 10–14, y 44–69), the point guard at the top
  (y 92, with floor left under the jersey). At the fixed jersey size (D102) and a 343px stage, no
  jersey, shift-time pill or the hoop overlaps another in either view — checked in the DOM for all
  eleven formations in setup and in a live clock game. "1-4 high" cannot be literal at that size
  (four across need more than the court's width): its posts stand at the elbows and its wings low.
- The court is a third shorter than before (flat 309px against 401px at 375px wide; 3D 303px
  against 337px), which is what lets the bench and the help text sit above the bottom bars without
  scrolling on an iPhone-sized screen.

### D107. Parent RSVP for games and practices

Parents answer "Going" or "Can't make it" per player and per event; no reply is the default and
counts as available. The reply is its own record (`event_rsvps`, one row per player per game or
practice: status going | out | none, who set it — parent or coach — and when; last write wins). It
is deliberately not the coach's out switch: that switch (`players.is_available`) is team-wide and
clears the player from the plan at once, and a reply for a game three weeks out must do neither.

- **Writes go through `set_rsvp` only.** Staff may set any player's reply at any time. A parent may
  reply for a player linked to them — any link while the team does not require approval, an
  approved link once it does — and only while the game is upcoming (a practice: until its date and
  start time have passed in the team's timezone). After Start game a parent's buttons are disabled
  with a note; the coach changes replies from the attendance list. A coach setting "going" also
  lifts their own team-wide flag for that player. Rows are readable by every active member (the
  schedule marks and counts); nobody inserts or updates them directly.
- **Only "out" affects a lineup, and only that game's.** The Field, the clock Field and both
  rotation views plan for one game: the live game, else the first upcoming game dated today or
  later (an upcoming game dated before today was never started, and its replies must not stick to
  the plan). A player whose reply for that game says out is treated as out there: off the bench,
  never picked by Auto-fill or Suggest, listed under "Out this game" with "Parent: can't make it"
  (or "Out for this game" when a coach set it). A player already placed is **not removed**: the
  jersey keeps its spot with a red OUT tag and the page shows a note naming them; the coach taps
  the jersey, then a bench player. The engine got a `held` flag for this (`EnginePlayer.held`):
  not a candidate, but `fixPeriods` leaves them in their slot. Start game opens that spot exactly
  as it does for the coach's flag, and the `game_players` snapshot records them unavailable;
  copying the final lineup back to the template at the finish ignores replies, so one never
  follows a player past its game. Practices store the reply and show counts, nothing more.
- **Coach override from the rotation switch:** turning the switch on for a player whose reply says
  out records "going" by coach for that game (which also lifts the coach flag if it was off);
  turning an available player off is the team-wide switch as before. "Everyone's back" leaves
  replies alone.
- **Screens.** Parent: Home "Next up" card gets its own reply block between the event row and the
  Directions bar. Unanswered: "Is Nolan going?" with an amber "Reply needed" tag and the Going /
  Can't make it buttons; answered: one status line ("✓ Nolan is going" / "✗ Nolan can't make it")
  with a Change link that brings the buttons back (the filled button then clears on a second
  tap); locked: the status line alone. One block per selected child; the event pages use the same
  control, one row per linked child. Schedule rows show a small check or cross next to the date per
  linked child who replied (named when there is more than one child), an amber dot for a child
  with no reply when the event is within the next seven days, nothing otherwise. Both
  event pages carry the full control, one row per linked child. Coach: schedule rows show
  "9 in · 2 out", where "in" is every roster player effectively available for that event (not out
  by reply, not flagged out by the coach) — so no reply counts as in — and "out" is everyone
  else; the Going / No reply split appears only in the event page's Attendance section, which
  lists In, Out and No reply with "by parent" / "by coach" and a three-way control per row. A
  coach-flagged player with no reply is listed under Out with "marked out on the Team tab".
- **Verified** with pgTAP (`22_rsvp.test.sql`: permissions, the approval rule, the parent lock,
  last write wins, the override, the start-of-game copy and the snapshot), unit tests for the pure
  rules (`src/rsvp/rsvp.ts`), a Playwright flow (parent replies from Home, the coach sees the
  count, the tagged jersey and the attendance list, overrides it) and 375px checks in light and
  dark. Replies are realtime like everything else on the team channel.

### D108. The live game: quick scoring, the clock nudge, the start sheet, a formation change, the bar

Five changes to the clock-mode Field during a game, after the first games with real coaches.

- **Basketball quick scoring.** During a live basketball game a row sits between the bench and the
  action bar: Us +1 +2 +3 on the left, Them +1 +2 +3 on the right. A Them tap records the points
  at once. An Us tap arms scoring mode: the on-court jerseys get an amber ring, the hint line reads
  "Who scored the +2?" with Team (no scorer) and Cancel, and the next jersey tap records the
  scorer — nothing else happens on that tap. Outside scoring mode jersey taps are exactly the swap
  and substitution taps of D70. A fixed-height line under the row confirms "Nolan +2" with Undo,
  which deletes that event once the insert has settled (the bar's Undo stays the clock-op undo).
  No assists for basketball; entries are edited on the game page as before. To fit at 375 × 812
  without scrolling the court is drawn at 84% width and the long help paragraph is not shown
  during a live basketball game. Soccer and the other sports keep the score sheet.
- **The clock never starts on its own** (superseded the same day by D109, where Start game is the
  kickoff: the amber chip and the "Start the clock?" prompt described here were built and then
  removed).
- **The score tap with no live game** opens a sheet: "Start vs Lions · Fri, Nov 20 · 10:00 AM"
  for the next scheduled game (the same `plannedGame()` rule as D107: first upcoming dated today
  or later), then "New game", which opens the existing start form. A game not dated today asks
  "This game is scheduled for …. Start it now?" first. Starting the scheduled game applies its
  RSVPs. With nothing scheduled the sheet offers only "New game". Same on the period-mode Field.
- **A soccer formation change mid-game**, only while the clock is paused and has run in this
  period (at 0:00 the lineup rewrite of D70 still applies). `clock_change_formation` keeps the same
  players: the keeper stays in a keeper spot, everyone else goes to the nearest position of the
  new shape (`remapByDistance`, closest pairs first), and the coach adjusts by tapping as usual.
  Minutes are untouched: every open stint is closed at the clock second and reopened at once with
  the new role and code and `stints.continues = true`, so the position-group split of a player's
  time is exact, while the rotation view, the Playing time rows and the parent's row count no
  extra shift and keep the shift time running (`playerTimes` follows a continuation chain). The
  change is a clock op (`kind = 'formation'`, stamped with `clock_seconds`, holding the previous
  formation and slots so Undo restores the shape as well as the stints); every new op is stamped
  from now on. The next period carries the formation in force when the period ended. The game
  page's Playing time section lists "Formation 2-3-1 → 3-3 · H1 23'" from `formation_changes()`
  and keeps the Starters row in the kickoff shape. `finish_game` writes the kickoff formation and
  the kickoff starters to the template, as before, even after a change — a mid-game change is
  not the next game's plan. The sport gate lives in the database: another sport gets P0015. "Up
  next" is unaffected (the bench queue holds players, not spots). pgTAP 23 (58 assertions).
  A change fires a burst of realtime events (slots deleted and re-created, every stint closed and
  reopened), and in the flow a parent's page sometimes missed the games update that followed, so a
  live game's clock and stints now also poll every 10 seconds (`useGameClock` / `useStints` with
  `live`): a dropped event costs seconds, not the half. Finished games do not poll.
- **The game bar at phone width.** The one-period card's "Game" title is kept for screen readers
  only; the title side of the header may shrink and clip, the formation pill clips with an
  ellipsis, the select is capped at 104px, and the clock and score chips keep their size, so
  nothing overlaps at 375px in light or dark (D97 amended; D70 amended for the formation change).

### D109. Start game is kickoff: the clock starts with the game, and an early start can be reset

In clock mode the game and its clock no longer start in two steps. `start_game` starts the clock in
the same transaction (the same write as `clock_start`: `running_since`, the safety-stop limit,
auto-pause off), so every start path — the Field's score tap and its sheet, the new-game form,
the Schedule's "Start game now" and the game page's Start game — kicks off at once, and every one
of them then opens the Field for that game. The bar shows Pause from the first second; Pause and
Resume are unchanged; "Start clock" is the label whenever the clock is paused at 0:00 in any period
(the start of a later period, or after a reset) and "Resume" when paused past 0:00. Period mode is
untouched.

- **Before any clock-mode start, a lineup check.** With an open starting spot, or a placed player
  who is marked out (the coach's flag or a reply for that game), a sheet lists them — "2 open spots
  (LM, RFB). Marked out but still placed: Nolan (parent)." — with Fix lineup (which goes to the
  Field and does not start) and Start anyway. Nothing starts until the coach picks one
  (`useStartCheck`, pure `startIssues` / `startWarning`). The confirmation for a scheduled game not
  dated today (D108) stays, before the check. A game with no scheduled lineup rows (no template)
  starts without the check.
- **Reset for an early start.** While paused in the first period with no score recorded on either
  side, the bar offers Reset clock. It confirms ("Minutes played so far are cleared. The lineup
  stays as it is; Start clock then runs from 0:00."), then `clock_reset` sets the clock to 0:00
  paused, clears the stretch limit and auto-pause, deletes the period's closed stints and its clock
  ops (so nothing from before the reset can be undone — chosen over refusing a reset after a
  substitution), and reopens every on-field stint at 0:00 without a continuation. The lineup row,
  the slots and the bench queue stay. Refusals: another period (P0019), a running clock (P0020), a
  score on the board (P0021). The clock-cap test's "no limit before the clock runs" became "the
  start writes the limit".
- **Dropped from D108:** the amber "never run" chip and the one-time "Start the clock?" prompt. Both
  were built and are removed again, with their tests.
- pgTAP 24 (45 assertions) walks start, reset while running, a sub then a reset, undo refused, a
  second start, the score and the second-period refusals. The Playwright clock flow starts a game
  and sees it running, resets it, and starts the clock again; the basketball flow hits the lineup
  check on an empty template, fixes it, and kicks off.

### D110. The app shell scrolls inside main, never the document

On iPhone the fixed tab bar travelled with the page on long screens (the Schedule was the report;
any long page did it). Chromium and WebKit at 375px showed no page wider than the viewport, so
the cause is iOS's own treatment of fixed elements while the document scrolls, not a layout bug.
The robust answer is the app-shell pattern: `html`, `body` and `#root` are 100% tall, the body is
`overflow: hidden`, and `main.app-main` is the one scroller (`overflow-y: auto`, momentum
scrolling, `overscroll-behavior: none` on the root and the scroller). The tab bar, the action bar,
the status strip, toasts and sheets stay `position: fixed`, now against a viewport that never
moves. Every layout already rendered `main.app-main`, so the auth, admin, error and dev screens got
the shell for free.

- The router's `ScrollRestoration` watches the window, so it is replaced by `useMainScroll`: a new
  page starts at the top, going back returns to where that page was, keyed by the history entry
  and kept in `sessionStorage` (the last 50 entries).
- A sheet's scroll lock (`useScrollLock`) now locks the scroller as well as the body.
- The scroller is `100dvh` tall (`100vh` as the fallback), not a percentage of `html`: in Safari's
  browser mode the dynamic unit follows the toolbar as it shows and hides, so the bar at
  `bottom: 0` and the end of the content are always on screen; in the installed app the two units
  agree. The bar keeps `padding-bottom: env(safe-area-inset-bottom)` inside its height, so its
  background reaches the screen's bottom edge above the home indicator with nothing below it.
  Checked at 812 and 660 px tall viewports, light and dark, Chromium and WebKit: the bar's bottom
  edge is the viewport's, `main` ends exactly at the viewport, the document never scrolls, and the
  last element of every page clears the bar (or the action bar) once scrolled to the end.
- Checked in Chromium and in WebKit (the Safari engine, iPhone emulation): on every coach and
  parent page the bar's bottom edge equals the viewport height before and after scrolling to the
  end, and no page is wider than the viewport. The flows that scroll (D61 back-with-scroll, D63
  status strip, the basketball no-scroll check) measure the scroller instead of the window.

### D111. The keyboard leaves the installed app scrolled; a field losing focus puts it back

In the home-screen app the tab bar sometimes sat a status bar's height too high with a black strip
beneath it, right after a form (creating a team). Not a sizing bug: the shell is `100dvh`, the
viewport is `viewport-fit=cover`, the status bar `black-translucent`, and the bottom inset is used
once as the bar's own padding inside its height, with the content, the action bar and toasts
clearing the bar's full height. The cause is iOS itself: to reveal a focused field it scrolls the
_document_ even though the body is `overflow: hidden`, and when the keyboard closes it leaves that
offset in place, so everything `position: fixed` is positioned against a layout viewport that is
shifted up by the amount it scrolled.

- `useViewportReset` (mounted once in `App`, so it covers every page and every form) listens for a
  field (input, textarea, select) losing focus and puts the window back at the top, once at once and
  once after the keyboard's closing animation, and does the same when the visual viewport is back
  to full height (`visualViewport` resize and scroll). While the keyboard is up nothing fires, so
  iOS can still scroll the field into view. No CSS changed: the D110 shell, the bar's pinning on
  long pages and the content's bottom padding are untouched.
- Checked in WebKit with iPhone emulation by leaving the document scrolled the way iOS does, then
  blurring the field: create a team, add a player on the Team tab, post on the board, and a field
  on the Field page, then Schedule, Stats and Settings — the window is back at 0 and the bar's
  bottom edge is the viewport's every time. The real device test is the coach's.

### D112. Court screen cleanup: the how-to behind an info button, the hint row only mid-change

The standing paragraph under the bench ("Tap a jersey, then another, to swap them…") took a
44px row on every card, in every state, and on the starters screen the staff help footer was the
"line of text" showing through the translucent Auto-fill / Clear bar.

- The paragraph is gone from both modes and all sports. A circled-i button right after
  "Bench · n" (`How to move players`, a 44px target drawn as an 18px glyph so the row keeps its
  height) opens a small popover with that text; it opens upward over the field, inside the card
  (the card clips overflow), and a tap anywhere else or Escape closes it. Parents have no button.
  On basketball during a live game the popover adds "Tap the points scored." and the standing
  line of that text under the quick-score row is gone; the confirmation line only appears once
  something is scored. The quick-score row now sits 8px under the card.
- The hint row (`.taphint`) stays in the DOM as the live region but has no height until it has
  content: the selection hint and Open the spot, scoring's "Who scored the +2?" with Team / Cancel.
  In periods mode the per-card Auto-fill / Redo button also lives there, so a period card keeps
  that row while it has an action to offer; the clock card ends right under the bench jerseys.
- The staff help footers on both Field pages ("These are the starters for the next game…",
  "Pick a few jerseys yourself…", the live clock paragraph) are removed: they scrolled behind the
  fixed action bar at the top of a long page, which read as hidden text. The parent footers stay.
- The court keeps its starters size during a game. The D108 "compact" court (80% wide while the
  quick-score row was on the page) is gone: with the paragraph, the standing points line and the
  help footer out of the way, and the live subtitle cut to "Live vs <opponent>" (the score and the
  swap hint are already on the card), the live basketball page fits at 375 × 812 with 68px to
  spare above the bar, and the shift timers overlap nothing. The e2e flow checks both: no
  scrolling, and the live court's size equals the starters court's. Soccer and the period cards
  never shrank.
- The keyboard reset (D111) is hardened for the start-game flow, where the opponent field unmounts
  on submit: `resetViewport` always calls `scrollTo(0, 0)` (iOS can leave the visual viewport
  offset while the window reports no scroll), every route change resets from `useMainScroll`, and a
  closing sheet blurs the field still focused inside it, so the focusout path runs before the
  field is gone. Focus moving straight from one field to another is left alone, so the page never
  jumps while the keyboard is still up. In WebKit the start flow, a tab change with a leftover
  offset, and field-to-field focus in the Add player sheet all end with the window at 0 and the
  bar's bottom edge on the viewport's.

## 2026-11-15 — Live-game queue, allergies, snacks, contacts

### D113. The tap queue, instant swaps with Undo, the paused-clock nudge, 2-2 strikers

A multi-sub (three off, three on) took six careful taps in order; a live swap only showed once
the server answered; and the strikers of 2-2 stood on the opposing goal.

- Taps on one side of the field build a line (`Selection` is now the queue, `resolveTap` returns
  the action and the remaining queue): each queued jersey or empty spot carries a numbered badge
  (`.qbadge`, 1 first); each tap on the other side moves the next in line, lowest number first,
  and the rest renumber. A single change is still two taps. Tapping a queued jersey leaves the
  line. An empty spot tapped with bench players in line takes the next of them; tapped with
  on-field players in line, the first of them moves there. Players coming off join the end of
  the bench line in the order they came off (unchanged). Exactly two players in line on one side
  offer a **Swap positions** / **Swap places in line** button in the hint row, so position swaps
  and manual bench reordering keep working; the same-side second tap now queues instead of
  swapping, which the spec asked for ("queue field kids then tap bench kids"). Starters, period
  cards and the live clock game share the engine; the hint names the whole line.
- Nothing waits for the round trip: in a live clock game the page keeps its own view of the
  spots and the bench (`ahead`) while the server calls run one after another in tap order
  (`runLive` chains `mutateAsync`; `useInvalidateClock` resolves only once the stints and the
  lineup are refetched, so the own view is dropped when the server state is the same). The
  template and the period cards were already optimistic. No confirm step existed for swaps.
- The toast carries an action (`toast(msg, { action })`, five seconds): **Undo** after every
  change reverses it in all three modes (`clock_undo` on the clock: spots, bench order and
  logged time; the previous plan on the template and on the period cards). The toolbar's Undo
  stays for stepping further back.
- The paused-clock nudge: a sub or a score while the game is on and the clock is not shows
  "Clock is paused" above the card with a Resume (Start clock at 0:00) button and a Dismiss;
  it goes on its own once the clock runs. The clock is never started by the app.
- Formation fix: `SOCCER_ROW_OVERRIDES` puts the striker row of 2-2 at field y 25 (halfway
  between the goal line and the halfway line) instead of the table's 18, in both views, with
  or without a keeper. Checked the other soccer shapes: the generator uses y 18 for the forward
  row of every multi-row shape (1-1, 2-1, 1-2, 1-1-1, 1-2-1, 2-1-1, 1-3, 3-1, every 5- to
  11-a-side shape); only the one-row "2" differs (y 40). They all share the 2-2 problem to the
  same degree and were left as they were, as asked.

### D114. Allergies on the player profile; a team summary with no names

`player_allergies` keeps three states per player: no row (not answered), `none`, or `has` with
`allergens` from a fixed list (peanuts, tree nuts, dairy, eggs, wheat/gluten, soy, sesame, fish,
shellfish, other) plus `other` (the allergen's name, required with the Other chip) and a separate
`notes` text (severity, EpiPen…). Checks keep `none` empty and Other named. The row is private
exactly like the birthdate (`can_see_player_private`: staff and the player's **approved**
guardians read and write; a self-linked parent waits for the coach to confirm the link, D91),
enforced by RLS and proved in pgTAP 25. `team_allergy_summary(team)` gives every active member
the combined allergen list, the Other names and whether some family has not answered, never a
name and never the notes. The chips (a None chip that clears and excludes the others) live on
the player page and the parent Home's Details; the summary sits under the roster on the Team
tab and tops the snack list (D115).

### D115. Snack signup: one family per game or practice, capped per family, coaches override

`teams.snack_signup` (off | games | both, default off; Settings, staff). The family is stored on
the event (`games.snack_player_id`, `practices.snack_player_id`): a player, shown as "<Player>'s
family", so either parent sees and changes it. Only `set_snack` / `clear_snack` write it. A
parent (anyone who may RSVP for the player) claims an open, upcoming, eligible event while their
family holds fewer than `snack_cap` = ceil(eligible events this season / active players)
slots, may move a slot between their own children, and releases only their own; coaches and
assistants assign, clear or override any slot with no cap. The parent Home links to `/snacks`
(the allergy summary on top, every upcoming eligible event with Open or the family, one tap to
claim, one tap to release); the signed-up family's Next up card and the event page say "You're
bringing snacks" with the allergy summary; schedule rows carry a small apple icon (outline open,
filled taken, red when the family can't make it) and nothing else. When the snack family's
reply turns to "can't make it", a trigger flags the event for the coaches (`snack_flagged`,
cleared when the reply changes back or the slot changes hands) and the app asks the family to
release the slot. pgTAP 26 covers the gate, the cap, the override, the release and the flag.

### D116. Duplicate contacts: a joining parent attaches to the coach's entry

A contact the coach typed (no account) was doubled when that parent's link was confirmed,
because `guardian_contact_row` matched by account only. Now it looks at the child's contacts
without an account for the same phone digits (`phone_digits`, a leading +1 dropped) or the same
email (`email_key`, lowercased and trimmed) and attaches the account to that row: the coach's
name, relationship label and share setting stay, blank fields are filled from the account.
`approve_member` (approval on) goes through the same function. A name-only match is never
merged on its own: coaches see "Possible duplicate: A and B · They have the same name. Merge?"
on the card (`findDuplicates`, pairs by phone, email or name, two different accounts never), and
the contact edit screen offers "Merge with…" the player's other contacts. Both call
`merge_contacts(keep, drop)`: the kept row keeps its label and sharing, takes the account and
any blank field, the other row is deleted; allowed to whoever may edit both rows. Existing data:
`scripts/contact-duplicates-dry-run.sql` lists every phone/email pair (to be merged) and every
name-only pair (for the coaches to decide) across all teams; `contact-duplicates-apply.sql`
merges the phone/email pairs only, after approval. pgTAP 27.

## 2026-11-16 — Eligible positions, basketball stats, softball

### D117. Eligible positions: a grid per team, never for Auto-fill, never a block by hand

Coaches asked for "Nolan never in goal" without losing Auto-fill. Every sport but volleyball now
has position groups in the coach's words (`SportDefinition.eligibility`: soccer Goalie, Defense,
Midfield, Forward; basketball Guard, Forward, Center; lacrosse Goalie, Defense, Midfield, Attack;
baseball and softball Pitcher, Catcher, Infield, Outfield; hockey Goalie, Defense, Forward when it
lands), keyed by what `group(role)` already returns, so every formation spot maps to one group.

- `player_position_prefs` keeps one of preferred / can / never per player and group; "can" is the
  default and is stored as no row (a tap back to can deletes the row). Preferred is stored for a
  later round and not offered yet. RLS: staff of the player's team only (`is_staff` through
  `team_of_player`); a parent, even the player's own confirmed parent, reads nothing and cannot
  write. The hook is only enabled for staff as well. pgTAP 28.
- Both engines take an `eligible(playerId, group)` predicate: `autoFill` / `autoFillAll` (period
  mode: the Field cards, the Rotation grid) and `fillByTime` / `suggestStarters` (clock mode:
  Auto-fill by season minutes, Suggest starters at a break). The ranking is unchanged (fewest
  time first, a turn in each group, random tie-break); a player marked never is simply not a
  candidate for that spot. When nobody left on the bench may take a spot it stays open and the
  result names it (`skipped`), and the toast says "GK left open · nobody eligible". Placing a
  player by hand, tapping a jersey or a bench player, a sub on the clock, is never blocked and
  never warned about.
- The grid is `/team/positions` (`PositionsPage`): players down, groups across, a tick for can
  play, a dash for never, one tap toggles. Reached from the Team tab's Edit roster toolbar
  (Positions) and the player card shows the same groups as chips (`EligibilitySection`, staff
  only). A parent who types the URL is sent back to the Team tab.

### D118. Basketball stats: tracked entries next to the points, and a stat keeper

The points pattern of D108 (tap +2, then the jersey) now covers rebounds, assists, steals and
fouls, each an optional entry the team chooses to track.

- `stat_events` (game, player, period, `stat_type` rebound | assist | steal | foul, the clock
  second stamped like a score in a live clock game) sits next to `score_events`; basketball only,
  the player must be on the game's team (trigger). One rebound count, no offensive/defensive
  split. `teams.tracked_stats` (a `stat_type[]`, empty by default) decides which buttons and
  columns exist: Settings has four chips (REB, AST, STL, FOUL) for staff on a basketball team.
- On the live court the tracked stats are a second row under Us/Them (`QuickScoreRow`): a tap arms
  the court ("Who got the rebound?" / "Who made the assist?" / "Who got the steal?" / "Whose
  foul?"), the next jersey tap records it, the confirmation line reads "Ada REB" with Undo once
  the insert has settled. The score sheet (period-mode Field, the game page's Add score) carries
  the same buttons for the picked player, so an entry can be added after the fact too. The game
  page lists the entries under "Stats · n"; a tap opens `EditStatSheet` (player, period, kind,
  delete), the same way scores are edited. `player_season_stats` returns rebounds, steals, fouls
  and counts stat-event assists into `assists`; the Stats tab shows REB / AST / STL / PF only
  while tracked (`statColumns(S, clockMode, tracked)`). `game_stats(p_game_id)` withholds other
  children's ids for parents exactly like `game_events` (D56).
- A **stat keeper** (`team_members.is_stat_keeper`, set by a coach through `set_stat_keeper`,
  offered on the Members screen for any member) may insert, change and delete scores and stats
  while a game is live, and nothing else: `can_log_stats(game)` = staff, or a stat keeper while the
  game is live, is the write policy on `score_events` and `stat_events` (and lets them read the
  log of that game so Undo can find the entry). The context carries `statKeeper`; the live court
  shows the quick-score row to a keeper (jersey taps answer "who?" only, never a sub), and the
  game page shows Add score / Add stat while live but no editing, no lineup, no finish. pgTAP 29.

### D119. Softball; nine or ten fielders

Softball is a sport of its own (`sport` enum value `softball`), reusing the baseball model end to
end: the diamond artwork and formations (`baseballFormations`), the baseball jersey, the batting
order on its own Lineup tab, runs as the score (`score_event_points` reads the sport as text so
the new value needs no second copy of the table), plate appearances as the batting log (the
validator accepts both sports), the baseball stat columns and AVG, and the baseball skill tests
(`default_skill_tests` now routes softball to the baseball set, the lists themselves stay in the
0800 migration under `default_skill_tests_v1`). A new softball team tracks playing time by innings,
like baseball (D87). The enum value is added in its own migration because Postgres refuses to use
a new enum value in the transaction that added it. The sport tint is baseball's; the position names
and the eligibility groups (Pitcher, Catcher, Infield, Outfield) are shared.

Team setup gains a **Fielders** row for baseball and softball: 9 or 10, where 10 adds a fourth
outfielder. It writes the same `side_size` the stepper does (the stepper stays for the small-sided
sizes), and the existing shape rules do the rest: at 10 the template moves to the first ten-player
formation, "4 outfielders", and the coach may still pick "Rover infield" from the card. pgTAP 30.

### D120. One active stat keeper per live game

Only one person logs scores and stats in a live game at a time. `games.keeper_user_id` (with
`keeper_name` snapshotted for the game bar) names the active keeper: `start_game` sets it to the
staff member who starts the game; `keep_stats(game)` lets a coach, an assistant or a granted stat
keeper (D118) take it over, or back, with one tap. `can_log_stats(game)` is now: while the game is
live, the active keeper alone (a live game nobody keeps falls to the staff); afterwards the staff,
as before. It stays the write policy on `score_events` and `stat_events`, so the single keeper
holds outside the app too. The pages derive the same answer from the game row (`canLogGame`): the
score button, the quick-score and stat rows and Add score / Add stat show for the active keeper
only, coaches included; everyone else reads the score. A `KeeperBar` under the title ("You keep
the stats" / "Pat keeps the stats") carries Keep stats for whoever may take over. The context
carries `userId` for the comparison. Finishing a game is still the staff's. pgTAP 29.

### D121. Volleyball

Volleyball is a sport of its own (`sport` enum value `volleyball`, added in its own migration like
softball). Six on the court in rotation spots 1–6 as one formation, "Rotation" (slot i = spot
i + 1: RB, RF, MF, LF, LB, MB; the front row is near the net, which stands on the far line of a
court drawn by `scripts/gen-volleyball.mjs`). No eligibility groups, no goalie, the basketball
jersey. There is no clock: a volleyball team is a **clock-mode team whose clock never runs**, the
"second" of a stint is the point of the set and the sets are the clock periods (`clock_periods` 1,
3 or 5, the Sets row in Team setup). That way the stints, the bench queue, the tap queue, the
subs and Undo are the ones every clock sport has, and playing time falls out as **points played**
(the stint length, `seconds_played`) and **sets played** (`player_season_stats.stint_periods`, the
periods with a stint). `start_game` does not start the clock for volleyball.

Scoring is point by point (`vb_point(game, side)`): the score event is a `point` op in
`clock_ops`, so one Undo takes the point back together with its serve change and any rotation it
caused. We rotate only on a side-out (our point while they served), never on their point, never on
our own serve, never before the set's first serve is known (`games.vb_serving`, set by a tap on Us
or Them in the bar, `vb_set_serve`). With **Rotate through bench** on (default) and someone waiting,
the player at the exit spot (default 2, right front) does not rotate: they go to the end of the
bench line, the other five rotate one spot clockwise, and Up Next enters at the entry spot
(default 1, as the server); an entry spot elsewhere sends whoever rotated into it to the spot the
rotation left empty. `vb_rotate` does the same by hand. A set ends on its own at the target with
win by two (`vb_set_points` 25, `vb_deciding_points` 15 for the last possible set, `vb_win_by_two`;
all editable per team) or by hand (`vb_end_set`); the set end is the usual `end_period` op (not
undoable), the same six start the next set at zero, and the first serve alternates
(`games.vb_first_serve`). The match is decided at more than half the sets; the bar then closes and
the coach finishes from the game page. A game's score is **sets won** (`game_scores_for` counts
the sets that have ended), the game page's line shows the points per set with the sets as the
total.

The active stat keeper (D120) scores and undoes their own points and rotations (`vb_undo`); a
coach or assistant may also rotate by hand, end a set, substitute and undo anything (`clock_undo`
and `vb_undo` share `clock_undo_inner`). The live court (ClockFieldPage with a `vb` switch) shows
"Set n" with the set's points in the score chip and the sets tally in the title line, the ball on
the server's jersey, points under each jersey, and the point bar (serve, +1 Us / +1 Them, Rotate,
Undo, End set) where basketball has its quick-score row. Playing time lists read in points.
pgTAP 31.

### D122. Hockey; named lines and the one-tap line change

Hockey is a sport of its own (`sport` enum value `hockey`, its own migration first). Six on the ice
as one formation, "Lines" — G, LD, RD, LW, C, RW — on our defensive half of a rink drawn by
`scripts/gen-rink.mjs` with our net on the goal line; a clock-mode team with three periods
(`clock_periods` from the template, like volleyball's sets) and the existing period length; goals
keep the soccer model (a scorer and an optional assist, editable after the fact); eligibility
groups Goalie / Defense / Forward. **Auto-fill and Suggest starters leave the goalie spot alone**
(`skipRoles: ['G']` in both engines, never flagged): the goalie stays in the net unless the coach
changes them by hand, and the halftime suggestion keeps the current goalie and re-picks the
skaters around them.

**Lines** (`lines`: per team, three forward lines LW/C/RW and two defense pairs LD/RD, each with a
name and up to three or two players of the team; members read, staff write) are edited on the
Lines screen (Team tab, Edit roster → Lines, `/team/lines`), every change saving on its own. On the
live rink a Lines row under the bench shows the saved lines as chips; one tap calls
`clock_line_change(game, line)`, one undoable op (`clock_ops.kind = 'line'`) that puts the line on
exactly as saved: a line player already on the ice elsewhere moves to their line spot (their stint
continues), players displaced from the line's spots who are not in the line go to the end of the
bench line, and a spot left empty by a move stays open and is returned as a code so the toast
flags it ("Second on · LW left open"). A forward line change never touches the pair or the goalie;
a pair change never touches the forwards. The tap queue still works for single subs. pgTAP 32.

### D123. Practice library prototype: one item, First Touch

**Entry and pages.** Settings → "Practice library" sits directly below Skills tests, for soccer
teams only (`LIBRARY_SPORTS`) and for every role. `/library` lists the sport's published items as
cards grouped by category; `/library/:slug` is the detail page: title, category and ages, then one
tab per content section (Learn, Coach Setup), chosen with `?tab=`. The page holds the screen wake
lock (`useWakeLock`) while open. All members see both tabs for now; parent permissions are still
to be decided. No planner, custom drills, video or other items yet; Skills tests are untouched.

**Data.** `library_items` (slug, sport, category `fundamentals | tactics | position`, title, ages,
sort order, published flag, `content jsonb`) holds the built-in content, seeded by the migration
so it reaches the hosted database with `db:push`. Every signed-in user reads published rows; there
is no write policy and the write grants are revoked. `content` has one object per tab: `learn`
(tagline, focus, steps, cues, wrong/right pairs, big picture) and `setup` (params, diagram, run
steps, equipment). The page shows a tab for each section present, so a Tactics item or a later
`video` section is a data change. `src/library/types.ts` parses the JSON defensively and skips an
element kind it does not know.

**Team overrides.** `team_library_overrides (team_id, item_id, params jsonb)`: members read,
coaches and assistant coaches write (RLS via `is_active_member` / `is_staff`), and the
`check_library_override` trigger refuses a key the item does not mark `adjustable`, a non-integer,
a value outside `min`–`max` or off its `step`, and an item of another sport. The built-in row is
never written; "Reset to default" deletes the override row. The steppers save on each tap
(optimistic, serial per item); a stored value the item no longer allows is ignored on read.

**Setup numbers.** Cones 4 (3–5); spacing default "3–5 yd (9–15 ft)", a team picks one whole
number of yards from 2 to 8, shown with feet; players "2+" (not adjustable); duration empty by
default, 5–30 minutes in steps of 5, with one step below 5 meaning "Not set".

**Diagram.** Drawn by the app as SVG from `setup.diagram.elements` (`cones`, `player`, `arrow`
with kind `pass | touch | dribble`, `measure`); no image, no editor. Coordinates are **cone gaps**,
not yards: a point is `[x, y]`, an anchor id (`"c0"`, `"passer"`) or `[anchor, dx, dy]`; `"$key"`
reads a setup number; an arrow with `"repeat": "c"` is drawn once per gap between the cones. The
picture is therefore a schematic that always fits a phone ("Not to scale" in the key): the cone
count changes the drawing, the spacing changes the label. A to-scale drawing was dropped because
five cones at 8 yards would shrink the offsets under the size of the marks. The grass stripes and
colors echo the pitch, but `FieldStage` is not reused: it places formation slots on a full-pitch
image through a homography, which does not fit a 12-yard cone line. Players are lettered circles
(P, R), not jerseys, so they read at 26px.

**Images.** Step pictures live in the public `practice-library` storage bucket (created by the
migration, 1 MB limit, WebP/JPEG/PNG, no write policy). A step stores
`image: { path, width, height }`, so swapping a picture is a one-row update; the frame takes the
picture's own shape, clamped between 3:4 and 16:9, so the planned portrait images need no code
change. A missing or failed image shows the step number. The temporary pictures are cropped from
the user's sheet by `scripts/crop-practice-images.mjs` (the Playwright browser does the WebP
encoding) at their native size, about 365×284 and 25 kB each. The whole `practice-library/`
folder (source sheet and crops) is gitignored: on the hosted project the four files are dragged
into the bucket under `first-touch/`; locally `scripts/upload-practice-images.mjs` uploads them
with the local stack's key and refuses any non-local address; CI shows the placeholder. A local
`db reset` empties the bucket, so run the upload script again after one.

Tests: `src/library/__tests__/library.test.tsx`, pgTAP 33, one Playwright flow at 375px in both
themes.

### D124. Library games: Coach's Call as a framed page

The practice library has a **Games** section under the drill categories. The first game is the
user's single-file "Coach's Call" (soccer skill games, ages 6–9), added to see how it plays on a
phone. It is kept exactly as supplied in `public/games/coachs-call.html` (218 kB, 66 kB gzipped)
and shown by `/library/play/:game` in an iframe that covers the whole screen, tab bar included: a
slim bar with "‹ Practice library" on top, the game below, the bottom safe area padded by the app
because `env()` insets are zero inside a frame. The screen wake lock is held while it is open.

The list of games is code (`src/library/games.ts`), not a `library_items` row: the file ships with
the build, so a database row would only be a second place to keep in step, and this way there is
no migration. A game shares only the origin with the app; Coach's Call keeps its own progress in
`localStorage` under `coachscall_v1` (per device, not per account or team) and makes no network
calls except the two Google Fonts it links (it falls back to system fonts offline).

Service worker: `**/games/**` is left out of the precache, `navigateFallbackDenylist` keeps the
app shell from being served in the frame, and a `StaleWhileRevalidate` runtime cache
(`library-games`) makes a game available offline after its first open. Initial JS is unchanged.
Soccer teams only, every role. Playwright covers opening the game and coming back.

### D125. Library: more items, entered as drafts; box drills and a goal line

Further practice-library items follow First Touch's structure and are added one migration each,
**unpublished**: the user reviews a sheet per item (text transcribed from the poster, proposed
setup, drafted wrong-vs-right pairs), the approved item is inserted with `is_published = false`,
checked on a phone, then published with an `update` in the SQL editor. So that the phone check is
possible, the read policy of `library_items` is `is_published or is_platform_admin()`: a platform
admin sees drafts, marked "Draft" on the card and on the page; nobody else does, and the app still
cannot write the table. The client no longer filters on `is_published`; row security decides.

First two: **Passing the Ball** (the five-step "Pass & Move!" sheet; the separate "Passing and
Receiving" sheet is not used) and **Win It and Keep It**. Teaching text is the poster's own,
including LEFT/RIGHT wording written for a right-footed player. Ages 6–10 like First Touch;
duration empty. The adjustable ranges are ours: the posters give single values.

Drawing additions, all data: a measurement takes a `side` (`above`, `below`, `left`, `right`; an
upright one is drawn beside the box with its label turned), players take the roles `attacker`
(red) and `defender` (blue), and a setup section takes a one-sentence `goal` shown above "How to
run it". A box is two `cones` rows. Win It and Keep It has no arrows because its poster shows
none.

Crops for all items come from `scripts/crop-practice-images.mjs`; each item's files go in the
bucket under its slug (`passing-the-ball/step-1.webp` …).

### D126. Library: Striking the Ball; technique tips and a ticked big picture

**Striking the Ball** uses the seven-step "Shoot with Power & Accuracy!" sheet (the earlier
five-step sheet is not used). The text is the smaller sheet the user chose; the pictures are
cropped from the larger copy of the same seven steps. Inserted unpublished like D125.

Two optional Learn blocks, both data: `tips` (small captioned close-ups shown side by side under
the coaching cues) and `big_picture_points` with `big_picture_close` (a ticked list between the
big picture's opening and closing lines). The sheet has no cone setup, so its setup section has
no diagram and only the empty duration; "How to run it" is the sheet's Try It.

### D127. At-home drills: ten library items with a `home` section

The first piece of at-home Training for parents (soccer only). The ten drills of the reviewed
home-drills sheet are library items of a new category, `home` ("At home"), each with one content
section, `home`: skill, type (repetition, timed or accuracy), minutes, intro, "With a parent",
"On my own", three levels, coaching tips, extra notes ("What counts as a clean run", "No wall")
and the demo clip description. The migration was generated from the sheet so the text is word
for word; the sheet itself stays out of the repo.

- **No videos yet.** `clip` is stored and nothing renders it.
- **Published on insert**, unlike D125: parents cannot see drafts and the drills are for parents.
- **One tab per section.** The item page already shows a tab only for the sections an item has;
  a home drill has only "At Home", the existing items are untouched.
- **"Repetition, then accuracy"** (drill 10) is stored as a repetition drill whose third level is
  marked accuracy; the label is shown as the sheet words it.
- **Cone Dribbling** carries `stopwatch: true` for the built-in stopwatch that follows.

### D128. Training page: Daily Drills, and how a Done is recorded

A parent's Training page for one child (`/training/:playerId`), soccer only.

- **Today's three** come from the sheet's five-day rotation, picked by the calendar with nothing
  stored: days since Monday 5 January 2026, modulo five. Every child sees the same drills on the
  same date. "Do another" lists all ten; a Done there is recorded the same way.
- **A Done** is one row in `home_drill_completions`: child, drill, date, level, mode. One per
  drill per day. All three levels are open; the card starts from the level and mode used last.
- **The date is the server's**: today in the team's timezone (`team_today`), so a drill cannot be
  backdated from a device.
- **Who**: only a parent with a confirmed link, on the team, to a child on the roster
  (`can_train`) records; coaches and assistant coaches read (`can_see_training`); other parents
  see nothing. A parent may take back a Done they recorded, the same day only. Nobody edits.
- **Screen**: one drill open at a time; the screen stays awake while one is. A short "All three
  done!" note is the celebration.

### D129. Cone Dribbling stopwatch and personal bests

The timed home drill has a stopwatch inside its card: large digits to a tenth of a second, Start
and Stop, then "Clean run?" with Save or Discard.

- **Times** are rows in `home_drill_times`: child, drill, level, seconds to a tenth. Only a saved
  run is stored. The personal best is the lowest time per child per level; the course is fixed per
  level in the drill's text, so times at one level compare.
- **After Save** the card says whether the time beat the best before it (a tie does not), and
  lists the last five runs at that level.
- **A saved clean run marks the drill Done for the day**, at the run's level and "with a parent"
  (a database trigger, so it cannot be skipped). Discard records nothing.
- **With a Parent only.** The sheet's solo version has no stopwatch and counts clean runs, so
  "On My Own" shows the text and no stopwatch.
- **Same permissions as a Done** (D128); a parent may delete a time they saved, the same day only.

### D130. The streak: what counts, days off, milestones

The streak belongs to the child and is counted in days, at most one a day.

- **A day counts** when a home drill was marked Done, or the child has playing time in a game that
  day (a stint in clock mode, a place in a period of a started game's lineup in period mode), or a
  parent marked "We went" on a practice that day. Opening the app and merely scheduled events
  never count.
- **No coach attendance exists for practices** (the RSVP says who is expected, not who came), and
  none was built: a practice counts only through "We went".
- **"We went"** (`set_practice_went`) opens when the practice starts (its date, when it has no
  start time), never for a cancelled practice, and can be taken back the same day by the parent
  who marked it. It is on the practice page and, for the last week's practices, on Training.
- **Days off**: two missed days in a Monday-to-Sunday week do not break the streak. It resets to
  zero on the third missed day of a week, or on three missed days in a row, whichever comes
  first. Today is never a miss until it is over. Days are the team's timezone days.
- **Computed when read** (`training_streak`, from `streak_from_days`, a pure function); only the
  longest streak and the celebrated milestones are stored (`player_training`).
- **Milestones** at 5, 10, 25, 50 and 100 days, each celebrated once per child: the parent sees a
  note and "Nice!" records it. Coaches see the streak and no celebration.
- No rest passes, currency, rankings or leaderboards.

### D131. The streak indicator on the parent dashboard

Upper right, beside the title of the parent's home page: a small flame, the child's current
streak and a "Daily Drills" label. Tapping it opens that child's Training page. No new bottom tab
and no large button; the rest of the dashboard is unchanged.

- One indicator per confirmed child. When the dashboard is about more than one child, each
  carries the child's first name.
- Shown for soccer teams only, and only for a child whose link a coach confirmed; an unconfirmed
  parent sees no indicator and cannot open Training (the database refuses too).
- A streak of zero shows a grey flame.

### D132. Skill tests at home: Home and Coach results, labelled and kept apart

The Training page has a second tab, Skill Tests. It uses the team's existing skill tests (the
shown ones); there is no second set.

- **Source and conditions.** Every `skill_results` row has a `source` (Coach, the default and
  every older row, or Home) and optional free-text `conditions`. The source never changes.
- **A parent** records a Home result for their own confirmed child, and edits or deletes only the
  Home results they recorded. **Coaches** keep full control of Coach results and can see Home
  results, but cannot edit or delete them. Row security enforces both.
- **Together but never combined.** The tab lists both sources in one history, each row labelled,
  with a separate best and latest per source. On the coach's Skills screens the only visible
  change is the source label in a test's history; their bests, trends and sparklines are computed
  from Coach results only, so a Home result never moves a coach's number.
- A Home result must be on one of the team's shown tests and cannot be dated in the future.
- Copying a team (`duplicate_team`) keeps each result's source and conditions.

### D133. Training permissions, in one place

Everything about at-home Training is enforced by row security and by checks inside the
functions; the screens only hide what would be refused.

- **A parent** sees and records only for their own child, and only once a coach has confirmed
  the link (`can_train`: approved link, active member of the team, player on the roster). That
  covers home drill completions, stopwatch times, "We went", the streak and Home skill results.
  An unconfirmed parent, a parent of another child, and a parent removed from the team get
  nothing.
- **Coaches and assistant coaches** see a child's streak (a read-only row on the player's page),
  completions, times, "We went" marks and Home skill results. They record none of them and
  cannot edit or delete a Home result.
- **Other parents** and other teams see nothing; signed out, nothing.
- The date of every training record is the server's (the team's day), and none can be edited.
- pgTAP: `supabase/tests/34_training.test.sql`.

### D134. On an "Own" team, a parent's Rotation shows only their own children

When **Parents can see stats for** is set to **Own**, the Team tab's Rotation view narrows for
parents (not for coaches or assistant coaches):

- Only the parent's own children are listed, under Playing time or Out this game.
- The Balance section (team range and average) is hidden.
- The Position key is unchanged; it names positions, not players.
- On a clock-mode team the minutes bar is full for any time played, never scaled against the
  team's top player.
- A parent with no linked child sees one line saying playing time appears once they are linked.

The Roster view is unchanged, and so is everything on a **Team** setting. This is a display
change only: lineup rows are still readable by team members, and the Field tab is untouched.

### D135. Navigation around a Training tab; the Stats tab is gone

This round only moves and regroups existing features. No database change.

**Bottom bar.** Field, [Lineup], Team, Schedule, Training, then the gear. A parent, and a coach or
assistant with a linked child on the team, get the child's tab first; they keep every coach
right. When that would make six tabs (baseball, softball) the Lineup tab folds into the Field
tab as the "Batting order" switch, as it already did for parents. A coach with a linked child
still lands on Field.

**Training tab** (`/training`), every sport, showing only the sections the sport has:

- Daily Drills: soccer, for a child whose link a coach confirmed. The streak card sits on top.
- Skill Tests: every sport. A parent sees their child's cards with "Record at home". Coaches and
  assistants see the Team table (it was Stats → Skills) with "Edit tests" (it was Settings →
  Skills tests). A coach with a linked child chooses "My kid" (results save as Home) or "Team"
  (results save as Coach).
- Library: the Practice library (it was a Settings row), where the sport has one.
- Without a confirmed child there is no streak card and no Daily Drills; a parent sees a line
  saying skill results appear once they are linked. What an unconfirmed parent can do is
  unchanged.

**Where stats went.**

- Season: Team → Season, a third view beside Rotation and Roster, with a "Last game" link to the
  most recent finished game on top. The season tiles on the child's tab open it.
- Current game: on the Field tab while a game is live, and on the game's page during and after
  it. On the quarter-card Field page it is a collapsed line under the cards; on the clock-mode
  Field page it opens from a small icon at the end of the subtitle, because that page must fit
  a phone screen without scrolling (D108) and has no spare line. With no game live, the last
  game's numbers are on that game's page only.
- The privacy rule is unchanged and still enforced by the database (D56): on an "Own" team a
  parent gets individual numbers for their own children only.

**Two or more children on the team.** The child's name on top of the child's tab is a switcher
(plain text with one child). The first tab's label, the season tiles, the streak and the
Training tab follow the selected child, and Training shows the same switcher. The Next up card
has one reply line per child. The choice is remembered per team on the device.

**Old addresses.** `/stats` → Team → Season; `/library` → Training → Library;
`/training/:playerId` → Training with that child selected. Library items and games keep their
addresses.

### D136. Follow-ups to the Training tab: highlight, Batting order return, a steadier hockey flow

- **Library pages light the Training tab.** A drill's page and a game's page keep their
  `/library/...` addresses, so a tab can now name other path prefixes that belong to it
  (`also` on a tab item); the Training tab names `/library`.
- **Back from "Edit order" returns to the Batting order.** Where the Lineup tab is folded into
  the Field tab (baseball and softball with a child's tab), the Field / Batting order switch is
  kept in the address (`/field?view=lineup`) instead of in memory, so going back restores it.
  Opened directly, the Edit order page's back link leads to the same view.
- **The hockey end-to-end flow no longer depends on Auto-fill's random tie-break.** Auto-fill
  ranks by time played and breaks ties at random; it does not look at saved lines. With a new
  team everyone is tied, so the flow sometimes started a Second-line forward on defense or in
  the net, and putting the line on then left that spot open, as designed (D122: a player
  moved by a line change leaves their old spot open unless the line fills it, and the toast
  says so). The flow now picks the starting six before the three line players are on the
  roster. Auto-fill itself is unchanged.

### D137. A stopwatch on recording a timed skill test

A skill test measured in time (`metric = time_seconds`: Sprint speed, the cone dribbling time,
any custom test set to Time) shows a stopwatch above its Time field wherever a result is
recorded: the parent's "Record at home" sheet, the coach's single-result sheet and the coach's
whole-team "Record results" sheet. Tests that are not timed are unchanged.

- **One stopwatch.** The Cone Dribbling stopwatch's clock (D129) moved into `useStopwatch`;
  the drill stopwatch and the compact one on the sheets both run on it. Same precision, a tenth
  of a second, which is what the Time field already takes.
- **It only fills the field.** Start, then Stop: the time goes into the Time field as plain
  seconds ("62.3", never "1:02.3"). The field stays editable. "Start again" takes a new time
  that replaces it. Nothing is saved until the sheet's own Save button, so Home and Coach
  results save exactly as before. A tap too quick to be a run changes nothing.
- **The whole-team sheet has one stopwatch for the list.** It names the player it is timing
  (the first to begin with), fills that player's row, and offers "Next: <name>" after a time is
  taken. Tapping a player's field points it at that player; it does not move while running.
- **The keyboard no longer opens by itself on a timed test.** These sheets used to focus the
  first value field on opening; with the stopwatch above it, a timed test waits for a tap on
  the field, so the stopwatch, the field and Save share the screen. Other tests still focus it.
- No database change.

### D138. Daily Drills made simple for a brand-new parent

**One drill a day.** Today shows one drill, not three; "Do another" lists the other nine. The
drill is picked by the calendar from a ten-day rotation, so everyone on a team has the same drill
on a date, each child at their own level. The order changes the kind of drill from day to day:
Toe Taps, Cone Dribbling, Wall Passing, Inside-Inside, V-Cuts, Juggling, Sole Rolls,
Inside-Outside, First Touch With a Parent, L-Drags. A child with no Done before today gets Toe
Taps, whatever the date, and keeps it for that whole first day; from the next day they follow
the rotation.

**The streak.** A day counts when a home drill is marked Done, when the child has playing time
in a started game (as before, so no past game day stops counting), or when a parent taps "We
went" for a practice or, now, a game. There are no days off: a missed day ends the streak. Today
is never a miss until it is over. Milestones stay at 5, 10, 25, 50 and 100.

- _No streak went down._ When the migration ran, each child's streak under the old rule was
  stored with that date (`player_training.carried_streak`, `carried_from`); the strict count
  starts from that number on that date.
- The streak card shows the number, the longest, and one line: "Done for today.", "One drill
  today keeps it going." or "Do one drill today to start a streak."
- "We went" for a game follows the practice rules: once it has started, for the parent's
  confirmed child, taken back the same day by the parent who tapped it (`game_checkins`,
  `set_game_went`). It is on the Training tab and on the game's page.

**The drill card.** Only: the instruction for the child's level (one sentence a parent can read
aloud; every level stands on its own), a picture when the level has one, the parent's job, and
Done. No countdown and nothing to follow on screen. Cone Dribbling keeps its stopwatch on the
card: it is the drill. "More" holds the other levels, the coaching tips, the notes and On My Own;
With a Parent is the default.

- _Pictures._ One per drill level: `content.home.levels[n].image`, an object path in the
  `practice-library` bucket. None is set yet, and a level without one shows nothing.
- _Wording._ The ten drills are reworded in the migration: `text` and `parent_job` per level.
  The intro, the two modes' text, the notes and the tips are kept for "More" and the Library.

**Levels.** Each child starts every drill at Level 1 and moves up after one Done at a level, to
Level 3 at most: with a ten-day rotation, three Dones a level would have taken a month each. So
the next time a drill comes round the child is a level up. A parent can pick a level under
"More", and the child goes on from there. The level
is worked out from the Dones when read (`home_drill_levels`), so taking a Done back takes its
progress back. A Done at another level does not count toward the current one. Children who had
already marked a higher level Done started from the highest one
(`home_drill_level_overrides`, seeded by the migration).

Unchanged: Cone Dribbling times and personal bests, Home skill tests, and who may record or see
training.

### D139. Training → Library: collapsed categories, drill groups, Publish / Unpublish

**The list.** Each category is one row with its count, closed until tapped: Fundamentals, Drills,
Games. The categories left open are remembered on the device (`libraryOpen` in the UI store), so
going into an item and back does not close the list. Categories come from one ordered list in
code (`LIBRARY_CATEGORIES`); a category shows once it holds something, so Tactics and
Position-specific are listed there and stay hidden until they have items. A count is what the
viewer can open: a platform admin's includes drafts.

- "At Home" is now "Drills" wherever it shows. The database category is still `home`: the Daily
  Drills rules check for it.

**Drill groups.** Inside Drills, the drills sit under six groups, in this order: First Touch and
Ball Control; Dribbling and Ball Mastery; Striking (Passing and Shooting); Heading and Aerial
Play; 1v1 Defending; Goalkeeping. A group shows only when it has a drill the viewer can see,
which for everyone but a platform admin means a published one. A drill names its group in
`content.home.skill`; the migration re-tags the ten drills (it was Footwork, Dribbling,
Dribbling move, Passing, Ball control). The same name is the tag on a Daily Drills card.

**Publish / Unpublish.** Until now an item left Draft only by an `update` in the SQL editor. A
platform admin now has Publish on a draft's page and Unpublish on a published item's page
(`set_library_item_published`). Platform admins only, not coaches: an item is shared by every
team of its sport, so one team's coach would change what every other team sees. Unpublish asks
first; for a drill in the Daily Drills rotation it says that parents will no longer see it and
another drill will show on its day. The table is otherwise still read-only from the app, and the
read rule is unchanged: nobody but a platform admin is ever sent a draft.

- Daily Drills reads published drills only, for a platform admin too, so an admin sees what
  parents see there.

### D140. Daily Drills are timed challenges

The Done button is replaced by a timed challenge on every drill level. `design/` holds a
prototype made outside the project, used for layout and flow only; it is not committed
(`.gitignore`) and is left out of lint and format.

**Two modes, set per level** (`content.home.levels[n].challenge`: `mode`, `seconds`, `target`).

- _Timer._ Start shows 3, 2, 1 on the card with a beep each, then a 60-second countdown with
  large plus and minus to count reps; press and hold repeats. At zero a buzzer sounds and the
  card says "TIME!" for a phone on silent. Plus and minus keep working, so a score can be
  corrected or entered late. Record Score saves it. There is no typed entry.
- _Stopwatch_ (Cone Dribbling). Start, Pause and Resume, Stop, Reset, Record Score; counts up, to
  a hundredth of a second.
- Time is read from the clock on every tick, so it is right after the browser was in the
  background. The screen stays awake from Start until the score is recorded. An attempt lives
  only on the card: leaving the page abandons it.

**Scores.** Every recorded score is kept (`home_drill_attempts`); attempts are unlimited.
`record_drill_attempt` is the only way in. The first score of the day on a drill marks it Done
and counts toward the streak; any score counts, zero too.

- _Personal bests_ are per child, drill and level: most reps, least time (`home_drill_bests`).
  The child's confirmed parents and the team's coaches see them, as with the rest of at-home
  training; a coach sees them on the player's page.
- _A record_ is decided on the server and stored on the attempt: a score that beats the best. A
  tie is not a record, and neither is a first score, which has nothing to beat.
- _Results page._ `/training/result/<attempt>`: the score, the personal best, NEW RECORD, the
  level unlocked, Try Again and Back to Training. Being the attempt's own address, a reload
  shows the same thing.
- _Delete this score_ is on the results page for whoever recorded it, the same day
  (`delete_drill_attempt`). When it was the day's only score of the drill the Done goes too. A
  level it unlocked stays.

**Levels move up on a target.** "One Done moves up a level" (D138) is gone. A child's level on a
drill is stored (`home_drill_level_overrides`) and moves up when a score at that level meets its
target: at least so many reps, or at most so many seconds. Only a score at the child's current
level unlocks. Level 3 has no target. A parent can still set the level under More. The migration
worked out every child's level one last time under the old rule and stored it, so nobody moved.
The card always shows the child's current level, so after an unlock the next attempt is at the
new level.

**Wording.** Every level stands alone, drops its fixed count and says what one count is ("Count
every tap."). The parent's job on a timer level is "Tap + for every clean one."; what used to be
the parent's job is "Make it harder" under More (`harder`). Level 2 is a different challenge from
Level 1: looking up (Toe Taps, Inside-Inside), the weaker foot only (V-Cuts, L-Drags). The
targets are first estimates, to be tuned from real scores after two weeks of use.

**Cone Dribbling** is four cones about 3 yards apart, down and back, at every level, with a
diagram under More and on its Library page (`content.home.diagram`); targets 10.0 s and 8.0 s.
Times on the old five-cone course were copied into the attempts as `old_course`: they show in
the recent scores, labelled, and are never a personal best. `home_drill_times` is kept, unused
and no longer written; dropping it is left for later.

Not in this round: the prototype's photos (the picture slot stays empty), Skill Tests, any team
board or ranking. A drill level written without a challenge would still get a plain Done.

### D141. Each child works through the drills easiest first

The day's drill is no longer picked by the calendar for the whole team (D138). Each child has
their own line-up, easiest first: Toe Taps, Inside-Inside Touches, Sole Rolls, Wall Passing and
First Touch, First Touch and Passing With a Parent, Inside-Outside Touches, Cone Dribbling,
V-Cuts, L-Drags, Juggling; then round again.

- Today's drill is the one the child has gone longest without: a drill never done comes before
  any that was, in that order; after that, the one done longest ago. Nothing is stored; it is
  read from the child's Dones (`drillForChild`).
- So a brand-new child starts with Toe Taps, a missed day skips nothing, and a drill done early
  from "Do another" goes to the back of the line.
- Only Dones before today count, so the day's drill stays the same once it is done.
- Children on a team are no longer all on the same drill on the same day. The order of the "Do
  another" list and of the Library is unchanged.
- No database change.

### D142. Toe Taps, Inside-Inside Touches and Sole Rolls have a picture

The first drill pictures: one photo per drill, the same for its three levels
(`content.home.levels[n].image`). Toe Taps is `toe-taps/drill.webp` (1000×1250), Inside-Inside
Touches ("tic-tocs") is `inside-inside-touches/drill.webp` (1000×750), Sole Rolls is
`sole-rolls/drill.webp` (1000×1250); WebP, 110 to 150 kB each. A data-only migration sets them;
the files are made by `scripts/crop-practice-images.mjs` (a crop with a `width` is scaled
down), stay out of the repository like every other picture, and are dragged into the hosted
bucket by hand.

- _The card._ The picture slot takes the picture's shape, no taller than 4:3 and no wider than
  16:9, and the picture fills it anchored to the bottom: a taller picture loses its top, a wider
  one its sides, never the feet and the ball.
- _The Library page._ The drill's picture is shown whole, once, under the introduction (its own
  shape, kept between 3:4 and 16:9, also anchored to the bottom). Levels with different pictures
  would each show theirs, labelled with their levels.
- Until the file is in the bucket nothing shows, as before.
