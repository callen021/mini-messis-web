import { type Formation, type Position } from './types';

/* =====================================================================
   FORMATION GENERATORS — ported from legacy/index.html.
   A formation is {name, positions:[{role,code,x,y}], w}: x/y are % of the field box,
   w is the jersey width in % of the field width.
   ===================================================================== */

/* ---------- soccer ---------- */

export const SOCCER_SHAPES: Readonly<Record<number, readonly string[]>> = {
  2: ['1-1', '2'],
  3: ['2-1', '1-2', '1-1-1'],
  4: ['2-2', '1-2-1', '2-1-1', '1-3', '3-1'],
  5: ['2-2-1', '2-1-2', '1-2-2', '3-2', '2-3', '1-3-1'],
  6: ['2-2-2', '3-3', '4-2', '3-2-1', '3-1-2', '1-3-2', '2-3-1', '1-2-3'],
  7: ['2-3-2', '3-3-1', '3-2-2', '2-4-1', '3-1-3', '2-2-3'],
  8: ['3-3-2', '3-2-3', '2-3-3', '3-4-1', '2-4-2', '4-3-1'],
  9: ['3-4-2', '4-3-2', '3-3-3', '4-4-1', '3-5-1'],
  10: ['4-4-2', '4-3-3', '3-5-2', '4-2-3-1', '3-4-3', '4-1-4-1', '5-3-2'],
  11: ['4-4-3', '4-3-4', '3-5-3'],
};

export const SOCCER_CODES: Readonly<Record<string, Readonly<Record<number, readonly string[]>>>> = {
  DEF: {
    1: ['SW'],
    2: ['LFB', 'RFB'],
    3: ['LFB', 'SW', 'RFB'],
    4: ['LFB', 'LCB', 'RCB', 'RFB'],
    5: ['LWB', 'LCB', 'CB', 'RCB', 'RWB'],
  },
  MID: {
    1: ['CM'],
    2: ['LM', 'RM'],
    3: ['LM', 'CM', 'RM'],
    4: ['LM', 'LCM', 'RCM', 'RM'],
    5: ['LM', 'LCM', 'CM', 'RCM', 'RM'],
  },
  DM: { 1: ['CDM'], 2: ['LDM', 'RDM'], 3: ['LDM', 'CDM', 'RDM'], 4: ['LM', 'LDM', 'RDM', 'RM'] },
  AM: { 1: ['CAM'], 2: ['LAM', 'RAM'], 3: ['LAM', 'CAM', 'RAM'], 4: ['LM', 'LAM', 'RAM', 'RM'] },
  ST: {
    1: ['ST'],
    2: ['LS', 'RS'],
    3: ['LW', 'ST', 'RW'],
    4: ['LW', 'LS', 'RS', 'RW'],
    5: ['LW', 'LS', 'ST', 'RS', 'RW'],
  },
};

const fallbackShape3 = (n: number): string => {
  const a = Math.ceil(n / 3);
  const b = Math.round(n / 3);
  const c = n - a - b;
  return `${a}-${b}-${c}`;
};

/** Soccer formations for `size` players, `gk` deciding whether one of them is the goalkeeper. */
export function soccerFormations(size: number, gk: boolean): Formation[] {
  const n = size - (gk ? 1 : 0);
  const names = SOCCER_SHAPES[n] ?? [fallbackShape3(n)];
  return names.map((name) => {
    const parts = name.split('-').map(Number); // DEF → FWD
    const R = parts.length;
    const roles =
      R === 1
        ? ['ST']
        : R === 2
          ? ['DEF', 'ST']
          : R === 3
            ? ['DEF', 'MID', 'ST']
            : ['DEF', 'MID', 'MID', 'ST'];
    const codeSets = R === 4 ? ['DEF', 'DM', 'AM', 'ST'] : roles;
    const top = 26;
    const bottom = gk ? 70 : 84;
    const maxRow = Math.max(...parts, gk ? 1 : 0);
    const w = Math.min(24, 100 / (maxRow + 1) - 2);
    const positions: Position[] = [];
    for (let r = R - 1; r >= 0; r--) {
      // draw FWD row first (top of field)
      const k = parts[r] ?? 0;
      const role = roles[r] ?? 'ST';
      const y = R === 1 ? 40 : top + ((R - 1 - r) * (bottom - top)) / (R - 1);
      const codes =
        SOCCER_CODES[codeSets[r] ?? role]?.[k] ?? Array.from({ length: k }, (_, i) => role + (i + 1));
      for (let i = 0; i < k; i++) {
        positions.push({ role, code: codes[i] ?? role, x: (100 * (i + 1)) / (k + 1), y });
      }
    }
    if (gk) positions.push({ role: 'GK', code: 'GK', x: 50, y: 90 });
    return { name, positions, w };
  });
}

/* ---------- baseball (full-bleed diamond box, 100×100) ---------- */

const BB = (role: string, x: number, y: number): Position => ({ role, code: role, x, y });
const BASE_IF = [
  BB('P', 50, 62),
  BB('C', 50, 94),
  BB('1B', 80, 56),
  BB('2B', 65, 43),
  BB('SS', 35, 43),
  BB('3B', 20, 56),
];
const OF3 = [BB('LF', 19, 31), BB('CF', 50, 20), BB('RF', 81, 31)];
const OF4 = [BB('LF', 12, 35), BB('LCF', 35, 21), BB('RCF', 65, 21), BB('RF', 88, 35)];
const ROVER = [BB('ROV', 50, 46)];
const withRover = (ifs: Position[]) =>
  ifs.map((p) => (p.role === '2B' ? BB('2B', 69, 46) : p.role === 'SS' ? BB('SS', 31, 46) : p));

type RawForm = { name: string; positions: Position[] };

export const BASEBALL_FORMS: Readonly<Record<number, readonly RawForm[]>> = {
  6: [{ name: 'Infield only', positions: BASE_IF }],
  7: [
    { name: '1 outfielder', positions: [...BASE_IF, BB('CF', 50, 21)] },
    {
      name: 'No catcher',
      positions: [...BASE_IF.filter((p) => p.role !== 'C'), BB('LF', 30, 27), BB('RF', 70, 27)],
    },
  ],
  8: [
    { name: '2 outfielders', positions: [...BASE_IF, BB('LF', 30, 27), BB('RF', 70, 27)] },
    { name: 'No catcher', positions: [...BASE_IF.filter((p) => p.role !== 'C'), ...OF3] },
  ],
  9: [{ name: 'Standard', positions: [...BASE_IF, ...OF3] }],
  10: [
    { name: '4 outfielders', positions: [...BASE_IF, ...OF4] },
    { name: 'Rover infield', positions: [...withRover(BASE_IF), ...ROVER, ...OF3] },
  ],
  11: [{ name: '4 OF + rover', positions: [...withRover(BASE_IF), ...ROVER, ...OF4] }],
  12: [
    {
      name: '4 OF + 2 rovers',
      positions: [
        ...withRover(BASE_IF).map((p) =>
          p.role === '2B' ? BB('2B', 74, 44) : p.role === 'SS' ? BB('SS', 26, 44) : p,
        ),
        BB('ROV', 40, 50),
        BB('ROV', 60, 50),
        ...OF4,
      ],
    },
  ],
};

/** Baseball formations for `size` fielders (falls back to 9 for unknown sizes, as the legacy did). */
export function baseballFormations(size: number): Formation[] {
  const forms = BASEBALL_FORMS[size] ?? BASEBALL_FORMS[9] ?? [];
  return forms.map((f) => ({ ...f, w: 16 }));
}

/* ---------- basketball (half-court % → full-court box, 56×100 ft, far basket at top) ---------- */

const BK = (role: string, x: number, y: number): Position => ({
  role,
  code: role,
  x: ((0.5 + 0.55 * x) / 56) * 100,
  y: 2 + 0.62 * y,
});

export const BASKETBALL_FORMS: Readonly<Record<number, readonly RawForm[]>> = {
  3: [
    { name: '1-2', positions: [BK('PG', 50, 76), BK('F', 26, 40), BK('F', 74, 40)] },
    { name: '2-1', positions: [BK('G', 30, 72), BK('G', 70, 72), BK('C', 50, 30)] },
    { name: '1-1-1', positions: [BK('PG', 50, 80), BK('F', 50, 52), BK('C', 50, 26)] },
  ],
  4: [
    { name: '1-2-1', positions: [BK('PG', 50, 78), BK('SG', 22, 52), BK('SF', 78, 52), BK('C', 50, 26)] },
    { name: '2-2', positions: [BK('G', 30, 74), BK('G', 70, 74), BK('F', 28, 32), BK('F', 72, 32)] },
    { name: '1-3', positions: [BK('PG', 50, 78), BK('F', 20, 42), BK('C', 50, 32), BK('F', 80, 42)] },
  ],
  5: [
    {
      name: '1-2-2',
      positions: [BK('PG', 50, 80), BK('SG', 18, 58), BK('SF', 82, 58), BK('PF', 27, 33), BK('C', 73, 33)],
    },
    {
      name: '2-1-2',
      positions: [BK('PG', 32, 80), BK('SG', 68, 80), BK('SF', 50, 54), BK('PF', 22, 32), BK('C', 78, 32)],
    },
    {
      name: '1-3-1',
      positions: [BK('PG', 50, 82), BK('SG', 14, 56), BK('SF', 86, 56), BK('PF', 50, 54), BK('C', 50, 30)],
    },
    {
      name: '2-3',
      positions: [BK('G', 30, 80), BK('G', 70, 80), BK('F', 14, 46), BK('C', 50, 34), BK('F', 86, 46)],
    },
    {
      name: '1-4 high',
      positions: [BK('PG', 50, 82), BK('SG', 12, 56), BK('SF', 88, 56), BK('PF', 33, 34), BK('C', 67, 34)],
    },
  ],
};

export function basketballFormations(size: number): Formation[] {
  const forms = BASKETBALL_FORMS[size] ?? BASKETBALL_FORMS[5] ?? [];
  return forms.map((f) => ({ ...f, w: 23 }));
}

/* ---------- football (built, disabled) ---------- */

// xp: -50..50 across the field (hand-spaced); dy: yards behind (+) or past (−) the line of scrimmage
const FB = (role: string, xp: number, dy: number): Position => ({
  role,
  code: role,
  x: 50 + Math.max(-46, Math.min(46, xp)) * 0.9,
  y: ((31 + dy) / 52) * 100,
});
const OL5 = [FB('LT', -26, 4), FB('LG', -13, 2), FB('C', 0, 0), FB('RG', 13, 2), FB('RT', 26, 4)]; // pass-protection pocket
const DL4 = [FB('DE', -27, -2.5), FB('DT', -9, -2), FB('DT', 9, -2), FB('DE', 27, -2.5)];

export const FOOTBALL_FORMS: Readonly<Record<number, readonly RawForm[]>> = {
  11: [
    {
      name: 'I-Form',
      positions: [
        ...OL5,
        FB('TE', 34, 2),
        FB('WR', -49, 0),
        FB('WR', 49, -1),
        FB('QB', 0, 5),
        FB('FB', 0, 11),
        FB('RB', 0, 17),
      ],
    },
    {
      name: 'Shotgun',
      positions: [
        ...OL5,
        FB('WR', -49, 0),
        FB('WR', -37, -1),
        FB('WR', 37, -1),
        FB('WR', 49, 0),
        FB('QB', 0, 7.5),
        FB('RB', 13, 8),
      ],
    },
    {
      name: 'Pro set',
      positions: [
        ...OL5,
        FB('TE', 34, 2),
        FB('WR', -49, 0),
        FB('WR', 49, -1),
        FB('QB', 0, 5),
        FB('HB', -12, 12),
        FB('FB', 12, 12),
      ],
    },
    {
      name: 'Wishbone',
      positions: [
        ...OL5,
        FB('TE', 34, 2),
        FB('WR', -49, 0),
        FB('QB', 0, 5),
        FB('FB', 0, 11),
        FB('HB', -13, 17),
        FB('HB', 13, 17),
      ],
    },
    {
      name: 'Singleback',
      positions: [
        ...OL5,
        FB('TE', 34, 2),
        FB('WR', -49, 0),
        FB('WR', -37, -1),
        FB('WR', 49, -1),
        FB('QB', 0, 5),
        FB('RB', 0, 12),
      ],
    },
    {
      name: 'D · 4-3',
      positions: [
        ...DL4,
        FB('LB', -18, -7),
        FB('MLB', 0, -7),
        FB('LB', 18, -7),
        FB('CB', -46, -6),
        FB('CB', 46, -6),
        FB('S', -15, -13),
        FB('S', 15, -13),
      ],
    },
    {
      name: 'D · 4-4',
      positions: [
        ...DL4,
        FB('LB', -30, -7),
        FB('LB', -10, -7),
        FB('LB', 10, -7),
        FB('LB', 30, -7),
        FB('CB', -46, -5),
        FB('CB', 46, -5),
        FB('S', 0, -13),
      ],
    },
    {
      name: 'D · 5-2',
      positions: [
        FB('DE', -30, -2.5),
        FB('DT', -15, -2),
        FB('NT', 0, -2),
        FB('DT', 15, -2),
        FB('DE', 30, -2.5),
        FB('LB', -14, -7),
        FB('LB', 14, -7),
        FB('CB', -46, -6),
        FB('CB', 46, -6),
        FB('S', -15, -13),
        FB('S', 15, -13),
      ],
    },
  ],
  9: [
    {
      name: 'Power',
      positions: [
        FB('C', 0, 0),
        FB('LG', -13, 1.5),
        FB('RG', 13, 1.5),
        FB('TE', -26, 4),
        FB('TE', 26, 4),
        FB('WR', -46, 0),
        FB('QB', 0, 5),
        FB('FB', 0, 11),
        FB('RB', 13, 16),
      ],
    },
    {
      name: 'D · 3-3-3',
      positions: [
        FB('DE', -20, -2.5),
        FB('NT', 0, -2),
        FB('DE', 20, -2.5),
        FB('LB', -20, -7),
        FB('MLB', 0, -7),
        FB('LB', 20, -7),
        FB('CB', -46, -6),
        FB('CB', 46, -6),
        FB('S', 0, -13),
      ],
    },
  ],
  8: [
    {
      name: 'Tight',
      positions: [
        FB('C', 0, 0),
        FB('LG', -13, 1.5),
        FB('RG', 13, 1.5),
        FB('TE', 26, 4),
        FB('WR', -44, 0),
        FB('QB', 0, 5),
        FB('FB', 0, 11),
        FB('RB', -13, 16),
      ],
    },
    {
      name: 'Spread',
      positions: [
        FB('C', 0, 0),
        FB('LG', -13, 1.5),
        FB('RG', 13, 1.5),
        FB('WR', -48, 0),
        FB('WR', 48, 0),
        FB('WR', -32, -1),
        FB('QB', 0, 7.5),
        FB('RB', 13, 8),
      ],
    },
    {
      name: 'D · 3-3-2',
      positions: [
        FB('DE', -20, -2.5),
        FB('NT', 0, -2),
        FB('DE', 20, -2.5),
        FB('LB', -20, -7),
        FB('MLB', 0, -7),
        FB('LB', 20, -7),
        FB('CB', -40, -8),
        FB('CB', 40, -8),
      ],
    },
  ],
  7: [
    {
      name: 'Trips',
      positions: [
        FB('C', 0, 0),
        FB('QB', 0, 7),
        FB('RB', 14, 8),
        FB('WR', -48, 0),
        FB('WR', -34, -1),
        FB('WR', -20, 0),
        FB('TE', 28, 1),
      ],
    },
    {
      name: 'Spread',
      positions: [
        FB('C', 0, 0),
        FB('QB', 0, 7),
        FB('RB', -14, 8),
        FB('WR', -48, 0),
        FB('WR', -28, -1),
        FB('WR', 28, -1),
        FB('WR', 48, 0),
      ],
    },
    {
      name: 'D · 2-3-2',
      positions: [
        FB('DE', -14, -2.5),
        FB('DE', 14, -2.5),
        FB('LB', -30, -7),
        FB('MLB', 0, -7),
        FB('LB', 30, -7),
        FB('S', -18, -13),
        FB('S', 18, -13),
      ],
    },
  ],
  6: [
    {
      name: 'Spread',
      positions: [
        FB('C', 0, 0),
        FB('QB', 0, 7),
        FB('RB', 14, 8),
        FB('WR', -46, 0),
        FB('WR', -26, -1),
        FB('WR', 46, 0),
      ],
    },
    {
      name: 'D · 1-3-2',
      positions: [
        FB('NT', 0, -2.5),
        FB('LB', -30, -7),
        FB('MLB', 0, -7),
        FB('LB', 30, -7),
        FB('S', -18, -13),
        FB('S', 18, -13),
      ],
    },
  ],
  5: [
    {
      name: 'Spread',
      positions: [FB('C', 0, 0), FB('QB', 0, 7), FB('WR', -44, 0), FB('WR', 44, 0), FB('RB', 14, 8)],
    },
    {
      name: 'Bunch',
      positions: [FB('C', 0, 0), FB('QB', 0, 7), FB('WR', 26, 0), FB('WR', 37, -1.5), FB('WR', 48, 0)],
    },
    {
      name: 'D · 2-3',
      positions: [FB('LB', -16, -7), FB('LB', 16, -7), FB('CB', -44, -6), FB('CB', 44, -6), FB('S', 0, -13)],
    },
  ],
};

export function footballFormations(size: number): Formation[] {
  const forms = FOOTBALL_FORMS[size] ?? FOOTBALL_FORMS[11] ?? [];
  return forms.map((f) => ({ ...f, w: 12.5 }));
}

/* ---------- lacrosse (box is 66 x 116 yd; goals 15 yd in from each end line) ---------- */

export const LAX_SHAPES: Readonly<Record<number, readonly string[]>> = {
  3: ['1-1-1'],
  4: ['1-2-1', '2-1-1', '1-1-2'],
  5: ['2-2-1', '1-2-2', '2-1-2'],
  6: ['2-2-2', '3-1-2', '2-3-1'],
  7: ['3-2-2', '2-3-2', '2-2-3'],
  8: ['3-3-2', '2-3-3', '3-2-3'],
  9: ['3-3-3', '2-4-3', '3-4-2'],
  10: ['3-4-3', '4-3-3', '3-3-4'],
};

export const LAX_CODES: Readonly<Record<string, Readonly<Record<number, readonly string[]>>>> = {
  ATT: { 1: ['A'], 2: ['LA', 'RA'], 3: ['LA', 'X', 'RA'], 4: ['LA', 'LX', 'RX', 'RA'] },
  MID: {
    1: ['M'],
    2: ['LM', 'RM'],
    3: ['LM', 'CM', 'RM'],
    4: ['LM', 'LCM', 'RCM', 'RM'],
    5: ['LM', 'LCM', 'CM', 'RCM', 'RM'],
  },
  DEF: { 1: ['D'], 2: ['LD', 'RD'], 3: ['LD', 'CD', 'RD'], 4: ['LD', 'LCD', 'RCD', 'RD'] },
};

const laxFallbackShape = (n: number): string => {
  const a = Math.round(n / 3);
  const c = Math.round(n / 3);
  const b = n - a - c;
  return `${a}-${b}-${c}`;
};

/** Lacrosse formations, read defense → midfield → attack like soccer. */
export function lacrosseFormations(size: number, gk: boolean): Formation[] {
  const n = size - (gk ? 1 : 0);
  const names = LAX_SHAPES[n] ?? [laxFallbackShape(n)];
  return names.map((name) => {
    const parts = name.split('-').map(Number); // DEF-MID-ATT
    const roles = ['DEF', 'MID', 'ATT'] as const;
    const rows: Record<string, number> = { DEF: gk ? 66 : 72, MID: 48, ATT: gk ? 29 : 26 };
    const maxRow = Math.max(...parts, gk ? 1 : 0);
    const w = Math.min(17, 100 / (maxRow + 1) - 2);
    const positions: Position[] = [];
    for (let r = 2; r >= 0; r--) {
      const k = parts[r] ?? 0;
      const role = roles[r];
      if (!k || !role) continue;
      const codes = LAX_CODES[role]?.[k] ?? Array.from({ length: k }, (_, i) => `${role[0] ?? ''}${i + 1}`);
      for (let i = 0; i < k; i++) {
        const code = codes[i] ?? role;
        let y = rows[role] ?? 48;
        if (role === 'ATT' && code.includes('X')) y = 9;
        positions.push({ role, code, x: (100 * (i + 1)) / (k + 1), y });
      }
    }
    if (gk) positions.push({ role: 'GK', code: 'GK', x: 50, y: 80 });
    return { name, positions, w };
  });
}
