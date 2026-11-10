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
