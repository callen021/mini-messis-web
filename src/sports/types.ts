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
  /** How this sport scores and which per-player stat columns it shows. */
  scoring: ScoringRules;
}

/** One kind of scoring event, stored as `score_events.event_type`; points are validated server-side too. */
export interface ScoreEventKind {
  type: string;
  /** Short label on a button: 'Goal', '+2', 'Run'. */
  label: string;
  /** Long label in the log: 'goal', 'field goal', 'run'. */
  noun: string;
  points: number;
}

export type ScorePanelKind = 'goal' | 'points' | 'run';

export interface StatColumn {
  key: StatKey;
  /** Column header: 'G', 'PTS', 'AVG'. */
  label: string;
  /** Tooltip / accessible name. */
  title: string;
}

export type StatKey =
  | 'games_played'
  | 'periods_played'
  | 'minutes_played'
  | 'goals'
  | 'assists'
  | 'points'
  | 'field_goals'
  | 'three_pointers'
  | 'free_throws'
  | 'runs'
  | 'at_bats'
  | 'hits'
  | 'doubles'
  | 'triples'
  | 'home_runs'
  | 'rbi'
  | 'walks'
  | 'strikeouts'
  | 'avg';

export interface ScoringRules {
  /** Event kinds in display order; the first is the default (`goal`, `field_goal`, `run`). */
  events: readonly ScoreEventKind[];
  /** Score panel layout: one Add button per side, +1/+2/+3 per side, or run buttons with the inning. */
  panel: ScorePanelKind;
  /** Whether our events record an assist. */
  assists: boolean;
  /** 'Goals' / 'Points' / 'Runs' for tiles ('Goals for', 'Against'). */
  unitPlural: string;
  /** Stat table columns in order (the name column is implicit). */
  columns: readonly StatColumn[];
  /** The column highlighted in the tint when non-zero (legacy: goals). */
  hot: StatKey;
  /** Four season tiles on the player page. */
  profile: readonly StatColumn[];
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
