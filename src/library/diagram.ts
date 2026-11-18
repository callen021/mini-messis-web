import { fillLabel, type Overrides, paramNumber } from './params';
import {
  type ArrowKind,
  type DiagramPoint,
  type DiagramSpec,
  type MeasureSide,
  type ParamDef,
  type PlayerRole,
} from './types';

/**
 * Layout of a drill diagram (D123): the item's structured elements plus the team's numbers in,
 * plain SVG coordinates out. Diagram coordinates are cone gaps, so the picture is a schematic
 * that always fits the phone's width; the spacing label carries the real distance. Marks keep one
 * size whatever the number of cones.
 */
export interface DiagramLayout {
  width: number;
  height: number;
  cones: { x: number; y: number }[];
  players: { x: number; y: number; role: PlayerRole; label: string }[];
  arrows: { kind: ArrowKind; d: string; head: string; faded: boolean }[];
  /** A level measurement runs x1–x2 at y1 = y2; an upright one runs y1–y2 at x1 = x2, its label turned. */
  measures: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    upright: boolean;
    label: string;
    labelX: number;
    labelY: number;
  }[];
}

export const DIAGRAM_WIDTH = 340;
const PAD = { left: 34, right: 26, top: 48, bottom: 20 };
/** Padding on a side that carries a measurement, and how far the line sits from its points. */
const MEASURE_PAD = { left: 46, right: 46, bottom: 50 };
const MEASURE_OFF = 24;
const MAX_GAP = 92;
const MAX_CONES = 12;
/** Radius of a player mark; arrows that start or end on a player stop at its edge. */
export const PLAYER_R = 13;
const HEAD = 9;

type XY = readonly [number, number];

/** Shift every cone anchor of the group `id` by `k` ("c0" → "c2"); null when that cone does not exist. */
function shift(p: DiagramPoint, id: string, k: number, count: number): DiagramPoint | null {
  const move = (anchor: string): string | null => {
    const m = new RegExp(`^${id}(\\d+)$`).exec(anchor);
    if (!m) return anchor;
    const i = Number(m[1]) + k;
    return i < count ? `${id}${i}` : null;
  };
  if (typeof p === 'string') return move(p);
  if (p.length === 3) {
    const a = move(p[0]);
    return a === null ? null : [a, p[1], p[2]];
  }
  return p;
}

function wavy(a: XY, b: XY): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 18) return `M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}`;
  const ux = dx / len;
  const uy = dy / len;
  const waveLen = len - HEAD - 2; // the last stretch runs straight into the arrowhead
  const waves = Math.max(2, Math.round(waveLen / 14));
  let d = `M${f(a[0])} ${f(a[1])}`;
  const n = waves * 8;
  for (let i = 1; i <= n; i++) {
    const t = (i / n) * waveLen;
    const off = Math.sin((i / n) * waves * 2 * Math.PI) * 3.2;
    d += `L${f(a[0] + ux * t - uy * off)} ${f(a[1] + uy * t + ux * off)}`;
  }
  return `${d}L${f(b[0])} ${f(b[1])}`;
}
const f = (n: number): string => (Math.round(n * 10) / 10).toString();

function arrowHead(a: XY, b: XY): string {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  const bx = b[0] - ux * HEAD;
  const by = b[1] - uy * HEAD;
  const w = HEAD * 0.5;
  return `${f(b[0])},${f(b[1])} ${f(bx - uy * w)},${f(by + ux * w)} ${f(bx + uy * w)},${f(by - ux * w)}`;
}

export function layoutDiagram(
  spec: DiagramSpec,
  defs: readonly ParamDef[],
  overrides: Overrides,
  width = DIAGRAM_WIDTH,
): DiagramLayout {
  const value = (v: number | string): number => {
    if (typeof v === 'number') return v;
    const def = defs.find((d) => `$${d.key}` === v);
    return (def && paramNumber(def, overrides)) ?? 0;
  };

  // 1. anchors, in cone gaps
  const anchors = new Map<string, XY>();
  const counts = new Map<string, number>();
  const conePts: XY[] = [];
  for (const el of spec.elements) {
    if (el.type !== 'cones') continue;
    const count = Math.max(0, Math.min(MAX_CONES, Math.round(value(el.count))));
    counts.set(el.id, count);
    for (let i = 0; i < count; i++) {
      const p: XY = [el.from[0] + el.step[0] * i, el.from[1] + el.step[1] * i];
      anchors.set(`${el.id}${i}`, p);
      conePts.push(p);
    }
  }
  const at = (p: DiagramPoint | null): XY | null => {
    if (p === null) return null;
    if (typeof p === 'string') return anchors.get(p) ?? null;
    if (p.length === 2) return p;
    const a = anchors.get(p[0]);
    return a ? [a[0] + p[1], a[1] + p[2]] : null;
  };
  const playerPts: { p: XY; role: PlayerRole; label: string }[] = [];
  const playerIds = new Set<string>();
  for (const el of spec.elements) {
    if (el.type !== 'player') continue;
    const p = at(el.at);
    if (!p) continue;
    anchors.set(el.id, p);
    playerIds.add(el.id);
    playerPts.push({ p, role: el.role, label: el.label });
  }
  const onPlayer = (p: DiagramPoint): boolean => typeof p === 'string' && playerIds.has(p);

  // 2. arrows and measures; a repeated arrow is drawn once per gap between the cones of its group
  const arrowPts: { kind: ArrowKind; a: XY; b: XY; trimA: boolean; trimB: boolean; faded: boolean }[] = [];
  const measurePts: { a: XY; b: XY; label: string; side: MeasureSide }[] = [];
  for (const el of spec.elements) {
    if (el.type === 'measure') {
      const a = at(el.from);
      const b = at(el.to);
      if (a && b) {
        const upright = Math.abs(b[1] - a[1]) > Math.abs(b[0] - a[0]);
        const fits = upright
          ? el.side === 'left' || el.side === 'right'
          : el.side === 'above' || el.side === 'below';
        const side: MeasureSide = fits && el.side ? el.side : upright ? 'left' : 'above';
        measurePts.push({ a, b, label: fillLabel(el.label, defs, overrides), side });
      }
    }
    if (el.type !== 'arrow') continue;
    const count = el.repeat ? (counts.get(el.repeat) ?? 0) : 0;
    const times = el.repeat ? Math.max(0, count - 1) : 1;
    for (let k = 0; k < times; k++) {
      const a = at(el.repeat ? shift(el.from, el.repeat, k, count) : el.from);
      const b = at(el.repeat ? shift(el.to, el.repeat, k, count) : el.to);
      if (!a || !b) continue;
      arrowPts.push({ kind: el.kind, a, b, trimA: onPlayer(el.from), trimB: onPlayer(el.to), faded: k > 0 });
    }
  }

  // 3. fit the width
  const all: XY[] = [
    ...conePts,
    ...playerPts.map((p) => p.p),
    ...arrowPts.flatMap((a) => [a.a, a.b]),
    ...measurePts.flatMap((m) => [m.a, m.b]),
  ];
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const minX = all.length ? Math.min(...xs) : 0;
  const maxX = all.length ? Math.max(...xs) : 0;
  const minY = all.length ? Math.min(...ys) : 0;
  const maxY = all.length ? Math.max(...ys) : 0;
  const has = (side: MeasureSide): boolean => measurePts.some((m) => m.side === side);
  const pad = {
    left: has('left') ? MEASURE_PAD.left : PAD.left,
    right: has('right') ? MEASURE_PAD.right : PAD.right,
    top: PAD.top,
    bottom: has('below') ? MEASURE_PAD.bottom : PAD.bottom,
  };
  const room = width - pad.left - pad.right;
  const gap = maxX > minX ? Math.min(MAX_GAP, room / (maxX - minX)) : MAX_GAP;
  const left = pad.left + (room - (maxX - minX) * gap) / 2;
  const px = (p: XY): XY => [left + (p[0] - minX) * gap, pad.top + (p[1] - minY) * gap];
  const height = Math.round(pad.top + (maxY - minY) * gap + pad.bottom);

  const arrows = arrowPts.map(({ kind, a, b, trimA, trimB, faded }) => {
    let pa = px(a);
    let pb = px(b);
    const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) || 1;
    const ux = (pb[0] - pa[0]) / len;
    const uy = (pb[1] - pa[1]) / len;
    if (trimA) pa = [pa[0] + ux * (PLAYER_R + 3), pa[1] + uy * (PLAYER_R + 3)];
    if (trimB) pb = [pb[0] - ux * (PLAYER_R + 4), pb[1] - uy * (PLAYER_R + 4)];
    // the line stops inside the arrowhead so its square end never pokes through the tip
    const end: XY = [pb[0] - ux * (HEAD - 2), pb[1] - uy * (HEAD - 2)];
    const d = kind === 'dribble' ? wavy(pa, end) : `M${f(pa[0])} ${f(pa[1])}L${f(end[0])} ${f(end[1])}`;
    return { kind, d, head: arrowHead(pa, pb), faded };
  });

  const measures = measurePts.map(({ a, b, label, side }) => {
    const pa = px(a);
    const pb = px(b);
    const half = (label.length * 6.6) / 2 + 6; // 12px text, estimated; keeps the label on the grass
    if (side === 'left' || side === 'right') {
      const x = side === 'left' ? Math.min(pa[0], pb[0]) - MEASURE_OFF : Math.max(pa[0], pb[0]) + MEASURE_OFF;
      const mid = (pa[1] + pb[1]) / 2;
      return {
        x1: x,
        y1: pa[1],
        x2: x,
        y2: pb[1],
        upright: true,
        label,
        labelX: side === 'left' ? x - 7 : x + 16,
        labelY: Math.max(half, Math.min(height - half, mid)),
      };
    }
    const y = side === 'below' ? Math.max(pa[1], pb[1]) + MEASURE_OFF : Math.min(pa[1], pb[1]) - MEASURE_OFF;
    const mid = (pa[0] + pb[0]) / 2;
    return {
      x1: pa[0],
      y1: y,
      x2: pb[0],
      y2: y,
      upright: false,
      label,
      labelX: Math.max(half, Math.min(width - half, mid)),
      labelY: side === 'below' ? y + 18 : y - 9,
    };
  });

  return {
    width,
    height,
    cones: conePts.map((p) => ({ x: px(p)[0], y: px(p)[1] })),
    players: playerPts.map(({ p, role, label }) => ({ x: px(p)[0], y: px(p)[1], role, label })),
    arrows,
    measures,
  };
}
