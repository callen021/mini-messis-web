# Mini-Messi's — Production Rebuild Prompt for Claude Code

> **How to use:** create a new empty repo (e.g. `mini-messis-web`), copy the current single-file app into it as `legacy/index.html`, open Claude Code in the repo root, and paste everything below this line as the first message. Do **not** touch the existing `callen021/mini-messis-coach` repo — testers are on it.

---

## 0. Mission

Rebuild the single-file youth-sports lineup app in `legacy/index.html` (≈2.4 MB, mostly base64 field images; ≈750 lines of real code) as a production-quality, mobile-first web app with user accounts, teams, roles, and a shared database — without losing any behavior the current app has. Treat `legacy/index.html` as the **functional spec and design reference**: read it fully before writing code. Every feature listed in §4 must exist in the new app before you call a phase done.

Work in the phases in §8. After each phase, stop, summarize what was built and what's left, and wait for me to say "continue". Ask me before making any product decision not covered here; put technical decisions in `docs/DECISIONS.md` as you make them.

## 1. Hard constraints (non-negotiable)

- **Stack:** React 18 + TypeScript (strict) + Vite, Supabase (Postgres, Auth, Realtime, Row Level Security), Tailwind CSS v4 with the existing iOS-style design tokens from `legacy/index.html` ported as CSS variables, TanStack Query for server state, Zustand only for ephemeral UI state, React Router v7 (data router), `vite-plugin-pwa` for the installable PWA, Vitest + React Testing Library for unit tests, Playwright for smoke tests, ESLint + Prettier, GitHub Actions CI.
- **No backend server to run.** All authorization lives in Postgres RLS policies and a small number of Postgres functions (RPC) for multi-row operations. The front end is a static build, so it can be hosted on GitHub Pages, Cloudflare Pages, Vercel, or AWS Amplify Hosting interchangeably. Default deployment target: GitHub Pages via GitHub Actions (include the `404.html` SPA fallback), with the Supabase URL/anon key supplied as repository variables.
- **Schema as migrations.** Everything in `supabase/migrations/*.sql`, applied with the Supabase CLI. Never edit the schema from the dashboard. Generate TypeScript types from the schema (`supabase gen types`) and commit them.
- **Mobile first, iPhone feel.** The current app is used as an Add-to-Home-Screen PWA on phones during games. Keep: bottom tab bar, large iOS-style titles, action sheets, toast, safe-area insets, `user-scalable=no`, haptic tick on tab change, light/dark/auto theme, 3D-perspective and flat field views, printable lineup page. (`user-scalable=no` was replaced by `touch-action: manipulation`, which stops double-tap zoom without blocking pinch zoom — D46.) Every screen must work one-handed at 375 px wide and must also lay out sensibly on a tablet/desktop (max-width container, nothing stretched to absurd widths).
- **Offline tolerant, not offline-first.** A coach at a field with poor signal must be able to keep editing a live game: optimistic updates, queued mutations retried on reconnect, clear "unsaved changes" indicator. Last-write-wins is acceptable for v1; document it.
- **Sport rules stay in code, not in the database.** Formations, position codes, jersey art, field geometry/homography, period naming, and auto-fill are pure TypeScript modules under `src/sports/` with unit tests. The database stores only *which* formation name and *which* position codes were used.
- **Accessibility:** every control reachable and labeled (the legacy file already has `aria-label`s on selects and switches — keep that standard), focus management in sheets/dialogs, respects `prefers-reduced-motion`, color is never the only signal.
- **Security basics:** RLS on every table, no service-role key in the client, invite/join codes are unguessable (≥ 8 chars, base32, no ambiguous characters), rate-limit join attempts via a Postgres function, email verification required before a user can be approved onto a team.

## 2. Roles and permissions

Three roles, scoped **per team** (one user can be a coach on one team and a parent on another). The team creator is the `coach` and is also the team owner; there must always be at least one coach.

| Capability | Coach | Assistant coach | Parent |
|---|---|---|---|
| Create team | ❌ **platform admin only** (D48; the admin creates it and hands it over) | ❌ | ❌ |
| Delete team, change sport, rename team, transfer ownership | ✅ (owner only for delete/transfer; sport change is admin-only, D39) | ❌ | ❌ |
| Approve/remove members, change member roles, generate/rotate join code | ✅ | ❌ | ❌ |
| Team setup: players-on-field, goalkeeper on/off, number of periods, jersey colors | ✅ | ✅ | ❌ |
| Roster: add/edit/remove players, jersey numbers, mark player active/out for a game | ✅ | ✅ | ❌ |
| Lineups: assign jerseys, formation per period, Auto-fill / Redo, Clear, rotation grid edits | ✅ | ✅ | ❌ |
| Batting order edit, "batted" tap, New-game reset (baseball) | ✅ | ✅ | ❌ |
| Games: schedule (opponent, date, time, location, home/away), start, finish, delete, edit details | ✅ | ✅ | ❌ |
| Scoring log: add / edit / undo / delete score events (goals, baskets, runs) and baseball plate appearances, in live or finished games | ✅ | ✅ | ❌ |
| Coaching notes on a game | ✅ read/write | ✅ read/write | ❌ (not visible) |
| Skills tests: define/edit the team's test list, record/edit results for any player | ✅ | ✅ | ❌ |
| Skills results: view | ✅ all players | ✅ all players | ✅ **own linked children only** — never other kids, never a team ranking |
| Import legacy JSON backup into this team | ✅ | ❌ | ❌ |
| View field lineups for every period (template and live game) | ✅ | ✅ | ✅ |
| View full rotation table, playing-time totals and balance meter for all players | ✅ | ✅ | ✅ |
| View roster (names + numbers), game schedule, scores, live goal log with scorer/assist names, season and per-game stats leaderboard | ✅ | ✅ | ✅ |
| Print lineup sheet | ✅ | ✅ | ✅ |
| Own profile: display name, theme (light/dark/auto), field view (3D/flat), which team is default | ✅ | ✅ | ✅ |
| Link additional children on the same team | ✅ | ✅ | ✅ (pending coach approval) |

Parents are **read-only on everything team-related**; their only writes are to their own profile/preferences and to join/link requests. Parents see *all* kids' positions and playing time, not just their own child — the only parent-specific touch is that their own child's jersey/row is highlighted and shown first in the stats list.

Realtime: when a coach changes a live game's lineup or score, every signed-in viewer of that team sees it within a couple of seconds (Supabase Realtime on `games`, `score_events`, `plate_appearances`, `lineup_slots`).

## 3. Onboarding and membership flows

1. **Sign up / sign in:** email + password via Supabase Auth, plus magic-link as an alternative. Email verification required. "Forgot password" flow. Session persists (PWA relaunch should not require re-login). (Raw Supabase Auth errors are mapped to plain messages with a follow-up button, e.g. no account → Create an account with the email carried across — D47.)
2. **First run (no teams):** "Ask your coach for an invite link" plus a box to paste a code; only a platform admin sees "Create a team" (D48).
3. **Create team:** name, sport (soccer, baseball, basketball, lacrosse — football exists in code but is disabled, exactly as `ENABLED_SPORTS` does today), defaults applied from the sport definition. Team gets a join code and a current season. (Platform admin only — D48. The admin becomes owner and coach, then adds the real coach by email from the admin console and transfers ownership.)
4. **Join by code:** user enters the code → sees the team name and sport → chooses role requested (`parent` or `assistant`) → if parent, picks one or more children from the roster (first names + numbers; if the child isn't listed, a free-text "my child's name" field is stored on the request) → request goes to `pending`. User sees "Waiting for the coach to approve" and nothing else about the team.
5. **Approval:** coach's Team → Members screen lists pending requests with the requested role and child links; coach can approve as requested, change the role, change the child link, or decline. Approved parents get access immediately (Realtime or poll on the pending screen).
6. **Member management:** coach can remove a member, change role, rotate the join code (old code stops working), and promote an assistant to coach. Owner can transfer ownership.
7. **Switching teams:** a user with multiple memberships gets a team switcher in the top bar; the last-used team is remembered per user.

## 4. Feature inventory to port (from `legacy/index.html`)

Read the legacy code for exact behavior; this is the checklist.

**Sports engine (`src/sports/`)**
- Sport definitions: name, emoji, field label (Field/Diamond/Court), allowed side sizes, default size, has goalkeeper, default periods and allowed period counts, period naming (Quarter/Half/Inning), unit text, position groups with display names and default colors, default formation, `group(role)` and `label(role)` mappings, jersey style, sample roster.
- Formation generators: `soccerFormations(size, gk)` with `SOCCER_SHAPES` and `SOCCER_CODES` (position codes like LCB/RCM/LW…), `BASEBALL_FORMS` (6–12 fielders incl. rover variants), `BASKETBALL_FORMS` (3–5), `FOOTBALL_FORMS` (kept, disabled), `lacrosseFormations(size, gk)` with `LAX_SHAPES`/`LAX_CODES`. Positions are `{role, code, x, y}` in field-percent coordinates plus a jersey width `w`.
- `remap(period, newFormation)`: same role first, then any open spot; clears auto flags. `fixPeriods`/`tidy` consistency pass. Keep the exact rules.
- Auto-fill (`autoFill`, `autoFillAll`, redo): fewest periods played first, then fewest turns in that position group, then random tie-break; goalie slots filled first; hand-picked slots never touched; auto-picked slots flagged so "Redo" only reshuffles those. Counts are within the current game/plan only.
- Playing-time counts, range/average, low/good/warn thresholds. **Framing:** this is a visibility tool so the coach can see who has played what — it is not a fairness enforcer. Do not block, warn modally, or auto-correct lineups; the balance meter and its hint text are informational only. Use the words "playing time" in the UI, never "fairness".
- Field rendering: perspective homography `proj()`/`place()`/`fieldFrac()` with the per-sport `H` matrix, plus flat view; standing goal/hoop/goalpost SVG overlays; jersey SVG generator (soccer/baseball/basketball/football styles, contrast text color, `shade()`). Move the eight base64 WebP field images in `FIELDS` out to `public/fields/<sport>-<persp|flat>.webp` and load them as files; keep `w`, `h`, `H` metadata in a typed TS module.

**Field screen (team template and live game)**
- One card per period: period title (Q1/H1/Inning 1), formation select, "N open / Full" pill, jerseys placed on the field with name, number, position code, auto-fill dot; tapping a jersey opens a player picker (native `<select>` today — replace with a bottom-sheet picker that shows bench first, then "move from X" for players already on the field; keep the swap/move semantics and toasts). Bench strip: "Sitting out · n", out-for-this-game players, per-card Auto-fill / Redo button. Toolbar: Auto-fill (all periods), Clear, Print. Soccer/lacrosse: live score button per card that opens the goal panel; subtitle shows "Live vs Opponent · US x – y THEM".
- Editable team name in the large title.

**Team screen** — segmented Rotation | Roster.
- Rotation grid: one row per active player with active/out switch, name+number, one chip per period showing the position code (colored by group, dotted corner if auto) that opens a position picker including "* Sitting out" and "code · occupant" for taken spots (swap semantics), total column, "Out this game" list, balance meter, Auto-fill open spots.
- Roster: jersey number, name, active/out switch, remove (with confirmation that explains lineup/history effects), "Everyone's back", Add player. Removing a player keeps their name on past games (snapshot).

**Lineup / Edit order (baseball only)**
- Locked batting order with LAST / UP NEXT tags, tap-when-batted advancing `lastBat`, "New game" reset, dot for in-the-field-first-inning; separate Edit-order screen with up/down arrows and "Roster order". Players marked out are skipped.

**Games — for every sport (today only soccer/lacrosse have it; extend to basketball and baseball)**
- The tab is called **Schedule** (calendar icon, routes stay `/games` and `/games/:id`): a "+" button in the page header (coach/assistant/admin only) opens an action sheet with "New game" and "New practice"; segments **All | Games | Practices** show upcoming items only (All is the default and merges by date; the live-game card with Add score / Finish is pinned on top in every segment). New game sheet with "Start game now" / "Save for later". Only one live game at a time. Completed games and the season tiles live under Stats → Season (see Stats).
- Game detail: header with status and big score; Start / Add score / Finish; editable opponent, date, time, location, home/away; scoring log with edit sheet and "Undo last"; lineups per period as code/name lists; coaching notes; delete game with double confirmation for completed games.
- Semantics to keep: starting a game copies the team's template lineup into the game; finishing writes the final game lineup back as the next template; completed games are never altered by later roster/setting changes; player names/numbers are snapshotted on the game; double-tap suppression on score buttons.
- **Scoring is an editable event log, and the score is always the sum of the log** — exactly how the legacy app works for soccer today (score button on each Field card, Add goal on the Games page, editable goal list), extended to every sport. The coach must be able to fix anything after the fact: add a score they missed (to any period, in a live *or* finished game), change the period/scorer/assist/points on an existing event, delete an event that was waved off or reversed, and undo the last one with a single tap. Every event records who created it and when, so edits after the game are traceable.
- **Per-sport scoring (defined in `src/sports/`, stored in `score_events`):**
  - **Our side always records the player.** Every event for `us` has a scorer picker (defaults to the last scorer for speed) with an "Unknown / not recorded" option, exactly as the legacy soccer goal panel does, so the coach can post the score first and fix the name later from the log. Events for `them` never have a player — we don't hold the opponent's roster — just the period and points.
  - Soccer / lacrosse: `goal` = 1 point, scorer and optional assist.
  - Basketball: `free_throw` = 1, `field_goal` = 2, `three_pointer` = 3. The score panel is three big buttons per side (+1 / +2 / +3); tapping one for `us` opens the scorer picker.
  - Baseball: `run` = 1, with the player who crossed the plate and the inning; opponent runs per inning. The game detail shows a line score (runs per inning per side). Runs are *separate* from the batting log below — a home run is one plate-appearance event (against the batter) and one or more run events (against each runner who scored); keep them independent so a missed one can be fixed without touching the other.
- **Baseball batting log (`plate_appearances`):** during a game the coach taps the batter (the Lineup screen's "batted" tap already identifies them) and picks the result: single, double, triple, home run, walk, hit by pitch, strikeout, other out, sacrifice, fielder's choice, reached on error; optional RBI count. Editable/deletable like score events. Keep the tap-when-batted flow as fast as it is today — result entry must be optional (a plain "batted" with no result is still allowed) so a coach who's busy isn't forced to log stats.
- **New for this build (coach asked):** full schedule fields — date, start time, location/field name, home/away, optional notes visible to parents (e.g. "wear white"), and an "Upcoming" section parents can read at a glance. Optional: add-to-calendar (.ics) link per game.
- **Practices (added after Phase 7):** a `practices` table (date, start, optional end, location, note for parents, status scheduled|cancelled) with the same access as games. On the Schedule tab practices are merged with games by date and time, visually quieter with a "Practice" label; cancelled ones stay listed in All and Practices, struck through with "Cancelled". Past practices drop off the schedule (nothing is shown for them). Coaches add a single practice or a weekly repeat (weekday, time, first and last date, a checkbox per generated date to skip holidays), edit any field, and cancel/restore. Nothing hard-deletes a practice a parent may have seen (only a platform admin can delete a row). Each practice has an add-to-calendar (.ics) link. Parents are read-only.

**Stats** — segmented Current game | Season, derived only from saved games, `score_events` and `plate_appearances`; removed players stay in history flagged as removed; scoped by season. Team tiles: played, W-L-T, scored, allowed, diff. On Season, a **Results** section sits between the team tiles and the player table: completed games newest first (opponent, date, score, W/L/D badge; tap opens the game detail), the three most recent with a "See all results" row when there are more. Per-player columns depend on the sport (define the column set in the sport definition):
- Soccer / lacrosse: G, A, periods played.
- Basketball: PTS, FG, 3PT, FT, periods played.
- Baseball: R, AB, H, 2B, 3B, HR, RBI, BB, K, AVG (H/AB, AB excludes walks, HBP and sacrifices), innings in the field.

**Player profile & skills assessments (new) — a click-through prototype of these screens exists; ask me for it before building this phase**
- Tapping a player's name on the Roster or on any Stats table opens a player page: jersey number and name, four season stat tiles (sport-specific), linked guardians (coach/assistant view only), and a **Skills** section. No playing-time block on this page; that lives on the Team → Rotation view.
- Skills also appear as a **third segment on the Stats tab: Current game | Season | Skills.** The Skills segment is a horizontally scrollable table, players down the side (sticky first column), shown tests across the top, each cell the player's personal best, with a small ↑/↓ arrow when the latest result beat or missed the previous one. For a parent the table contains only their linked children. Tapping a name opens the player page.
- Per-test trend lines (sparklines) live on the player page, not in the table.
- Skills are a list of tests managed from **Settings → Skills tests** (coach and assistant). Each team starts with a default set loaded from the sport definition when the team is created. Soccer defaults — use this wording in the UI:

  | Test | How to run it | Metric |
  |---|---|---|
  | Tick-tocks | Count alternating inside-foot touches in a small marked box. Stop when the ball leaves the box or the player loses the rhythm. | Longest streak (count, higher is better), e.g. 20 |
  | Juggling | Start with a hand drop. Count consecutive foot touches before the ball hits the ground. | Best streak (count, higher), e.g. 5 |
  | Dribbling with control | Weave through four cones on the same course each time. Time the run and record the fastest attempt that goes around every cone. | Best clean time (seconds, lower is better), e.g. 12.4 |
  | Passing accuracy | From 5 yards, pass a stationary ball through a 1-yard cone gate. Five tries with each foot. | Made/attempted per side, e.g. 4/5 right, 2/5 left |
  | Shooting accuracy | Five shots from 7 yards at the same goal without a keeper. Count shots that go in. | Made/attempted, e.g. 3/5 |
  | Kick distance | Kick a stationary ball down a marked lane. Measure to where it first lands, using the same size ball each time. | Best of three (yards, higher), e.g. 25 |
  | Sprint speed | Run 20 yards from a standing start. Two tries, same start signal and timing method each session. | Best time (seconds, lower), e.g. 4.6 |

  Provide sensible default sets for baseball, basketball and lacrosse too (e.g. throwing accuracy, sprint, free throws made of 10, wall-ball catches) and flag them as drafts for me to review. Every sport's set includes its own sprint-speed test. Teams created before the default sets existed are backfilled by a migration, and Restore defaults seeds a team that has no tests at all.
- Metric types: `count`, `time_seconds`, `distance` (unit on the test: yd/ft/m), `made_of_attempted` (optionally per side left/right). Each test states whether higher or lower is better so "personal best" can be computed.
- Recording a result: from the player page or the test's history page, pick a test, date (defaults to today), value(s), optional note. Results are append-only history; a result can be edited or deleted by whoever recorded it or any coach/assistant. Each test's page shows Best / Latest / Sessions tiles, the how-to text, and the full history newest first with a PB tag.
- **Settings → Skills tests** (coach and assistant): a Settings row "Skills tests · 7 shown · 1 hidden" opens a page with the shown tests (switch, name + metric summary, reorder arrows; order here is the order everywhere) and a Hidden section below. Tapping a test opens an edit sheet (name, how-to, metric, higher/lower, unit, attempts, left/right). Actions at the bottom: Add a custom test (the only way to add something new) and Restore defaults (re-add or un-hide any built-in; the only way to get built-ins back). There is no cross-sport library: a soccer coach never sees baseball drills. Shared athletic tests (sprint speed) are part of every sport's own default set under the same key. Rules: a test with results can be hidden but **never deleted** (history is kept); a test with no results can be deleted; once a test has results its metric type, higher/lower rule, unit, attempts and sides are **locked** (name and instructions stay editable). Hiding a test removes it from player pages and the Stats table but keeps its history.
- Results belong to the player row, so they carry across seasons on that team.

**Settings** (per team for coaches; per user for everyone)
- Team: sport picker rows with player/size/period summary; team name; players-on-field stepper; goalkeeper switch; periods stepper; formations read-out with the "read defense → attack" hint; jersey colors per position group with color input.
- User: theme Light/Dark/Auto; field view 3D/Top-down; install instructions.
- Data: export team backup (JSON), **import legacy backup** (map the `mini-messis-coach-v5` shape — teams per sport, players, periods, order, games, goals — into the new tables for the current team; keep the old `normalize()` validation rules), "Load example team" (coach only, dev/demo), delete team (owner, double confirm).

**Cross-cutting**
- Toasts, action sheets, form sheets, steppers, segmented controls, switches, print stylesheet.
- Dirty-page rendering optimization in the legacy file is replaced by React + Query caching; preserve scroll position on data refresh in long lists.

## 5. Data model (Postgres / Supabase)

Use `uuid` primary keys (`gen_random_uuid()`), `timestamptz` `created_at`/`updated_at` with a trigger, `citext` for emails where relevant, and enums as Postgres types. Soft-delete via `archived_at` where noted. Add `updated_by uuid references auth.users` on coach-editable tables for a light audit trail.

```
profiles            id (= auth.users.id) PK, display_name, theme ('light'|'dark'|'auto') default 'auto',
                    field_view ('persp'|'flat') default 'persp', last_team_id, created_at, updated_at

teams               id PK, name, sport (enum: soccer|baseball|basketball|lacrosse|football), owner_id → auth.users,
                    join_code (unique, rotatable), join_code_rotated_at,
                    side_size int, has_gk bool, periods_count int, colors jsonb ({group: '#hex'}),
                    last_batter_player_id → players (nullable, baseball),
                    archived_at, created_at, updated_at, updated_by

seasons             id PK, team_id → teams, name, starts_on date, ends_on date, is_current bool,
                    created_at — exactly one is_current per team (partial unique index)

team_members        id PK, team_id → teams, user_id → auth.users, role (enum: coach|assistant|parent),
                    status (enum: pending|active|removed), requested_role, note (free text on request),
                    approved_by, approved_at, created_at, updated_at — unique (team_id, user_id)

players             id PK, team_id → teams, first_name, last_name (nullable), jersey_number text(3),
                    is_available bool default true (the "active/out this game" switch),
                    batting_order int, sort_order int, archived_at, created_at, updated_at, updated_by

player_guardians    id PK, player_id → players, user_id → auth.users, relationship text,
                    status (pending|approved), unlisted_child_name (if the child wasn't on the roster),
                    approved_by, approved_at, created_at — unique (player_id, user_id)

games               id PK, team_id → teams, season_id → seasons, opponent, game_date date, start_time time (nullable),
                    location text, home_away (enum: home|away|neutral, nullable), parent_notes text,
                    status (enum: upcoming|live|done), team_name_snapshot,
                    started_at, finished_at, created_at, updated_at, updated_by

game_coach_notes    game_id → games PK, notes text, updated_at, updated_by — coach/assistant only (see RLS)

practices           id PK, team_id → teams, season_id → seasons, practice_date date, start_time time (nullable),
                    end_time time (nullable, after start), location text, notes text (parents see it),
                    status (enum: scheduled|cancelled), created_at, created_by, updated_at, updated_by
                    — never hard-deleted by coaches: cancel instead

game_players        game_id → games, player_id → players, name_snapshot, number_snapshot, available bool
                    — PK (game_id, player_id); written on start and on finish

lineups             id PK, team_id → teams, game_id → games (NULL = the team's template plan),
                    period_index int, formation_name text, created_at, updated_at
                    — unique (team_id, game_id, period_index) with game_id NULLS NOT DISTINCT

lineup_slots        lineup_id → lineups, slot_index int, position_role text, position_code text,
                    player_id → players (nullable), auto_picked bool default false
                    — PK (lineup_id, slot_index); a player appears at most once per lineup (unique partial index)

score_events        id PK, game_id → games, side (enum: us|them), period_index int,
                    event_type text (sport-defined: goal | free_throw | field_goal | three_pointer | run),
                    points smallint (denormalized from event_type at insert; validated by a check/trigger per sport),
                    scorer_player_id → players (nullable), assist_player_id → players (nullable),
                    occurred_at timestamptz, created_by, created_at, updated_at, updated_by

plate_appearances   id PK, game_id → games, player_id → players, inning int, sequence int,
                    result (enum: none|single|double|triple|home_run|walk|hit_by_pitch|strikeout|out|
                            sacrifice|fielders_choice|reached_on_error), rbi smallint default 0,
                    occurred_at, created_by, created_at, updated_at, updated_by — baseball only

skill_tests         id PK, team_id → teams, key text (stable slug; defaults use the sport definition's key),
                    name, instructions text, metric (enum: count|time_seconds|distance|made_of_attempted),
                    unit text (nullable: yd|ft|m), has_sides bool (left/right), higher_is_better bool,
                    sort_order int, is_active bool, created_at, updated_at, updated_by
                    — unique (team_id, key); defaults inserted by `create_team` from the sport's list

skill_results       id PK, player_id → players, skill_test_id → skill_tests, tested_on date,
                    value numeric (count / seconds / distance / made), attempts numeric (nullable, for made_of_attempted),
                    side (enum: left|right, nullable), note text, recorded_by, created_at, updated_at, updated_by

join_attempts       id, user_id, code_tried, attempted_at — for rate limiting (5 per 10 min per user)
```

Views / functions (SQL, security definer only where a multi-row atomic operation needs it):
- `game_scores` view: per game `us`, `them` as `sum(points)` from `score_events`; `game_line_score` view: points per side per period (baseball line score, basketball by quarter).
- `player_season_stats(team_id, season_id)` function: returns the sport-appropriate columns per player (goals/assists, basketball points by type, baseball batting line and runs) plus periods played, including removed players present in history.
- `start_game(game_id)`: copies the template lineups + slots into game-scoped lineups, snapshots `game_players`, sets status/started_at; refuses if another game is live for the team.
- `finish_game(game_id)`: snapshots, sets `done`, copies the game's final lineups back to the template.
- `create_team(name, sport)`: inserts team, owner membership (`coach`, `active`), current season, default template lineups, join code.
- `request_join(code, requested_role, player_ids[], unlisted_child_name)`: validates the code, rate-limits, creates the pending membership and guardian links.
- `approve_member(member_id, role, player_ids[])`, `rotate_join_code(team_id)`, `transfer_ownership(team_id, user_id)`.
- `import_legacy_backup(team_id, jsonb)`: validates and loads one sport's data from the old backup format into the team.

RLS, in words (write the policies, then tests for them):
- `profiles`: a user reads/writes only their own row.
- `teams`, `seasons`, `players`, `games`, `practices`, `game_players`, `lineups`, `lineup_slots`, `score_events`, `plate_appearances`: **read** if the user has an `active` membership on the team; **write** if that membership's role is `coach` or `assistant`; team delete/`owner_id` change only by the owner. `coach_notes` must not be readable by parents — put it in a separate `game_coach_notes` table (game_id PK, notes) with coach/assistant-only read, rather than relying on column-level tricks.
- `team_members`: a user reads their own rows; coaches read all rows for their teams; only coaches update/delete; inserts only via `request_join`/`create_team`.
- `player_guardians`: user reads own; coaches read/approve for their team.
- `skill_tests`: read by any active member; write by coach/assistant.
- `skill_results`: coach/assistant read and write for their team's players; a parent reads a row only when an **approved** `player_guardians` link exists between them and that `player_id`. No aggregate/leaderboard view may be exposed to parents.
- A team must keep ≥ 1 active coach (trigger).

## 6. Application structure

```
src/
  app/            router, providers (Supabase client, QueryClient, theme), layouts (TabLayout, AuthLayout)
  auth/           sign-in, sign-up, verify, reset, session hook, ProtectedRoute, RoleGate
  teams/          create, join, members (approve/manage), switcher, settings
  roster/         roster screen + hooks
  lineups/        Field screen, period card, jersey, player picker sheet, rotation grid, auto-fill actions
  games/          Schedule tab (All | Games | Practices), game detail, new-game sheet, goal panel, schedule fields, ics,
                  practices (hooks, weekly recurrence, new-practice sheet, practice detail)
  stats/          stats screen + hooks
  players/        player profile page, skills test list editor, result entry sheet, history
  batting/        lineup + edit-order screens (baseball)
  sports/         pure TS: definitions, formations, autofill, remap, counts, field geometry, jersey svg (unit-tested)
  components/     design system: Sheet, Toast, Stepper, Segmented, Switch, Row/Group/Section, Tile, Badge, Tabbar
  lib/            supabase client, generated types, query keys, mutation queue (offline), formatters (dates), ids
  styles/         tokens.css (ported from legacy :root / [data-theme=dark]), print.css
supabase/
  migrations/     one file per change, idempotent where practical
  seed.sql        a demo coach, the Strikers (soccer, 7v7 with GK, 4 quarters), a sample parent, a finished game
  tests/          pgTAP or SQL-based RLS tests run in CI against a local Supabase
docs/
  DECISIONS.md, SETUP.md (local Supabase, env vars, deploy), DATA-MODEL.md (ERD as Mermaid)
legacy/index.html
```

Routes (all under the tab layout once a team is selected): `/field`, `/team` (rotation|roster), `/games` (the Schedule tab; segments: all | games | practices), `/games/:id`, `/practices/:id`, `/stats` (segments: game | season | skills), `/players/:id`, `/players/:id/skills/:testId`, `/settings/skills`, `/lineup` and `/lineup/edit` (baseball), `/settings`, `/settings/members`, `/settings/team`, `/profile`; plus `/signin`, `/signup`, `/verify`, `/reset`, `/welcome`, `/join`, `/create-team`, `/pending`. Tabs per sport: soccer/lacrosse/basketball: Field, Team, Schedule, Stats; baseball: Field, Lineup, Team, Schedule, Stats (the Lineup tab is where in-game batting happens; Settings stays behind the gear button). The legacy `TABS` map only showed Games/Stats for soccer and lacrosse — every sport gets them now.

Parents get the same tabs but every edit control is hidden (not merely disabled) and the pages render the read-only variant; the Field page jersey tap does nothing for a parent except highlight the player.

## 7. Quality bar

- TypeScript strict, no `any` outside generated types. ESLint (typescript-eslint, react-hooks, jsx-a11y) clean.
- Unit tests for: every formation generator (sizes × gk produce the right slot counts and unique codes), `remap`, `autoFill` fewest-played ordering and "never touch hand picks", counts/balance thresholds, legacy backup normalization/import mapping, date formatting. Target ≥ 90 % coverage on `src/sports/` and `src/lib/`.
- RLS tests: a parent cannot write to any team table, read `game_coach_notes`, or read `skill_results` for a child they aren't an approved guardian of; a member of team A cannot read team B; pending members read nothing; owner-only operations enforced.
- Playwright smoke: sign up → create team → add 8 players → auto-fill → schedule game → start → add goal → finish → stats show it; second browser as parent joins by code → pending → approved → sees live score update.
- Lighthouse on a mid-tier Android profile: PWA installable, performance ≥ 85, accessibility ≥ 95. Initial JS bundle (gzipped) under 250 kB; field images lazy-loaded per sport.
- CI (GitHub Actions): lint, typecheck, unit tests, build, migration check against a local Supabase, Playwright on PRs; deploy on `main`.
- Conventional commits; small PR-sized commits per phase.

## 8. Phases (stop after each and report)

1. **Scaffold & design system** — Vite/TS/Tailwind/PWA, tokens ported, component library rebuilt from the legacy CSS (Tabbar, Sheet, Toast, Stepper, Segmented, Switch, Row/Group/Section), Storybook-free demo route `/dev/components` (dev only). `docs/SETUP.md`.
2. **Sports engine** — port `src/sports/` with unit tests; a dev-only `/dev/field` page that renders every sport × formation × view to visually check against the legacy app side by side.
3. **Database & auth** — migrations for §5, RLS, functions, generated types, seed, RLS tests; auth screens; create-team / join / pending / approve flows; team switcher.
4. **Roster, Field, Team (rotation)** — full coach editing with optimistic updates; parent read-only variants; Realtime subscriptions.
5. **Games, scoring log (all sports), baseball batting log, schedule, stats, batting order** — including `start_game`/`finish_game` semantics, basketball +1/+2/+3 panel, baseball line score and plate-appearance entry, schedule fields, ics export, sport-specific stats per season.
6. **Player profiles & skills assessments** — player page, default test sets, team test editor, result entry and history, guardian-scoped parent view with RLS tests proving a parent cannot read another child's results.
7. **Settings, profile, backup import/export, print** — legacy JSON import for my existing Strikers data; export.
8. **Hardening** — offline mutation queue, error boundaries, empty states, loading skeletons, Lighthouse pass, Playwright suite, CI deploy to GitHub Pages, `docs/DATA-MODEL.md` ERD.

## 9. Assumptions I've made — correct me if wrong

- A player belongs to exactly one team; the same child on two teams is two player rows (guardians can link to both). Skills results and stats therefore stay with the team, not the child — acceptable for v1. If that ever needs to change, introduce a `people` table that player rows point to; don't pre-build it now.
- RLS tests: a parent cannot write to any team table, cannot read `game_coach_notes`, and cannot read `skill_results` for a player they are not an approved guardian of.
- Playing-time counts and Auto-fill look at the current game only (as today), not across the season. The rotation view is informational — it never enforces anything.
- Only one live game per team at a time (as today).
- Seasons are simple date ranges used to scope stats and the games list; the coach can "start a new season" which archives nothing, just changes `is_current`.
- Parents can request to link more than one child; approval is per link.
- Parents never receive notifications in v1 (no email/push on lineup changes) — Realtime while the app is open only.
- Football stays built but disabled, exactly as the legacy `ENABLED_SPORTS` list.
- Scores are always the sum of the scoring log, and the log is fully editable after the fact (add a missed score to any period, change it, delete a reversed one).
- Our players are recorded on every scoring event in every sport (with "Unknown" allowed, as today). Opponent events carry no player because we don't hold their roster; opponent stats are never tracked beyond the score.
- Baseball batting results are optional per at-bat; the fast "batted" tap still works with no result. Pitching stats are out of scope for v1.
- Baseball game length uses the team's innings setting; extra innings are added to a live game with a "+ inning" button on the game detail (template is unaffected).
