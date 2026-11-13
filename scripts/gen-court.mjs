// Draws the basketball half court (D106) as two SVG files, public/fields/basketball-{flat,persp}.svg,
// from the same homographies `src/sports/field.ts` uses to place the jerseys, so the lines and the
// slots can never drift apart. Run `node scripts/gen-court.mjs` after changing the court or the tilt
// and paste the printed H into FIELDS.basketball.
//
// Court coordinates are feet: x across the court from the centre (−25..25), y down from the
// baseline (0 at the baseline, 47 at the half-court line). Field percent: x = 50 + 2·ft, y = ft·100/47.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fields');

/* ---------- geometry ---------- */

/** Symmetric trapezoid → homography: (0,0)→(fx0,F0), (100,0)→(fx1,F0), (0,100)→(nx0,N0), (100,100)→(nx1,N0). */
function trapezoid(fx0, fx1, F0, nx0, nx1, N0) {
  const d100 = (fx1 - fx0) / (nx1 - nx0); // 100g + 1
  const g = (d100 - 1) / 100;
  return [(fx1 - fx0) / 100, (nx0 * d100 - fx0) / 100, fx0, 0, (N0 * d100 - F0) / 100, F0, 0, g, 1];
}
const proj = (H, x, y) => {
  const d = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d];
};
/** Pixels per field-x unit at depth y (1 at the flat scale; shrinks toward the far end in 3D). */
const pxPerUnit = (H, y) => (proj(H, 100, y)[0] - proj(H, 0, y)[0]) / 100;

const FLAT = { w: 1000, h: 900, H: [9.2, 0, 40, 0, 7.78, 100, 0, 0, 1] };
const PERSP = { w: 1200, h: 1060, H: trapezoid(150, 1050, 215, 20, 1180, 935) };

const ft = (x, y) => [50 + 2 * x, (y * 100) / 47]; // feet → field percent
const r1 = (v) => Math.round(v * 10) / 10;

/* ---------- drawing helpers (all take feet, project through F.H) ---------- */

function makeDraw(F) {
  const P = (x, y) => proj(F.H, ...ft(x, y)).map(r1);
  const pts = (list) => list.map(([x, y]) => P(x, y).join(',')).join(' ');
  /** Stroke width in px for a line of `wFt` feet at depth `yFt` (2 field units per foot). */
  const sw = (wFt, yFt) => r1(wFt * 2 * pxPerUnit(F.H, (yFt * 100) / 47));
  const poly = (list, attrs) => `<polygon points="${pts(list)}" ${attrs}/>`;
  const line = (list, attrs) =>
    `<polyline points="${pts(list)}" fill="none" stroke-linecap="round" stroke-linejoin="round" ${attrs}/>`;
  /** Arc of a circle centred (cx, cy) in feet, radius r, from angle a0 to a1 (radians, 0 = +x, CCW toward +y). */
  const arc = (cx, cy, r, a0, a1, n = 40) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return out;
  };
  return { P, pts, sw, poly, line, arc };
}

/* ---------- the court ---------- */

const WOOD = ['#d8a46a', '#d3a066', '#dba96f', '#cf9b61', '#d6a26b', '#dea86e', '#d19c63', '#d9a56c'];
const LINE = '#ffffff';
const KEY = '#1f4ea8';

function court(F, persp) {
  const { pts, sw, poly, line, arc } = makeDraw(F);
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const g = [];

  // out of bounds
  g.push(`<rect width="${F.w}" height="${F.h}" fill="url(#oob)"/>`);

  // planks: 20 across the 50 ft, each 2.5 ft, with staggered end joints
  const planks = [];
  const joints = [];
  for (let i = 0; i < 20; i++) {
    const x0 = -25 + i * 2.5;
    const x1 = x0 + 2.5;
    planks.push(
      poly(
        [
          [x0, 0],
          [x1, 0],
          [x1, 47],
          [x0, 47],
        ],
        `fill="${WOOD[Math.floor(rnd() * WOOD.length)]}"`,
      ),
    );
    let y = rnd() * 9;
    while (y < 47) {
      joints.push(
        line(
          [
            [x0, y],
            [x1, y],
          ],
          `stroke="#000" stroke-opacity=".16" stroke-width="${sw(0.12, y)}"`,
        ),
      );
      y += 7 + rnd() * 8;
    }
  }
  g.push(`<g>${planks.join('')}</g>`);
  g.push(`<g>${joints.join('')}</g>`);
  // plank seams
  const seams = [];
  for (let i = 1; i < 20; i++) {
    const x = -25 + i * 2.5;
    seams.push(
      line(
        [
          [x, 0],
          [x, 47],
        ],
        `stroke="#000" stroke-opacity=".10" stroke-width="${sw(0.1, 23)}"`,
      ),
    );
  }
  g.push(`<g>${seams.join('')}</g>`);
  // lighting: a soft highlight around the key and a gentle fall-off to the far end
  g.push(
    poly(
      [
        [-25, 0],
        [25, 0],
        [25, 47],
        [-25, 47],
      ],
      `fill="url(#${persp ? 'lit3d' : 'lit'})"`,
    ),
  );

  // the key (lane) 12 × 19 ft
  g.push(
    poly(
      [
        [-6, 0],
        [6, 0],
        [6, 19],
        [-6, 19],
      ],
      `fill="${KEY}"`,
    ),
  );

  const W = 0.3; // line width in feet
  const lines = [];
  // boundary
  lines.push(
    poly(
      [
        [-25, 0],
        [25, 0],
        [25, 47],
        [-25, 47],
      ],
      `fill="none" stroke="${LINE}" stroke-width="${sw(W, 23)}" stroke-linejoin="round"`,
    ),
  );
  // key outline + free-throw line
  lines.push(
    line(
      [
        [-6, 0],
        [-6, 19],
        [6, 19],
        [6, 0],
      ],
      `stroke="${LINE}" stroke-width="${sw(W, 10)}"`,
    ),
  );
  // lane hash marks (block and two ticks each side)
  for (const s of [-1, 1]) {
    lines.push(
      line(
        [
          [6 * s, 7],
          [7 * s, 7],
        ],
        `stroke="${LINE}" stroke-width="${sw(0.6, 7)}"`,
      ),
    );
    for (const y of [11, 14, 17])
      lines.push(
        line(
          [
            [6 * s, y],
            [6.6 * s, y],
          ],
          `stroke="${LINE}" stroke-width="${sw(W, y)}"`,
        ),
      );
  }
  // free-throw circle: solid outside the key, dashed inside
  lines.push(line(arc(0, 19, 6, 0, Math.PI, 36), `stroke="${LINE}" stroke-width="${sw(W, 22)}"`));
  lines.push(
    line(
      arc(0, 19, 6, Math.PI, 2 * Math.PI, 36),
      `stroke="${LINE}" stroke-width="${sw(W, 16)}" stroke-dasharray="${r1(sw(1.4, 16))} ${r1(sw(1.0, 16))}"`,
    ),
  );
  // three-point arc (19.75 ft from the ring centre at y 5.25, meeting the baseline)
  const a0 = Math.atan2(-5.25, 19.04);
  lines.push(line(arc(0, 5.25, 19.75, a0, Math.PI - a0, 60), `stroke="${LINE}" stroke-width="${sw(W, 18)}"`));
  // half-court line and centre circle (the near half shows)
  lines.push(
    line(
      [
        [-25, 47],
        [25, 47],
      ],
      `stroke="${LINE}" stroke-width="${sw(W, 47)}"`,
    ),
  );
  lines.push(line(arc(0, 47, 6, Math.PI, 2 * Math.PI, 36), `stroke="${LINE}" stroke-width="${sw(W, 44)}"`));
  g.push(`<g>${lines.join('')}</g>`);

  if (persp) {
    // the floor's edge below the near line, then the surround
    g.push(
      poly(
        [
          [-25.4, 47.15],
          [25.4, 47.15],
          [25.9, 48.6],
          [-25.9, 48.6],
        ],
        `fill="#2a5fc4"`,
      ),
    );
    g.push(
      poly(
        [
          [-25.9, 48.6],
          [25.9, 48.6],
          [26.1, 49.4],
          [-26.1, 49.4],
        ],
        `fill="#153a86"`,
      ),
    );
  } else {
    // top-down hoop: stanchion, backboard, ring and net
    // (drawn larger than life so it reads at phone size)
    g.push(
      poly(
        [
          [-0.45, -2],
          [0.45, -2],
          [0.45, 4],
          [-0.45, 4],
        ],
        `fill="#8a94a3"`,
      ),
    );
    g.push(
      line(
        [
          [-3.4, 4],
          [3.4, 4],
        ],
        `stroke="#9aa4b2" stroke-width="${sw(0.9, 4)}"`,
      ),
    );
    g.push(
      line(
        [
          [-3.4, 4],
          [3.4, 4],
        ],
        `stroke="#f4f6fa" stroke-width="${sw(0.45, 4)}"`,
      ),
    );
    const net = [];
    for (let i = -2; i <= 2; i++)
      net.push(
        line(
          [
            [i * 0.45, 5.6],
            [i * 0.3, 7.6],
          ],
          `stroke="#fff" stroke-opacity=".9" stroke-width="${sw(0.1, 6)}"`,
        ),
      );
    net.push(
      line(
        [
          [-0.8, 6.6],
          [0.8, 6.6],
        ],
        `stroke="#fff" stroke-opacity=".9" stroke-width="${sw(0.1, 6)}"`,
      ),
    );
    g.push(`<g>${net.join('')}</g>`);
    g.push(
      `<polygon points="${pts(arc(0, 5.6, 1.15, 0, 2 * Math.PI, 28))}" fill="none" stroke="#ff7a1f" stroke-width="${sw(0.4, 5)}"/>`,
    );
  }

  const defs = persp
    ? `<linearGradient id="oob" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#0b2660"/><stop offset=".22" stop-color="#10307a"/><stop offset="1" stop-color="#081c4c"/></linearGradient>
<linearGradient id="lit3d" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#000" stop-opacity=".16"/><stop offset=".55" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".06"/></linearGradient>`
    : `<linearGradient id="oob" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#15408f"/><stop offset="1" stop-color="#113577"/></linearGradient>
<radialGradient id="lit" cx=".5" cy=".3" r=".8"><stop stop-color="#fff" stop-opacity=".10"/><stop offset="1" stop-color="#000" stop-opacity=".10"/></radialGradient>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${F.w} ${F.h}" width="${F.w}" height="${F.h}">
<defs>${defs}</defs>
${g.join('\n')}
</svg>
`;
}

writeFileSync(join(OUT, 'basketball-flat.svg'), court(FLAT, false));
writeFileSync(join(OUT, 'basketball-persp.svg'), court(PERSP, true));
console.log('wrote basketball-flat.svg and basketball-persp.svg');
console.log('FLAT  H:', JSON.stringify(FLAT.H));
console.log('PERSP H:', JSON.stringify(PERSP.H.map((v) => Math.round(v * 1e8) / 1e8)));
