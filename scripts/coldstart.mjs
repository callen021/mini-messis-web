// Cold-start profile (D89): how long the installed app takes to show useful content, as a coach and
// as a parent, on a throttled phone profile (4x CPU, slow 4G: 150 ms RTT, 1.6 Mb/s down), and where
// the time goes (app shell, session restore, each query, the field image).
//
// Usage: node scripts/coldstart.mjs            (needs `npx supabase start` + the seed)
//        SKIP_BUILD=1 node scripts/coldstart.mjs      CPU=1 RUNS=1 node scripts/coldstart.mjs (no CPU throttle)
// Builds a production bundle against the local Supabase, serves it with `vite preview`, signs in
// through the UI as the seeded coach and parent, then for each role measures a FIRST launch (fresh
// profile with the session only) and a REPEAT launch (same profile: service worker and caches warm,
// the persisted query cache present). Prints a table per launch and a summary; writes
// perf/coldstart.json.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const PORT = 4175;
const URL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.VITE_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const ROLES = [
  {
    role: 'coach',
    email: 'coach@example.com',
    password: 'password123',
    ready: '.qcard .slot .shirt',
    landing: /\/field$/,
  },
  { role: 'parent', email: 'parent@example.com', password: 'password123', ready: 'h1', landing: /\/home$/ },
];
const RUNS = Number(process.env.RUNS ?? 3);
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const env = { ...process.env, VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: ANON, BASE_PATH: '/' };

if (!process.env.SKIP_BUILD) {
  const r = spawnSync(npx, ['vite', 'build', '--outDir', 'dist-perf'], {
    stdio: 'inherit',
    shell: true,
    env,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const server = spawn(
  npx,
  ['vite', 'preview', '--outDir', 'dist-perf', '--port', String(PORT), '--strictPort'],
  {
    env,
    stdio: 'ignore',
    shell: true,
  },
);
const base = `http://localhost:${PORT}`;
const wait = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error('preview server did not start');
};

/** Group a resource URL for the table. */
function label(url) {
  const u = new globalThis.URL(url);
  if (u.pathname.endsWith('.js')) return 'app js';
  if (u.pathname.endsWith('.css')) return 'app css';
  if (u.pathname.includes('/fields/')) return 'field image';
  if (u.pathname.includes('/auth/v1/token')) return 'session refresh';
  if (u.pathname.includes('/auth/v1/user')) return 'auth user';
  if (u.pathname.includes('/rest/v1/rpc/')) return `rpc ${u.pathname.split('/rpc/')[1]}`;
  if (u.pathname.includes('/rest/v1/')) return `query ${u.pathname.split('/rest/v1/')[1]}`;
  if (u.pathname.includes('/realtime/')) return 'realtime';
  if (u.pathname.endsWith('.webmanifest') || u.pathname.includes('manifest')) return 'manifest';
  if (u.pathname.endsWith('.png') || u.pathname.endsWith('.svg')) return 'icon';
  if (u.pathname.includes('sw.js') || u.pathname.includes('workbox')) return 'service worker';
  return u.pathname;
}

async function throttle(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU ?? 4) });
  return cdp;
}

/** One launch: navigate, wait for the shell and the content, collect timings. */
async function launch(page, r, kind) {
  await page.goto('about:blank');
  const t0 = Date.now();
  await page.goto(`${base}/`, { waitUntil: 'commit' });
  const tShell = page
    .locator('.tabbar')
    .waitFor({ state: 'visible', timeout: 60_000 })
    .then(() => Date.now() - t0);
  const tContent = page
    .locator(r.ready)
    .first()
    .waitFor({ state: 'visible', timeout: 60_000 })
    .then(() => Date.now() - t0);
  const shellMs = await tShell;
  const contentMs = await tContent;
  await page.waitForURL(r.landing, { timeout: 60_000 });
  await page.waitForTimeout(1500); // let the stragglers (realtime, refetches) land
  const perf = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const paints = Object.fromEntries(
      performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)]),
    );
    const res = performance.getEntriesByType('resource').map((e) => ({
      url: e.name,
      start: Math.round(e.startTime),
      end: Math.round(e.responseEnd),
      size: e.transferSize,
      // same-origin only: a cross-origin resource reports no size, so its origin is unknown
      from: new URL(e.name).origin !== location.origin ? 'net' : e.transferSize === 0 ? 'cache' : 'network',
    }));
    return {
      domContentLoaded: Math.round(nav?.domContentLoadedEventEnd ?? 0),
      fcp: paints['first-contentful-paint'] ?? null,
      resources: res,
    };
  });
  const rows = perf.resources
    .map((x) => ({ what: label(x.url), ...x }))
    .filter((x) => x.what !== 'manifest' && x.what !== 'icon')
    .sort((a, b) => a.start - b.start);
  return { role: r.role, kind, shellMs, contentMs, fcp: perf.fcp, rows };
}

function print(result) {
  console.log(
    `\n== ${result.role} · ${result.kind} launch ==  shell ${result.shellMs} ms · content ${result.contentMs} ms · FCP ${result.fcp ?? '?'} ms`,
  );
  console.log('start  end    ms    from     what');
  for (const r of result.rows) {
    console.log(
      `${String(r.start).padStart(5)} ${String(r.end).padStart(5)} ${String(r.end - r.start).padStart(5)}  ${r.from.padEnd(8)} ${r.what}`,
    );
  }
}

try {
  await wait();
  const browser = await chromium.launch();
  const results = [];
  for (const r of ROLES) {
    // sign in once through the UI to get a session, then measure from fresh profiles that carry only that session
    const setup = await browser.newContext({
      baseURL: base,
      viewport: { width: 393, height: 851 },
      isMobile: true,
      hasTouch: true,
    });
    const sp = await setup.newPage();
    await sp.goto('/signin');
    await sp.getByLabel('Email').fill(r.email);
    await sp.getByLabel('Password').fill(r.password);
    await sp.getByRole('button', { name: 'Sign in' }).click();
    await sp.waitForURL(r.landing, { timeout: 30_000 });
    const session = await sp.evaluate(() => localStorage.getItem('mm-auth'));
    await setup.close();

    for (let run = 0; run < RUNS; run++) {
      const ctx = await browser.newContext({
        baseURL: base,
        viewport: { width: 393, height: 851 },
        isMobile: true,
        hasTouch: true,
      });
      await ctx.addInitScript((s) => {
        if (!localStorage.getItem('mm-auth')) localStorage.setItem('mm-auth', s);
      }, session);
      const page = await ctx.newPage();
      await throttle(page);
      const first = await launch(page, r, 'first');
      // the service worker installs on the first visit; a repeat launch is a new page in the same profile
      await page.waitForTimeout(2500);
      const page2 = await ctx.newPage();
      await throttle(page2);
      const repeat = await launch(page2, r, 'repeat');
      if (run === 0) {
        print(first);
        print(repeat);
      }
      results.push(first, repeat);
      await ctx.close();
    }
  }
  await browser.close();
  const med = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  console.log(`\n== summary (median of ${RUNS}) ==`);
  const summary = {};
  for (const r of ROLES)
    for (const kind of ['first', 'repeat']) {
      const xs = results.filter((x) => x.role === r.role && x.kind === kind);
      summary[`${r.role}.${kind}`] = {
        shellMs: med(xs.map((x) => x.shellMs)),
        contentMs: med(xs.map((x) => x.contentMs)),
      };
      console.log(
        `${r.role.padEnd(7)} ${kind.padEnd(7)} shell ${String(summary[`${r.role}.${kind}`].shellMs).padStart(5)} ms   content ${String(summary[`${r.role}.${kind}`].contentMs).padStart(5)} ms`,
      );
    }
  mkdirSync('perf', { recursive: true });
  writeFileSync(
    'perf/coldstart.json',
    JSON.stringify({ at: new Date().toISOString(), summary, results }, null, 2),
  );
  console.log('written perf/coldstart.json');
} finally {
  server.kill();
  if (process.platform === 'win32')
    spawnSync('taskkill', ['/pid', String(server.pid), '/f', '/t'], { stdio: 'ignore' });
}
