# Setup

How to run, test and build Mini-Messi's locally. Supabase and deployment sections will be
filled in as those phases land (Phase 3 and Phase 8).

## Prerequisites

- Node 22 (CI uses 22; `node --version`)
- npm 10
- Git with `core.autocrlf` left at its default — `.gitattributes` normalizes to LF

## Install and run

```bash
npm ci
npm run dev          # http://localhost:5173
```

The dev server exposes two dev-only routes, compiled only into dev builds (or when
`VITE_DEV_ROUTES=true` is set for a preview build; never set that in a deploy):

- `/dev/components` — gallery of every design-system component with theme, sport-tint and
  tab-bar-position switches.
- `/dev/field` — every sport × size × formation × view rendered through the real field
  components, for side-by-side checks against `legacy/index.html` (open that file directly in a
  browser; it loads sample teams on first run).

`npm run dev` listens on the LAN, so the Network URL it prints opens on a phone on the same Wi-Fi.

## Scripts

| Script              | What it does                                               |
| ------------------- | ---------------------------------------------------------- |
| `npm run dev`       | Vite dev server with HMR                                   |
| `npm run build`     | Typecheck (`tsc -b`) then production build to `dist/`      |
| `npm run preview`   | Serve `dist/` locally                                      |
| `npm run lint`      | ESLint (typescript-eslint strict, react-hooks, jsx-a11y)   |
| `npm run format`    | Prettier write; `format:check` is what CI runs             |
| `npm run typecheck` | `tsc -b --noEmit`                                          |
| `npm test`          | Vitest unit tests (jsdom). `test:watch`, `test:coverage`   |
| `npm run e2e`       | Playwright smoke tests; starts the dev server on port 4173 |

Before the first `npm run e2e` install a browser: `npx playwright install chromium`.

## Environment variables

Copy `.env.example` to `.env.local` once Phase 3 adds the Supabase client.

| Variable                 | Where                       | Notes                                   |
| ------------------------ | --------------------------- | --------------------------------------- |
| `VITE_SUPABASE_URL`      | `.env.local`, repo variable | Project URL (Phase 3)                   |
| `VITE_SUPABASE_ANON_KEY` | `.env.local`, repo variable | Anon key only; never the service role   |
| `VITE_DEV_ROUTES`        | local only                  | `true` exposes `/dev/*` in a prod build |
| `BASE_PATH`              | CI (deploy)                 | Vite `base`, e.g. `/mini-messis-web/`   |

## Project layout

See `docs/BUILD-PROMPT.md` §6 for the target layout. Phase 1 fills in:

- `src/styles/` — `tokens.css` (design tokens ported from the legacy `:root`), `components.css`
  (legacy component CSS, same class names), `field.css`, `print.css`, `base.css` (Tailwind entry)
- `src/components/` — Tabbar, Sheet / FormSheet / ActionSheet, Toast, Stepper, Segmented, Switch,
  Row / Group / Section / Footer, Button / Toolbar, Tile, Badge / Pill / Tag / Scoreline, Page, Form
- `src/sports/` — pure sport rules: `definitions` (SPORTS), `formations`, `lineup` (remap, auto-fill,
  counts, balance), `field` (images + homography), `colors`, `jersey` (SVG). Unit-tested.
- `src/lineups/` — `FieldStage` (artwork + placed slots) and `Jersey` components
- `src/app/` — router, providers, TabLayout, placeholder pages
- `src/lib/` — `ui-store` (Zustand, device-local theme/view), `theme`, `haptics`, `cn`
- `src/dev/ComponentsPage.tsx` — the gallery

## PWA

`vite-plugin-pwa` generates the manifest and a Workbox service worker (auto-update). Icons are
in `public/` (`pwa-192.png`, `pwa-512.png`, `pwa-512-maskable.png`, `apple-touch-icon.png`),
generated from the legacy 180 px icon. Test installability with `npm run build && npm run preview`
and Lighthouse; the service worker is disabled in `npm run dev`.

## Deploy (Phase 8)

Target is GitHub Pages via GitHub Actions. The deploy job will build with
`BASE_PATH=/mini-messis-web/`, copy `index.html` to `404.html` for the SPA fallback, and read
the Supabase URL/anon key from repository variables. Nothing deploys yet.
