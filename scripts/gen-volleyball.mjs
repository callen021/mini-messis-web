// Draws our half of the volleyball court (D121) as two SVG files, public/fields/volleyball-{flat,persp}.svg,
// from the same homographies `src/sports/field.ts` uses to place the jerseys, so the lines and the
// spots can never drift apart. Run `node scripts/gen-volleyball.mjs` after changing the court or the
// tilt and paste the printed H into FIELDS.volleyball.
//
// Court coordinates are metres: x across the court from the centre (−4.5..4.5), y down from the
// net (0 at the net, 9 at our end line; the attack line at 3). Field percent: x = 50 + x·100/9,
// y = y·100/9. The net stands on the far line (y 0); the server's spot 1 is right back.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fields');

/* ---------- geometry (as scripts/gen-court.mjs) ---------- */

function trapezoid(fx0, fx1, F0, nx0, nx1, N0) {
  const d100 = (fx1 - fx0) / (nx1 - nx0);
  const g = (d100 - 1) / 100;
  return [(fx1 - fx0) / 100, (nx0 * d100 - fx0) / 100, fx0, 0, (N0 * d100 - F0) / 100, F0, 0, g, 1];
}
const proj = (H, x, y) => {
  const d = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d];
};
const pxPerUnit = (H, y) => (proj(H, 100, y)[0] - proj(H, 0, y)[0]) / 100;

const FLAT = { w: 1000, h: 1000, H: [9.2, 0, 40, 0, 8.6, 110, 0, 0, 1] };
const PERSP = { w: 1200, h: 1060, H: trapezoid(170, 1030, 230, 20, 1180, 945) };

const m = (x, y) => [50 + (x * 100) / 9, (y * 100) / 9];
const r1 = (v) => Math.round(v * 10) / 10;

function makeDraw(F) {
  const P = (x, y) => proj(F.H, ...m(x, y)).map(r1);
  const pts = (list) => list.map(([x, y]) => P(x, y).join(',')).join(' ');
  /** Stroke width in px for a line of `wM` metres at depth `yM`. */
  const sw = (wM, yM) => r1(((wM * 100) / 9) * pxPerUnit(F.H, (yM * 100) / 9));
  const poly = (list, attrs) => `<polygon points="${pts(list)}" ${attrs}/>`;
  const line = (list, attrs) =>
    `<polyline points="${pts(list)}" fill="none" stroke-linecap="round" stroke-linejoin="round" ${attrs}/>`;
  return { P, pts, sw, poly, line };
}

/* ---------- the court ---------- */

const COURT = '#d9893a';
const COURT_EDGE = '#c97a2f';
const FREE = '#2f7f5f';
const LINE = '#ffffff';

function court(F, persp) {
  const { sw, poly, line } = makeDraw(F);
  const g = [];
  g.push(`<rect width="${F.w}" height="${F.h}" fill="url(#oob)"/>`);
  // the free zone around the court
  g.push(
    poly(
      [
        [-7.5, -0.6],
        [7.5, -0.6],
        [7.5, 12],
        [-7.5, 12],
      ],
      `fill="${FREE}"`,
    ),
  );
  // the court, with a slightly darker attack zone
  g.push(
    poly(
      [
        [-4.5, 0],
        [4.5, 0],
        [4.5, 9],
        [-4.5, 9],
      ],
      `fill="${COURT}"`,
    ),
  );
  g.push(
    poly(
      [
        [-4.5, 0],
        [4.5, 0],
        [4.5, 3],
        [-4.5, 3],
      ],
      `fill="${COURT_EDGE}" fill-opacity=".55"`,
    ),
  );
  // lighting
  g.push(
    poly(
      [
        [-7.5, -0.6],
        [7.5, -0.6],
        [7.5, 12],
        [-7.5, 12],
      ],
      `fill="url(#${persp ? 'lit3d' : 'lit'})"`,
    ),
  );
  const W = 0.05;
  const lines = [];
  lines.push(
    poly(
      [
        [-4.5, 0],
        [4.5, 0],
        [4.5, 9],
        [-4.5, 9],
      ],
      `fill="none" stroke="${LINE}" stroke-width="${sw(W, 4.5)}" stroke-linejoin="round"`,
    ),
  );
  // the attack line, 3 m from the net, with its dashed extensions
  lines.push(
    line(
      [
        [-4.5, 3],
        [4.5, 3],
      ],
      `stroke="${LINE}" stroke-width="${sw(W, 3)}"`,
    ),
  );
  for (const s of [-1, 1])
    lines.push(
      line(
        [
          [4.5 * s, 3],
          [6.25 * s, 3],
        ],
        `stroke="${LINE}" stroke-width="${sw(W, 3)}" stroke-dasharray="${r1(sw(0.15, 3))} ${r1(sw(0.2, 3))}"`,
      ),
    );
  // the centre line under the net
  lines.push(
    line(
      [
        [-4.5, 0],
        [4.5, 0],
      ],
      `stroke="${LINE}" stroke-width="${sw(W * 1.4, 0)}"`,
    ),
  );
  // service zone ticks behind the end line
  for (const s of [-1, 1])
    lines.push(
      line(
        [
          [4.5 * s, 9.05],
          [4.5 * s, 9.25],
        ],
        `stroke="${LINE}" stroke-width="${sw(W, 9)}"`,
      ),
    );
  g.push(`<g>${lines.join('')}</g>`);

  if (persp) {
    g.push(
      poly(
        [
          [-7.6, 12.05],
          [7.6, 12.05],
          [7.9, 12.8],
          [-7.9, 12.8],
        ],
        `fill="#1f5a44"`,
      ),
    );
  }

  const defs = persp
    ? `<linearGradient id="oob" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#0d2b3f"/><stop offset=".22" stop-color="#123a52"/><stop offset="1" stop-color="#0a2435"/></linearGradient>
<linearGradient id="lit3d" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#000" stop-opacity=".18"/><stop offset=".55" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".06"/></linearGradient>`
    : `<linearGradient id="oob" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#14405a"/><stop offset="1" stop-color="#10344a"/></linearGradient>
<radialGradient id="lit" cx=".5" cy=".4" r=".8"><stop stop-color="#fff" stop-opacity=".10"/><stop offset="1" stop-color="#000" stop-opacity=".10"/></radialGradient>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${F.w} ${F.h}" width="${F.w}" height="${F.h}">
<defs>${defs}</defs>
${g.join('\n')}
</svg>
`;
}

writeFileSync(join(OUT, 'volleyball-flat.svg'), court(FLAT, false));
writeFileSync(join(OUT, 'volleyball-persp.svg'), court(PERSP, true));
console.log('wrote volleyball-flat.svg and volleyball-persp.svg');
console.log('FLAT H', JSON.stringify(FLAT.H));
console.log('PERSP H', JSON.stringify(PERSP.H.map((v) => Math.round(v * 1e8) / 1e8)));
