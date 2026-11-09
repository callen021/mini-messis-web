/** Sport keys. Football is defined but disabled in the UI, exactly as the legacy `ENABLED_SPORTS`. */
export type SportKey = 'soccer' | 'baseball' | 'basketball' | 'lacrosse' | 'football';

export const ALL_SPORTS: readonly SportKey[] = ['soccer', 'baseball', 'basketball', 'lacrosse', 'football'];
export const ENABLED_SPORTS: readonly SportKey[] = ['soccer', 'baseball', 'basketball', 'lacrosse'];

export const isSportKey = (v: unknown): v is SportKey =>
  typeof v === 'string' && (ALL_SPORTS as readonly string[]).includes(v);

/** One spot on the field. `x`/`y` are percent of the field box; `code` is the short label (LCB, SS, PG…). */
export interface Position {
  /** Role used for grouping/colors and for remapping between formations (DEF, MID, P, C, 1B…). */
  role: string;
  /** Short code shown on the jersey; defaults to the role when a sport has no separate codes. */
  code: string;
  x: number;
  y: number;
}

export interface Formation {
  name: string;
  positions: readonly Position[];
  /** Jersey width as a percent of the field width. */
  w: number;
}

export type JerseyStyle = 'soccer' | 'baseball' | 'basketball' | 'football';

/** Team settings that formation generators depend on. */
export interface TeamShape {
  size: number;
  gk: boolean;
}

/** Period/game sizing a sport needs to describe itself. */
export interface SportDefinition {
  key: SportKey;
  name: string;
  emoji: string;
  /** Field / Diamond / Court — also the first tab's label. */
  field: 'Field' | 'Diamond' | 'Court';
  sizes: readonly number[];
  defaultSize: number;
  hasGK: boolean;
  defaultPeriods: number;
  periodOptions: readonly number[];
  /** "Quarter" / "Half" / "Inning" for a game with `n` periods. */
  periodName: (n: number) => string;
  /** "on the field" / "in the field" / "on the court". */
  unit: string;
  /** Baseball only: has a batting lineup. */
  lineup?: boolean;
  /** Position groups in display order: [groupKey, displayName]. */
  groups: readonly (readonly [string, string])[];
  defaultColors: Readonly<Record<string, string>>;
  /** Preferred formation name when one must be chosen. */
  defaultFormation?: string;
  /** Map a position role to its group key. */
  group: (role: string) => string;
  /** Long label for a role ("STRIKER", "SHORTSTOP"). */
  label: (role: string) => string;
  formations: (team: TeamShape) => Formation[];
  jersey: JerseyStyle;
  sample: readonly string[];
  /** Sports with games/scoring in the legacy app (all sports get games in the rebuild). */
  games?: boolean;
}

/** Slot assignment for one period of a plan: player ids by slot index ('' = open). */
export interface Period {
  formation: string;
  slots: string[];
  /** Slot indexes that were filled by Auto-fill (never hand-picked). */
  auto: number[];
}

/** The minimum a player needs to be for the engine. */
export interface EnginePlayer {
  id: string;
  name: string;
  active: boolean;
}
