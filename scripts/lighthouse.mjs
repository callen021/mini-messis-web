// Lighthouse on the production build with Lighthouse's default mobile profile (emulated mid-tier
// Android, 4x CPU slowdown, slow 4G). Usage: npm run lighthouse [url]
// Builds with BASE_PATH=/mini-messis-web/ (same as the Pages deploy), serves dist with `vite
// preview`, audits the signed-out entry page, and writes reports to lighthouse/. Set CHROME_PATH
// to a Chrome/Chromium binary when none is installed system-wide (e.g. Playwright's chromium).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 4174;
const BASE = '/mini-messis-web/';
const url = process.argv[2] ?? `http://localhost:${PORT}${BASE}signin`;
const out = 'lighthouse';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (!process.env.SKIP_BUILD) {
  run(npx, ['vite', 'build'], { env: { ...process.env, BASE_PATH: BASE } });
}
mkdirSync(out, { recursive: true });

const server = spawn(npx, ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  env: { ...process.env, BASE_PATH: BASE },
  stdio: 'ignore',
  shell: process.platform === 'win32',
});
const wait = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error('preview server did not start');
};

try {
  await wait();
  run(npx, [
    'lighthouse',
    url,
    '--quiet',
    '--chrome-flags=--headless=new --no-sandbox',
    '--only-categories=performance,accessibility,best-practices,seo',
    '--output=json',
    '--output=html',
    `--output-path=${join(out, 'report')}`,
  ]);
  const json = JSON.parse(readFileSync(join(out, 'report.report.json'), 'utf8'));
  const cats = json.categories;
  const score = (k) => Math.round((cats[k]?.score ?? 0) * 100);
  const summary = {
    url,
    performance: score('performance'),
    accessibility: score('accessibility'),
    bestPractices: score('best-practices'),
    seo: score('seo'),
    installable: {
      manifest: json.audits['installable-manifest']?.score ?? null,
      serviceWorker: json.audits['service-worker']?.score ?? null,
    },
    lcpMs: Math.round(json.audits['largest-contentful-paint']?.numericValue ?? 0),
    tbtMs: Math.round(json.audits['total-blocking-time']?.numericValue ?? 0),
    cls: Number((json.audits['cumulative-layout-shift']?.numericValue ?? 0).toFixed(3)),
  };
  console.log(JSON.stringify(summary, null, 2));
  const ok = summary.performance >= 85 && summary.accessibility >= 95;
  console.log(ok ? 'Lighthouse budget met (perf ≥ 85, a11y ≥ 95).' : 'Lighthouse budget NOT met.');
  if (existsSync(join(out, 'report.report.html')))
    console.log(`HTML report: ${join(out, 'report.report.html')}`);
  process.exitCode = ok ? 0 : 1;
} finally {
  server.kill();
  if (process.platform === 'win32')
    spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
}
