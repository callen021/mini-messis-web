// Installability check (Lighthouse 12 dropped its PWA category): serves the Pages build with
// `vite preview`, opens it in Playwright's Chromium and verifies what Chrome's install prompt needs:
// a linked manifest with name, start_url, display standalone and 192/512 icons (one maskable), and
// a service worker that registers and controls the page after reload.
// Usage: node scripts/check-pwa.mjs   (run `BASE_PATH=/mini-messis-web/ vite build` first, or set SKIP_BUILD=0)
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const PORT = 4174;
const BASE = '/mini-messis-web/';
const origin = `http://localhost:${PORT}`;
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const shell = process.platform === 'win32';

if (process.env.SKIP_BUILD === '0') {
  const r = spawnSync(npx, ['vite', 'build'], {
    stdio: 'inherit',
    shell,
    env: { ...process.env, BASE_PATH: BASE },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const server = spawn(npx, ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  env: { ...process.env, BASE_PATH: BASE },
  stdio: 'ignore',
  shell,
});
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
};
const ok = (msg) => console.log(`✓ ${msg}`);

try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${origin}${BASE}signin`)).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${origin}${BASE}signin`, { waitUntil: 'load' });

  const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href');
  if (!manifestHref) fail('no <link rel="manifest">');
  else {
    const manifest = await (await fetch(new URL(manifestHref, `${origin}${BASE}`))).json();
    const icons = manifest.icons ?? [];
    const has = (size) => icons.some((i) => i.sizes === size && i.type === 'image/png');
    const maskable = icons.some((i) => (i.purpose ?? '').includes('maskable'));
    manifest.name && manifest.short_name
      ? ok(`manifest name "${manifest.name}"`)
      : fail('manifest name/short_name');
    manifest.display === 'standalone' ? ok('display standalone') : fail(`display ${manifest.display}`);
    manifest.start_url ? ok(`start_url ${manifest.start_url}`) : fail('start_url missing');
    has('192x192') && has('512x512') ? ok('192 and 512 PNG icons') : fail('icons 192/512 missing');
    maskable ? ok('maskable icon') : fail('no maskable icon');
    for (const i of icons) {
      const r = await fetch(new URL(i.src, `${origin}${BASE}`));
      r.ok ? ok(`icon ${i.src} ${r.status}`) : fail(`icon ${i.src} ${r.status}`);
    }
  }
  const themeColor = await page.getAttribute('meta[name="theme-color"]', 'content');
  themeColor ? ok(`theme-color ${themeColor}`) : fail('no theme-color meta');

  // `ready` resolves while the worker is still "activating"; give it a moment to reach "activated".
  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    for (let i = 0; i < 20 && r.active?.state !== 'activated'; i++)
      await new Promise((res) => setTimeout(res, 250));
    return { scope: r.scope, state: r.active?.state ?? null };
  });
  reg.state === 'activated'
    ? ok(`service worker active, scope ${reg.scope}`)
    : fail(`service worker ${JSON.stringify(reg)}`);
  await page.reload({ waitUntil: 'load' });
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  controlled
    ? ok('page controlled by the service worker after reload')
    : fail('page not controlled after reload');

  // offline: the precached shell must still render
  const ctx = page.context();
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' }).catch(() => fail('reload failed offline'));
  const heading = await page.textContent('h1').catch(() => null);
  heading ? ok(`offline reload renders "${heading.trim()}"`) : fail('offline reload rendered nothing');
  await ctx.setOffline(false);

  // SPA fallback: a deep link served by 404.html
  const deep = await fetch(`${origin}${BASE}settings/members`);
  deep.ok
    ? ok('deep link served (preview serves index for unknown paths)')
    : fail(`deep link ${deep.status}`);

  await browser.close();
  console.log(process.exitCode ? 'PWA check FAILED' : 'PWA check passed');
} finally {
  server.kill();
  if (shell) spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
}
