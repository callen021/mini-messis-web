// Bundle budget (BUILD-PROMPT §7): the initial JS the app ships must stay under 250 kB gzipped.
// Run after `vite build`; exits 1 when the entry chunk (the script index.html loads) is over.
import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LIMIT_KB = Number(process.env.BUNDLE_LIMIT_KB ?? 250);
const dist = process.argv[2] ?? 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const entry = /<script[^>]+src="[^"]*?(assets\/[^"]+\.js)"/.exec(html)?.[1];
if (!entry) {
  console.error('check-bundle: no module script found in dist/index.html');
  process.exit(1);
}
// modulepreload'ed chunks load with the entry, so they count toward the initial bundle too.
const preloads = [
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="[^"]*?(assets\/[^"]+\.js)"/g),
].map((m) => m[1]);
const initial = [...new Set([entry, ...preloads])];
let total = 0;
for (const f of initial) {
  const gz = gzipSync(readFileSync(join(dist, f))).length;
  total += gz;
  console.log(`${f}  ${(gz / 1024).toFixed(1)} kB gzip`);
}
const assets = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'));
const lazy = assets.filter((f) => !initial.includes(`assets/${f}`));
if (lazy.length) {
  const lazyKb = lazy.reduce((s, f) => s + gzipSync(readFileSync(join(dist, 'assets', f))).length, 0) / 1024;
  console.log(`+ ${lazy.length} lazy chunk(s), ${lazyKb.toFixed(1)} kB gzip, loaded on demand`);
}
console.log(`initial JS: ${(total / 1024).toFixed(1)} kB gzip (limit ${LIMIT_KB} kB)`);
if (total / 1024 > LIMIT_KB) {
  console.error(`check-bundle: over budget by ${(total / 1024 - LIMIT_KB).toFixed(1)} kB`);
  process.exit(1);
}
