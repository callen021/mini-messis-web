import { shade } from './colors';
import { type JerseyStyle } from './types';

/* =====================================================================
   JERSEY SVG — ported from legacy `jersey(id, color, contrast, kind, open)`.
   Returns an SVG string for a 120×112 shirt. Pattern fills (#knit, #hatch) are defined once by
   <JerseyDefs/> and referenced by id, exactly as the legacy hidden <svg> did.
   ===================================================================== */

const BODY =
  'M28 16 C34 12 42 9 50 7 Q60 23 70 7 C78 9 86 12 92 16 L112 34 Q114.5 37 111.5 39.5 L99.5 50 Q96.5 52.5 93.5 49.5 L89 44 L89 103 Q89 107 85 107 L35 107 Q31 107 31 103 L31 44 L26.5 49.5 Q23.5 52.5 20.5 50 L8.5 39.5 Q5.5 37 8 34 Z';
const TANK = 'M30 8 L44 8 Q60 36 76 8 L90 8 Q74 28 88 50 L88 107 L32 107 L32 50 Q46 28 30 8 Z';
const FOOT = 'M22 16 L48 6 Q60 22 72 6 L98 16 L118 38 L104 56 L92 50 L92 107 L28 107 L28 50 L16 56 L2 38 Z';

export interface JerseyOptions {
  /** Unique per rendered jersey (gradients/clip paths are keyed by it). */
  id: string;
  color: string;
  /** Text colour from `textColor(color)`. */
  contrast: string;
  kind: JerseyStyle;
  /** Open (unassigned) jersey: white outline + hatch. */
  open: boolean;
}

export function jerseySvg({ id, color, contrast, kind, open }: JerseyOptions): string {
  const dark = shade(color, -0.38);
  const light = shade(color, 0.28);
  const body = kind === 'basketball' ? TANK : kind === 'football' ? FOOT : BODY;
  let deco = '';
  let trim = '';
  if (kind === 'basketball') {
    deco = `<path d="M34 50 V107 H40 V50Z M80 50 V107 H86 V50Z" fill="${contrast}" opacity=".55"/>`;
    trim = `<path d="M44 8 Q60 36 76 8" fill="none" stroke="${contrast}" stroke-width="4" stroke-linecap="round" opacity=".95"/>
<path d="M90 8 Q74 28 88 50 M30 8 Q46 28 32 50" fill="none" stroke="${contrast}" stroke-width="3.5" stroke-linecap="round" opacity=".95"/>`;
  } else if (kind === 'football') {
    deco = `<path d="M28 50 L28 107 L38 107 L38 50Z M82 50 L82 107 L92 107 L92 50Z" fill="#000" opacity=".12"/>
<path d="M22 16 L30 50 M98 16 L90 50" stroke="#000" opacity=".18" stroke-width="1.4" fill="none"/>
<path d="M2 38 L16 56 M118 38 L104 56" stroke="${contrast}" stroke-width="5" opacity=".9"/>
<path d="M-2 31 L12 49 M122 31 L108 49" stroke="${contrast}" stroke-width="3" opacity=".9"/>
<path d="M-2 31 L12 49 M122 31 L108 49" stroke="${dark}" stroke-width="1" opacity=".5" transform="translate(0 -4)"/>`;
    trim = `<path d="M48 6 Q60 24 72 6" fill="none" stroke="${contrast}" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round" opacity=".95"/>`;
  } else if (kind === 'baseball') {
    deco = `<path d="M31 46 L31 107 L40 107 L41 46Z M89 46 L89 107 L80 107 L79 46Z" fill="#000" opacity=".1"/>
<path d="M50 7 L36 50 M70 7 L84 50" stroke="#000" opacity=".16" stroke-width="1.2" fill="none"/>
<path d="M8 34 L21 50 M112 34 L99 50" stroke="${contrast}" stroke-width="6" opacity=".9"/>
<path d="M60 22 V106" stroke="${contrast}" stroke-width="1.3" opacity=".75"/>
<path d="M56 22 V106 M64 22 V106" stroke="#000" stroke-width=".6" opacity=".12"/>
${[32, 46, 60, 74, 88, 100].map((y) => `<circle cx="60" cy="${y}" r="1.5" fill="${contrast}" opacity=".9"/>`).join('')}`;
    trim = `<path d="M50 7 L60 25 L70 7" fill="none" stroke="${contrast}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" opacity=".95"/>`;
  } else {
    deco = `<path d="M31 46 L31 107 L40 107 L41 46Z M89 46 L89 107 L80 107 L79 46Z" fill="#000" opacity=".11"/>
<path d="M28 16 L33 50 M92 16 L87 50" stroke="#000" opacity=".15" stroke-width="1.2" fill="none"/>
<path d="M8 34 L21 50 M112 34 L99 50" stroke="${contrast}" stroke-width="6.5" opacity=".92"/>
<path d="M8 34 L21 50 M112 34 L99 50" stroke="${dark}" stroke-width="1" opacity=".45" transform="translate(3 -2.5)"/>
<path d="M36 103.5H84" stroke="${contrast}" stroke-width=".9" stroke-dasharray="2 1.6" opacity=".4"/>`;
    trim = `<path d="M50 7 Q60 25 70 7" fill="none" stroke="${contrast}" stroke-width="5" stroke-linecap="round" opacity=".95"/><path d="M50 7 Q60 25 70 7" fill="none" stroke="${color}" stroke-width="1.4"/>`;
  }
  return `<svg viewBox="0 0 120 112" aria-hidden="true"><defs>
<clipPath id="c${id}"><path d="${body}"/></clipPath>
<linearGradient id="s${id}" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#fff" stop-opacity=".34"/><stop offset=".4" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#000" stop-opacity=".26"/></linearGradient>
<radialGradient id="r${id}" cx=".5" cy=".3" r=".8"><stop stop-color="${light}" stop-opacity=".35"/><stop offset="1" stop-color="${dark}" stop-opacity=".5"/></radialGradient>
<linearGradient id="f${id}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
<path d="${body}" fill="${color}" stroke="${open ? '#fff' : dark}" stroke-width="${open ? 2.4 : 1.6}" stroke-linejoin="round"/>
<g clip-path="url(#c${id})" class="deco"><rect width="120" height="112" fill="url(#r${id})"/>${deco}<rect width="120" height="112" fill="url(#knit)"/><path d="${body}" fill="url(#s${id})"/>${open ? `<path d="${body}" fill="url(#hatch)"/>` : ''}
<path d="M44 20 Q60 32 76 20 Q60 26 44 20Z" fill="url(#f${id})"/><path d="M36 60 Q46 70 40 92" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="3.5" stroke-linecap="round"/><path d="M84 58 Q76 72 82 96" fill="none" stroke="#000" stroke-opacity=".14" stroke-width="3.5" stroke-linecap="round"/><path d="M52 70 Q58 82 50 100" fill="none" stroke="#000" stroke-opacity=".08" stroke-width="2.5" stroke-linecap="round"/><path d="M66 66 Q62 80 70 98" fill="none" stroke="#fff" stroke-opacity=".09" stroke-width="2.5" stroke-linecap="round"/></g>
${trim}</svg>`;
}

/* ---------- standing overlays (goals, hoops, posts) ---------- */

const POST = (d: string, w: number): string =>
  `<path d="${d}" fill="none" stroke="#6f7983" stroke-width="${w * 1.15}" stroke-linecap="round" stroke-linejoin="round" opacity=".6"/><path d="${d}" fill="none" stroke="#c9cfd6" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#fff" stroke-width="${w * 0.5}" stroke-linecap="round" stroke-linejoin="round"/>`;

// far goal: looking into the mouth — frame nearest, box net recedes
export const GOAL_FAR = `<svg viewBox="0 0 100 52"><ellipse cx="50" cy="48" rx="46" ry="6" fill="url(#gsh)"/><polygon points="14,2 86,2 86,26 14,26" fill="url(#net2)" opacity=".75"/><polygon points="10,50 90,50 86,26 14,26" fill="url(#net2)" opacity=".45"/><polygon points="10,25 90,25 86,2 14,2" fill="url(#net2)" opacity=".9"/><polygon points="10,25 10,50 14,26 14,2" fill="url(#net2)" opacity=".6"/><polygon points="90,25 90,50 86,26 86,2" fill="url(#net2)" opacity=".6"/>${POST('M14 2H86M14 2V26M86 2V26M14 26H86', 1.6)}${POST('M10 25L14 2M90 25L86 2M10 50L14 26M90 50L86 26', 1.6)}${POST('M10 50V25H90V50', 4.6)}</svg>`;
// near goal: seen from behind — crossbar on the goal line, box net toward the viewer
export const GOAL_NEAR = `<svg viewBox="0 0 100 52"><ellipse cx="50" cy="49" rx="48" ry="6" fill="url(#gsh)"/><polygon points="12,0 88,0 92,25 8,25" fill="url(#net2)" opacity=".92"/><polygon points="8,25 92,25 92,50 8,50" fill="url(#net2)" opacity=".9"/><polygon points="12,0 12,26 8,50 8,25" fill="url(#net2)" opacity=".7"/><polygon points="88,0 88,26 92,50 92,25" fill="url(#net2)" opacity=".7"/>${POST('M12 0V26M88 0V26', 4.4)}${POST('M12 0L8 25M88 0L92 25M8 25V50M92 25V50M8 25H92M8 50H92', 1.8)}${POST('M12 0H88', 4.6)}</svg>`;
export const POST_SVG = `<svg viewBox="0 0 100 112"><ellipse cx="50" cy="109" rx="14" ry="3" fill="url(#gsh)"/><rect x="44" y="84" width="12" height="28" rx="2" fill="#1f3f8f"/>${POST(
  'M50 84V66',
  5,
)
  .replace(/#c9cfd6|#fff/g, '#f2c230')
  .replace(/#6f7983/g, '#a07a14')}${POST('M14 66H86M14 66V2M86 66V2', 4.6)
  .replace(/#c9cfd6/g, '#f2c230')
  .replace(/#fff/g, '#ffe08a')
  .replace(/#6f7983/g, '#a07a14')}</svg>`;
export const HOOP_FAR = `<svg viewBox="0 0 100 120"><ellipse cx="50" cy="117" rx="18" ry="3" fill="url(#gsh)"/><rect x="47" y="46" width="6" height="74" fill="#23428f"/><rect x="38" y="104" width="24" height="16" rx="3" fill="#1d3a80"/><rect x="18" y="2" width="64" height="42" rx="2" fill="rgba(240,243,248,.88)" stroke="#fff" stroke-width="2.4"/><rect x="38" y="16" width="24" height="18" fill="none" stroke="#d04b3a" stroke-width="2"/><ellipse cx="50" cy="45" rx="12" ry="3.6" fill="none" stroke="#ff7a1f" stroke-width="2.8"/><path d="M38 45L42 64M44 46L46 64M50 47V64M56 46L54 64M62 45L58 64M40 55H60M42 60H58" stroke="#fff" stroke-width="1" stroke-opacity=".85" fill="none"/></svg>`;
export const HOOP_NEAR = `<svg viewBox="0 0 100 120"><ellipse cx="50" cy="117" rx="18" ry="3" fill="url(#gsh)"/><path d="M38 45L42 64M44 46L46 64M50 47V64M56 46L54 64M62 45L58 64M40 55H60M42 60H58" stroke="#fff" stroke-width="1" stroke-opacity=".85" fill="none"/><rect x="18" y="2" width="64" height="42" rx="2" fill="#b9c1cc" stroke="#d6dce4" stroke-width="2.4"/><path d="M26 10V36M50 10V36M74 10V36M26 23H74" stroke="#9aa3ae" stroke-width="2"/><rect x="47" y="30" width="6" height="90" fill="#23428f"/><rect x="38" y="104" width="24" height="16" rx="3" fill="#1d3a80"/></svg>`;

export const STANDING_SVG = {
  'goal-far': GOAL_FAR,
  'goal-near': GOAL_NEAR,
  post: POST_SVG,
  'hoop-far': HOOP_FAR,
  'hoop-near': HOOP_NEAR,
} as const;

/** Shared pattern/gradient defs; render once per page (legacy hidden <svg>). */
export const JERSEY_DEFS = `<defs>
<pattern id="knit" width="2.4" height="2.4" patternUnits="userSpaceOnUse"><path d="M0 1.2H2.4" stroke="#000" stroke-width=".9" opacity=".06"/><path d="M1.2 0V2.4" stroke="#fff" stroke-width=".6" opacity=".07"/></pattern>
<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="rgba(255,255,255,.10)"/><rect width="2.6" height="6" fill="rgba(255,255,255,.34)"/></pattern>
<pattern id="net2" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="#dfe6ee" opacity=".16"/><path d="M0 0H2M0 0V2" stroke="#fff" stroke-width=".42" opacity=".92"/></pattern>
<radialGradient id="gsh"><stop stop-color="#000" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
</defs>`;
