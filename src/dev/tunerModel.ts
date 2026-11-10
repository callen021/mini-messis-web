import { ALL_SPORTS, type SportKey } from '@/sports/types';

/**
 * Dev-only jersey-size tuner state: for each sport, the jersey width (percent of the field in the
 * flat view, of the stage in the 3D view) by the player count of a formation's widest row (1–5).
 * Rows wider than 5 use the 5 value.
 */
export const ROW_COUNTS = [1, 2, 3, 4, 5] as const;
export type RowCount = (typeof ROW_COUNTS)[number];
export type RowTable = Record<RowCount, number>;
export type TunerTable = Record<SportKey, RowTable>;

export const TUNER_MIN = 10;
export const TUNER_MAX = 40;
export const TUNER_STEP = 0.5;
export const TUNER_STORAGE_KEY = 'mm-dev-jersey-tuner';

const round = (v: number) => Math.round(v / TUNER_STEP) * TUNER_STEP;
export const clampWidth = (v: number) => Math.min(TUNER_MAX, Math.max(TUNER_MIN, round(v)));

/** Proposed default: min(28, 100/maxRow − 3) → 28, 28, 28, 22, 17. */
export const newRule = (maxRow: number) => clampWidth(Math.min(28, 100 / maxRow - 3));
/** The rule soccer formations ship with today: min(24, 100/(maxRow+1) − 2) → 24, 24, 23, 18, 14.5. */
export const currentRule = (maxRow: number) => clampWidth(Math.min(24, 100 / (maxRow + 1) - 2));

export function tableFrom(rule: (maxRow: number) => number): RowTable {
  return Object.fromEntries(ROW_COUNTS.map((n) => [n, rule(n)])) as RowTable;
}

export function defaultTuner(): TunerTable {
  return Object.fromEntries(ALL_SPORTS.map((s) => [s, tableFrom(newRule)])) as TunerTable;
}

/** Width for a formation whose widest row has `maxRow` players. */
export function tunerWidth(table: TunerTable, sport: SportKey, maxRow: number): number {
  const n = Math.min(5, Math.max(1, maxRow)) as RowCount;
  return table[sport][n];
}

function isRowTable(v: unknown): v is RowTable {
  return (
    !!v &&
    typeof v === 'object' &&
    ROW_COUNTS.every((n) => typeof (v as Record<string, unknown>)[String(n)] === 'number')
  );
}

export function loadTuner(): TunerTable {
  const base = defaultTuner();
  try {
    const raw = localStorage.getItem(TUNER_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const s of ALL_SPORTS) {
      const t = parsed[s];
      if (isRowTable(t)) base[s] = { ...t };
    }
  } catch {
    /* private mode or corrupt value: fall back to the defaults */
  }
  return base;
}

export function saveTuner(table: TunerTable) {
  try {
    localStorage.setItem(TUNER_STORAGE_KEY, JSON.stringify(table));
  } catch {
    /* ignore */
  }
}

/** The copyable TypeScript the final numbers become in src/sports/. */
export function tunerSnippet(table: TunerTable): string {
  const lines = ALL_SPORTS.map(
    (s) => `  ${s}: { ${ROW_COUNTS.map((n) => `${n}: ${table[s][n]}`).join(', ')} },`,
  );
  return [
    '/** 3D jersey width (% of stage) by widest-row player count. */',
    'export const PERSP_JERSEY_W: Readonly<Record<SportKey, RowWidths>> = {',
    ...lines,
    '};',
  ].join('\n');
}
