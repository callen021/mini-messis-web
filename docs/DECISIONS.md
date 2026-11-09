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
