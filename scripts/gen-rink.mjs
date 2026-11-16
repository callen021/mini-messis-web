// Draws our half of the hockey rink (D122) as two SVG files, public/fields/hockey-{flat,persp}.svg,
// from the same homographies `src/sports/field.ts` uses to place the jerseys, so the lines and the
// spots can never drift apart. Run `node scripts/gen-rink.mjs` after changing the rink or the tilt
// and paste the printed H into FIELDS.hockey.
//
// Rink coordinates are feet: x across the ice from the centre (−42.5..42.5), y down from the
// centre red line (0) to our end boards (100): the blue line at 36, the goal line at 89, our net
// on the goal line. Field percent: x = 50 + x·100/85, y = y.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fields');

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

const FLAT = { w: 1000, h: 1100, H: [9.2, 0, 40, 0, 9.6, 90, 0, 0, 1] };
const PERSP = { w: 1200, h: 1160, H: trapezoid(160, 1040, 200, 20, 1180, 1050) };

const ft = (x, y) => [50 + (x * 100) / 85, y];
const r1 = (v) => Math.round(v * 10) / 10;

function makeDraw(F) {
  const P = (x, y) => proj(F.H, ...ft(x, y)).map(r1);
  const pts = (list) => list.map(([x, y]) => P(x, y).join(',')).join(' ');
  const sw = (wFt, yFt) => r1(((wFt * 100) / 85) * pxPerUnit(F.H, yFt));
  const poly = (list, attrs) => `<polygon points="${pts(list)}" ${attrs}/>`;
  const line = (list, attrs) =>
    `<polyline points="${pts(list)}" fill="none" stroke-linecap="round" stroke-linejoin="round" ${attrs}/>`;
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

const ICE = '#eef6fb';
const RED = '#d8313a';
const BLUE = '#1f5fbf';

function rink(F, persp) {
  const { pts, sw, poly, line, arc } = makeDraw(F);
  const g = [];
  g.push(`<rect width="${F.w}" height="${F.h}" fill="url(#oob)"/>`);
  // the ice, with rounded end corners (28 ft radius)
  const corner = (sx) => arc(sx * 14.5, 72, 28, sx > 0 ? 0 : Math.PI, sx > 0 ? Math.PI / 2 : Math.PI / 2, 24);
  const sheet = [[-42.5, 0], [42.5, 0], [42.5, 72], ...corner(1), ...corner(-1).reverse(), [-42.5, 72]];
  g.push(poly(sheet, `fill="${ICE}"`));
  g.push(poly(sheet, `fill="url(#${persp ? 'lit3d' : 'lit'})"`));
  const lines = [];
  // the centre red line (far edge) and the blue line
  lines.push(
    line(
      [
        [-42.5, 0],
        [42.5, 0],
      ],
      `stroke="${RED}" stroke-width="${sw(1, 0)}"`,
    ),
  );
  lines.push(
    line(
      [
        [-42.5, 36],
        [42.5, 36],
      ],
      `stroke="${BLUE}" stroke-width="${sw(1, 36)}"`,
    ),
  );
  // the goal line and the crease
  lines.push(
    line(
      [
        [-40, 89],
        [40, 89],
      ],
      `stroke="${RED}" stroke-width="${sw(0.17, 89)}"`,
    ),
  );
  lines.push(
    `<polygon points="${pts([
      [-4, 89],
      [4, 89],
      ...arc(0, 89, 6, Math.PI, 2 * Math.PI, 20)
        .reverse()
        .filter(([, y]) => y <= 89),
    ])}" fill="#9fd0ea" fill-opacity=".6" stroke="${RED}" stroke-width="${sw(0.17, 86)}"/>`,
  );
  // the end-zone faceoff circles and dots
  for (const s of [-1, 1]) {
    lines.push(
      line(arc(22 * s, 69, 15, 0, 2 * Math.PI, 48), `stroke="${RED}" stroke-width="${sw(0.17, 69)}"`),
    );
    lines.push(`<polygon points="${pts(arc(22 * s, 69, 1, 0, 2 * Math.PI, 16))}" fill="${RED}"/>`);
    // the neutral-zone dots
    lines.push(`<polygon points="${pts(arc(22 * s, 20, 1, 0, 2 * Math.PI, 16))}" fill="${RED}"/>`);
  }
  // half of the centre circle shows at the far edge
  lines.push(line(arc(0, 0, 15, 0, Math.PI, 36), `stroke="${BLUE}" stroke-width="${sw(0.17, 8)}"`));
  g.push(`<g>${lines.join('')}</g>`);
  // the boards
  g.push(
    `<polyline points="${pts([[-42.5, 0], [-42.5, 72], ...corner(-1), ...corner(1).reverse(), [42.5, 72], [42.5, 0]])}" fill="none" stroke="#c9d3dc" stroke-width="${sw(1.2, 60)}"/>`,
  );
  // the glass line above the boards in 3D
  if (persp) {
    g.push(
      `<polyline points="${pts([[-42.5, 0], [-42.5, 72], ...corner(-1), ...corner(1).reverse(), [42.5, 72], [42.5, 0]])}" fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-width="${sw(0.5, 60)}"/>`,
    );
  }

  const defs = persp
    ? `<linearGradient id="oob" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#1b2733"/><stop offset=".22" stop-color="#22313f"/><stop offset="1" stop-color="#15202a"/></linearGradient>
<linearGradient id="lit3d" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#000" stop-opacity=".12"/><stop offset=".55" stop-color="#fff" stop-opacity=".10"/><stop offset="1" stop-color="#000" stop-opacity=".04"/></linearGradient>`
    : `<linearGradient id="oob" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#263544"/><stop offset="1" stop-color="#1d2a37"/></linearGradient>
<radialGradient id="lit" cx=".5" cy=".4" r=".8"><stop stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity=".06"/></radialGradient>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${F.w} ${F.h}" width="${F.w}" height="${F.h}">
<defs>${defs}</defs>
${g.join('\n')}
</svg>
`;
}

writeFileSync(join(OUT, 'hockey-flat.svg'), rink(FLAT, false));
writeFileSync(join(OUT, 'hockey-persp.svg'), rink(PERSP, true));
console.log('wrote hockey-flat.svg and hockey-persp.svg');
console.log('FLAT H', JSON.stringify(FLAT.H));
console.log('PERSP H', JSON.stringify(PERSP.H.map((v) => Math.round(v * 1e8) / 1e8)));
