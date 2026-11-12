import {
  baseballFormations,
  basketballFormations,
  footballFormations,
  lacrosseFormations,
  soccerFormations,
} from './formations';
import { type Formation, type ScoringRules, type SportDefinition, type SportKey } from './types';

export { ALL_SPORTS, ENABLED_SPORTS, isSportKey } from './types';

const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const lookup =
  (map: Record<string, string>) =>
  (role: string): string =>
    map[role] ?? role;

const PERIODS = { key: 'periods_played', label: 'QP', title: 'Periods played' } as const;

/** Soccer and lacrosse: goals with an optional assist. */
const GOAL_SCORING: ScoringRules = {
  events: [{ type: 'goal', label: 'Goal', noun: 'goal', points: 1 }],
  panel: 'goal',
  assists: true,
  unitPlural: 'Goals',
  columns: [
    { key: 'goals', label: 'G', title: 'Goals' },
    { key: 'assists', label: 'A', title: 'Assists' },
    PERIODS,
  ],
  hot: 'goals',
  profile: [
    { key: 'goals', label: 'Goals', title: 'Goals' },
    { key: 'assists', label: 'Assists', title: 'Assists' },
    { key: 'periods_played', label: 'Periods', title: 'Periods played' },
    { key: 'games_played', label: 'Games', title: 'Games played' },
  ],
};

const BASKETBALL_SCORING: ScoringRules = {
  events: [
    { type: 'free_throw', label: '+1', noun: 'free throw', points: 1 },
    { type: 'field_goal', label: '+2', noun: 'field goal', points: 2 },
    { type: 'three_pointer', label: '+3', noun: 'three-pointer', points: 3 },
  ],
  panel: 'points',
  assists: false,
  unitPlural: 'Points',
  columns: [
    { key: 'points', label: 'PTS', title: 'Points' },
    { key: 'field_goals', label: 'FG', title: 'Field goals' },
    { key: 'three_pointers', label: '3PT', title: 'Three-pointers' },
    { key: 'free_throws', label: 'FT', title: 'Free throws' },
    PERIODS,
  ],
  hot: 'points',
  profile: [
    { key: 'points', label: 'Points', title: 'Points' },
    { key: 'field_goals', label: 'Field goals', title: 'Field goals' },
    { key: 'three_pointers', label: 'Threes', title: 'Three-pointers' },
    { key: 'free_throws', label: 'Free throws', title: 'Free throws' },
  ],
};

const BASEBALL_SCORING: ScoringRules = {
  events: [{ type: 'run', label: 'Run', noun: 'run', points: 1 }],
  panel: 'run',
  assists: false,
  unitPlural: 'Runs',
  columns: [
    { key: 'runs', label: 'R', title: 'Runs' },
    { key: 'at_bats', label: 'AB', title: 'At-bats' },
    { key: 'hits', label: 'H', title: 'Hits' },
    { key: 'doubles', label: '2B', title: 'Doubles' },
    { key: 'triples', label: '3B', title: 'Triples' },
    { key: 'home_runs', label: 'HR', title: 'Home runs' },
    { key: 'rbi', label: 'RBI', title: 'Runs batted in' },
    { key: 'walks', label: 'BB', title: 'Walks (incl. hit by pitch)' },
    { key: 'strikeouts', label: 'K', title: 'Strikeouts' },
    { key: 'avg', label: 'AVG', title: 'Batting average (hits / at-bats)' },
    { key: 'periods_played', label: 'INN', title: 'Innings in the field' },
  ],
  hot: 'hits',
  profile: [
    { key: 'hits', label: 'Hits', title: 'Hits' },
    { key: 'runs', label: 'Runs', title: 'Runs' },
    { key: 'home_runs', label: 'Home runs', title: 'Home runs' },
    { key: 'avg', label: 'Avg', title: 'Batting average' },
  ],
};

/** Football is disabled; rules exist so the type is total. */
const FOOTBALL_SCORING: ScoringRules = {
  events: [
    { type: 'touchdown', label: 'TD', noun: 'touchdown', points: 6 },
    { type: 'field_goal', label: 'FG', noun: 'field goal', points: 3 },
    { type: 'extra_point', label: 'XP', noun: 'extra point', points: 1 },
    { type: 'two_point', label: '2PT', noun: 'two-point conversion', points: 2 },
    { type: 'safety', label: 'SAF', noun: 'safety', points: 2 },
  ],
  panel: 'points',
  assists: false,
  unitPlural: 'Points',
  columns: [{ key: 'points', label: 'PTS', title: 'Points' }, PERIODS],
  hot: 'points',
  profile: [
    { key: 'points', label: 'Points', title: 'Points' },
    { key: 'periods_played', label: 'Periods', title: 'Periods played' },
    { key: 'games_played', label: 'Games', title: 'Games played' },
  ],
};

/** Sport definitions, ported 1:1 from the legacy `SPORTS` object. Rules live here, never in the database. */
/** Every jersey colour group of a new team starts as this red, goalkeeper included (D87). */
export const DEFAULT_JERSEY = '#E22400';

export const SPORTS: Readonly<Record<SportKey, SportDefinition>> = {
  soccer: {
    key: 'soccer',
    name: 'Soccer',
    emoji: '⚽',
    field: 'Field',
    sizes: range(3, 11),
    defaultSize: 7,
    hasGK: true,
    defaultPeriods: 4,
    periodOptions: [2, 3, 4],
    games: true,
    periodName: (n) => (n === 2 ? 'Half' : 'Quarter'),
    unit: 'on the field',
    groups: [
      ['ST', 'Strikers'],
      ['MID', 'Midfielders'],
      ['DEF', 'Defenders'],
      ['GK', 'Goalkeeper'],
    ],
    defaultColors: { ST: DEFAULT_JERSEY, MID: DEFAULT_JERSEY, DEF: DEFAULT_JERSEY, GK: DEFAULT_JERSEY },
    defaultFormation: '3-3',
    group: (r) => r,
    label: lookup({ ST: 'STRIKER', MID: 'MIDFIELD', DEF: 'DEFENDER', GK: 'GOALIE' }),
    scoring: GOAL_SCORING,
    formations: (t) => soccerFormations(t.size, t.gk),
    jersey: 'soccer',
    sample: [
      'Nolan',
      'Teddy',
      'Jack',
      'Weston',
      'Sam',
      'Milo',
      'Quincy',
      'Hal',
      'Nick',
      'Atlas',
      'Eli',
      'Rowan',
      'Jonah',
      'Wes',
    ],
  },
  baseball: {
    key: 'baseball',
    name: 'Baseball',
    emoji: '⚾',
    field: 'Diamond',
    sizes: range(6, 12),
    defaultSize: 9,
    hasGK: false,
    defaultPeriods: 6,
    periodOptions: range(3, 9),
    periodName: () => 'Inning',
    unit: 'in the field',
    lineup: true,
    groups: [
      ['P', 'Pitcher'],
      ['C', 'Catcher'],
      ['IF', 'Infielders'],
      ['OF', 'Outfielders'],
    ],
    defaultColors: { P: DEFAULT_JERSEY, C: DEFAULT_JERSEY, IF: DEFAULT_JERSEY, OF: DEFAULT_JERSEY },
    group: (r) =>
      r === 'P' ? 'P' : r === 'C' ? 'C' : ['LF', 'CF', 'RF', 'LCF', 'RCF'].includes(r) ? 'OF' : 'IF',
    label: lookup({
      P: 'PITCHER',
      C: 'CATCHER',
      '1B': 'FIRST',
      '2B': 'SECOND',
      SS: 'SHORTSTOP',
      '3B': 'THIRD',
      LF: 'LEFT',
      CF: 'CENTER',
      RF: 'RIGHT',
      LCF: 'LEFT CTR',
      RCF: 'RIGHT CTR',
      ROV: 'ROVER',
    }),
    scoring: BASEBALL_SCORING,
    formations: (t) => baseballFormations(t.size),
    jersey: 'baseball',
    sample: [
      'Mason',
      'Owen',
      'Liam',
      'Henry',
      'Jude',
      'Beau',
      'Theo',
      'Cal',
      'Rhett',
      'Ezra',
      'Finn',
      'Oliver',
    ],
  },
  basketball: {
    key: 'basketball',
    name: 'Basketball',
    emoji: '🏀',
    field: 'Court',
    sizes: range(3, 5),
    defaultSize: 5,
    hasGK: false,
    defaultPeriods: 4,
    periodOptions: [2, 4],
    periodName: (n) => (n === 2 ? 'Half' : 'Quarter'),
    unit: 'on the court',
    groups: [
      ['G', 'Guards'],
      ['F', 'Forwards'],
      ['C', 'Center'],
    ],
    defaultColors: { G: DEFAULT_JERSEY, F: DEFAULT_JERSEY, C: DEFAULT_JERSEY },
    group: (r) => (['PG', 'SG', 'G'].includes(r) ? 'G' : r === 'C' ? 'C' : 'F'),
    label: lookup({
      PG: 'POINT',
      SG: 'SHOOTING',
      SF: 'SMALL FWD',
      PF: 'POWER FWD',
      C: 'CENTER',
      G: 'GUARD',
      F: 'FORWARD',
    }),
    scoring: BASKETBALL_SCORING,
    formations: (t) => basketballFormations(t.size),
    jersey: 'basketball',
    sample: ['Ty', 'Max', 'Leo', 'Jaxon', 'Kai', 'Ben', 'Asher', 'Levi'],
  },
  football: {
    key: 'football',
    name: 'Football',
    emoji: '🏈',
    field: 'Field',
    sizes: [5, 6, 7, 8, 9, 11],
    defaultSize: 11,
    hasGK: false,
    defaultPeriods: 4,
    periodOptions: [2, 4],
    periodName: (n) => (n === 2 ? 'Half' : 'Quarter'),
    unit: 'on the field',
    groups: [
      ['QB', 'Quarterback'],
      ['RB', 'Running backs'],
      ['OL', 'Offensive line'],
      ['REC', 'Receivers & tight ends'],
      ['DL', 'Defensive line'],
      ['LB', 'Linebackers'],
      ['DB', 'Defensive backs'],
    ],
    defaultColors: {
      QB: DEFAULT_JERSEY,
      RB: DEFAULT_JERSEY,
      OL: DEFAULT_JERSEY,
      REC: DEFAULT_JERSEY,
      DL: DEFAULT_JERSEY,
      LB: DEFAULT_JERSEY,
      DB: DEFAULT_JERSEY,
    },
    group: (r) =>
      r === 'QB'
        ? 'QB'
        : ['RB', 'FB', 'HB'].includes(r)
          ? 'RB'
          : ['C', 'LG', 'RG', 'LT', 'RT', 'G', 'T'].includes(r)
            ? 'OL'
            : ['WR', 'TE'].includes(r)
              ? 'REC'
              : ['DE', 'DT', 'NT'].includes(r)
                ? 'DL'
                : ['LB', 'MLB'].includes(r)
                  ? 'LB'
                  : 'DB',
    label: (r) => r,
    scoring: FOOTBALL_SCORING,
    formations: (t) => footballFormations(t.size),
    jersey: 'football',
    sample: [
      'Brooks',
      'Cash',
      'Dax',
      'Easton',
      'Gage',
      'Hudson',
      'Knox',
      'Lane',
      'Mav',
      'Nash',
      'Reid',
      'Tucker',
      'Wade',
    ],
  },
  lacrosse: {
    key: 'lacrosse',
    name: 'Lacrosse',
    emoji: '🥍',
    field: 'Field',
    sizes: range(4, 11),
    defaultSize: 10,
    hasGK: true,
    defaultPeriods: 4,
    periodOptions: [2, 4],
    games: true,
    periodName: (n) => (n === 2 ? 'Half' : 'Quarter'),
    unit: 'on the field',
    groups: [
      ['ATT', 'Attack'],
      ['MID', 'Midfield'],
      ['DEF', 'Defense'],
      ['GK', 'Goalie'],
    ],
    defaultColors: { ATT: DEFAULT_JERSEY, MID: DEFAULT_JERSEY, DEF: DEFAULT_JERSEY, GK: DEFAULT_JERSEY },
    defaultFormation: '3-3-3',
    group: (r) => r,
    label: lookup({ ATT: 'ATTACK', MID: 'MIDFIELD', DEF: 'DEFENSE', GK: 'GOALIE' }),
    scoring: GOAL_SCORING,
    formations: (t) => lacrosseFormations(t.size, t.gk),
    jersey: 'soccer',
    sample: [
      'Bodie',
      'Cooper',
      'Decker',
      'Grady',
      'Holden',
      'Jett',
      'Kellan',
      'Miles',
      'Ryder',
      'Sully',
      'Tate',
      'Wyatt',
      'Zane',
    ],
  },
};

/** The sport's preferred formation, or the first one. */
export function defaultFormation(forms: readonly Formation[], sport: SportDefinition): Formation {
  const found = sport.defaultFormation ? forms.find((f) => f.name === sport.defaultFormation) : undefined;
  const first = forms[0];
  if (!found && !first) throw new Error(`No formations for ${sport.name}`);
  return found ?? (first as Formation);
}

/** Find a formation by name, falling back to the first (legacy `formation(p)`). */
export function formationByName(forms: readonly Formation[], name: string): Formation {
  const found = forms.find((f) => f.name === name) ?? forms[0];
  if (!found) throw new Error('No formations available');
  return found;
}

/** "quarters" / "halves" / "innings": the plural, lower-case unless `cap` (D63). */
export function periodPlural(sport: SportDefinition, periodCount: number, cap = false): string {
  const name = sport.periodName(periodCount);
  const plural = name === 'Half' ? 'Halves' : `${name}s`;
  return cap ? plural : plural.toLowerCase();
}

/** "Q1" / "H2" / "Inning 3" — short period title for a card. */
export function shortPeriod(sport: SportDefinition, periodCount: number, index: number): string {
  const name = sport.periodName(periodCount);
  return name === 'Inning' ? `Inning ${index + 1}` : `${name[0] ?? ''}${index + 1}`;
}

/** "1" / "Q1" — the tiny label above a rotation chip. */
export function chipLabel(sport: SportDefinition, periodCount: number, index: number): string {
  const name = sport.periodName(periodCount);
  return name === 'Inning' ? String(index + 1) : `${name[0] ?? ''}${index + 1}`;
}

/** The event kind for a stored `event_type`, falling back to the sport's first kind. */
export function eventKind(sport: SportDefinition, type: string) {
  return sport.scoring.events.find((e) => e.type === type) ?? sport.scoring.events[0];
}
