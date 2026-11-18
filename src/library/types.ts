import { type Tables } from '@/lib/database.types';

/**
 * Practice library content (D123). An item's `content` column is JSON with one section per tab;
 * the page shows a tab for every section it finds, so a Tactics item or a later Video section is
 * a data change. Everything here is read defensively: content comes from the database.
 */
export type LibraryItemRow = Tables<'library_items'>;
export type LibraryItemSummary = Pick<
  LibraryItemRow,
  'id' | 'slug' | 'sport' | 'category' | 'title' | 'age_min' | 'age_max' | 'sort_order' | 'is_published'
>;

/** Sports that have a practice library so far (D123); the Settings row shows for these only. */
export const LIBRARY_SPORTS: readonly string[] = ['soccer'];

export const CATEGORY_LABEL: Readonly<Record<string, string>> = {
  fundamentals: 'Fundamentals',
  tactics: 'Tactics',
  position: 'Position-specific',
};
export const CATEGORY_ORDER = ['fundamentals', 'tactics', 'position'] as const;
export const categoryLabel = (key: string): string => CATEGORY_LABEL[key] ?? key;

/** "Ages 6–10", "Ages 6+", "Up to age 10", or nothing. */
export function ageText(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return min === max ? `Age ${min}` : `Ages ${min}–${max}`;
  if (min !== null) return `Ages ${min}+`;
  if (max !== null) return `Up to age ${max}`;
  return '';
}

export interface StepImage {
  /** Object path in the `practice-library` storage bucket. */
  path: string;
  width: number | null;
  height: number | null;
}
export interface LearnStep {
  title: string;
  text: string;
  image: StepImage | null;
}
export interface LearnSection {
  tagline: string;
  focus: string;
  steps: LearnStep[];
  cues: string[];
  /** Small captioned close-ups ("Plant Foot", "Beside the Ball"); most items have none. */
  tips: { title: string; text: string; image: StepImage | null }[];
  compare: { wrong: string; right: string }[];
  bigPicture: string;
  /** A ticked list between the big picture's opening line and its closing one; usually empty. */
  bigPicturePoints: string[];
  bigPictureClose: string;
}

export type ParamType = 'count' | 'distance' | 'duration' | 'text';
export interface ParamDef {
  key: string;
  label: string;
  type: ParamType;
  /** A number, a [low, high] range, a text, or null for "not set". */
  default: number | [number, number] | string | null;
  min: number | null;
  max: number | null;
  step: number;
  adjustable: boolean;
}

/** [x, y] in cone gaps, an anchor id, or an anchor with an offset. */
export type DiagramPoint = [number, number] | string | [string, number, number];
export type ArrowKind = 'pass' | 'touch' | 'dribble';
export type PlayerRole = 'passer' | 'receiver' | 'attacker' | 'defender';
const PLAYER_ROLES: readonly PlayerRole[] = ['passer', 'receiver', 'attacker', 'defender'];
/** Where a measurement is drawn: above or below a level one, left or right of an upright one. */
export type MeasureSide = 'above' | 'below' | 'left' | 'right';
const MEASURE_SIDES: readonly MeasureSide[] = ['above', 'below', 'left', 'right'];
export type DiagramElement =
  | { type: 'cones'; id: string; from: [number, number]; step: [number, number]; count: number | string }
  | { type: 'player'; id: string; role: PlayerRole; label: string; at: DiagramPoint }
  | { type: 'arrow'; kind: ArrowKind; from: DiagramPoint; to: DiagramPoint; repeat: string | null }
  | { type: 'measure'; from: DiagramPoint; to: DiagramPoint; label: string; side: MeasureSide | null };
export interface DiagramSpec {
  elements: DiagramElement[];
}

export interface SetupSection {
  params: ParamDef[];
  diagram: DiagramSpec | null;
  /** What the drill is for, in one sentence; empty when the item gives none. */
  goal: string;
  steps: string[];
  equipment: string[];
}

export interface LibraryContent {
  learn: LearnSection | null;
  setup: SetupSection | null;
}

/* ---------- parsing ---------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strings = (v: unknown): string[] =>
  list(v).filter((s): s is string => typeof s === 'string' && s !== '');

function parseImage(v: unknown): StepImage | null {
  if (typeof v === 'string' && v) return { path: v, width: null, height: null };
  if (!isObj(v) || !str(v.path)) return null;
  return { path: str(v.path), width: num(v.width), height: num(v.height) };
}

function parseLearn(v: unknown): LearnSection | null {
  if (!isObj(v)) return null;
  return {
    tagline: str(v.tagline),
    focus: str(v.focus),
    steps: list(v.steps)
      .filter(isObj)
      .map((s) => ({ title: str(s.title), text: str(s.text), image: parseImage(s.image) })),
    cues: strings(v.cues),
    compare: list(v.compare)
      .filter(isObj)
      .map((c) => ({ wrong: str(c.wrong), right: str(c.right) }))
      .filter((c) => c.wrong || c.right),
    tips: list(v.tips)
      .filter(isObj)
      .map((t) => ({ title: str(t.title), text: str(t.text), image: parseImage(t.image) }))
      .filter((t) => t.title || t.text),
    bigPicture: str(v.big_picture),
    bigPicturePoints: strings(v.big_picture_points),
    bigPictureClose: str(v.big_picture_close),
  };
}

const PARAM_TYPES: readonly ParamType[] = ['count', 'distance', 'duration', 'text'];

function parseParam(v: unknown): ParamDef | null {
  if (!isObj(v) || !str(v.key)) return null;
  const type = PARAM_TYPES.find((t) => t === v.type) ?? 'text';
  const d = v.default;
  let def: ParamDef['default'] = null;
  if (typeof d === 'number' || typeof d === 'string') def = d;
  else if (Array.isArray(d) && d.length === 2 && num(d[0]) !== null && num(d[1]) !== null)
    def = [d[0] as number, d[1] as number];
  const min = num(v.min);
  const max = num(v.max);
  return {
    key: str(v.key),
    label: str(v.label) || str(v.key),
    type,
    default: def,
    min,
    max,
    step: num(v.step) ?? 1,
    // a number can only be adjusted inside a declared range
    adjustable: v.adjustable === true && type !== 'text' && min !== null && max !== null,
  };
}

function parsePoint(v: unknown): DiagramPoint | null {
  if (typeof v === 'string' && v) return v;
  if (!Array.isArray(v)) return null;
  if (v.length === 2 && num(v[0]) !== null && num(v[1]) !== null) return [v[0] as number, v[1] as number];
  if (v.length === 3 && typeof v[0] === 'string' && num(v[1]) !== null && num(v[2]) !== null)
    return [v[0], v[1] as number, v[2] as number];
  return null;
}
const pair = (v: unknown): [number, number] | null => {
  const p = parsePoint(v);
  return Array.isArray(p) && p.length === 2 ? p : null;
};

function parseElement(v: unknown): DiagramElement | null {
  if (!isObj(v)) return null;
  switch (v.type) {
    case 'cones': {
      const from = pair(v.from);
      const step = pair(v.step);
      const count = typeof v.count === 'number' || typeof v.count === 'string' ? v.count : null;
      if (!from || !step || count === null || !str(v.id)) return null;
      return { type: 'cones', id: str(v.id), from, step, count };
    }
    case 'player': {
      const at = parsePoint(v.at);
      if (!at || !str(v.id)) return null;
      return {
        type: 'player',
        id: str(v.id),
        role: PLAYER_ROLES.find((r) => r === v.role) ?? 'receiver',
        label: str(v.label),
        at,
      };
    }
    case 'arrow': {
      const from = parsePoint(v.from);
      const to = parsePoint(v.to);
      if (!from || !to) return null;
      const kind: ArrowKind = v.kind === 'pass' || v.kind === 'dribble' ? v.kind : 'touch';
      return { type: 'arrow', kind, from, to, repeat: str(v.repeat) || null };
    }
    case 'measure': {
      const from = parsePoint(v.from);
      const to = parsePoint(v.to);
      if (!from || !to) return null;
      return {
        type: 'measure',
        from,
        to,
        label: str(v.label),
        side: MEASURE_SIDES.find((s) => s === v.side) ?? null,
      };
    }
    default:
      return null; // an element kind this build does not know is skipped, not an error
  }
}

function parseSetup(v: unknown): SetupSection | null {
  if (!isObj(v)) return null;
  const elements = isObj(v.diagram)
    ? list(v.diagram.elements)
        .map(parseElement)
        .filter((e): e is DiagramElement => e !== null)
    : [];
  return {
    params: list(v.params)
      .map(parseParam)
      .filter((p): p is ParamDef => p !== null),
    diagram: elements.length ? { elements } : null,
    goal: str(v.goal),
    steps: strings(v.steps),
    equipment: strings(v.equipment),
  };
}

export function parseContent(content: unknown): LibraryContent {
  const c = isObj(content) ? content : {};
  return { learn: parseLearn(c.learn), setup: parseSetup(c.setup) };
}

/** The tabs an item has, in order. */
export type TabKey = 'learn' | 'setup';
export const TAB_LABEL: Readonly<Record<TabKey, string>> = { learn: 'Learn', setup: 'Coach Setup' };
export function tabsOf(content: LibraryContent): TabKey[] {
  const tabs: TabKey[] = [];
  if (content.learn) tabs.push('learn');
  if (content.setup) tabs.push('setup');
  return tabs;
}
