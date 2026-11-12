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
stands at zero (`clock_set_lineup`), never mid-period. Staff get Start / Pause / Resume, End H1,
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
