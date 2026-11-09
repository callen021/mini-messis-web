import {
  baseballFormations,
  basketballFormations,
  footballFormations,
  lacrosseFormations,
  soccerFormations,
} from './formations';
import { type Formation, type SportDefinition, type SportKey } from './types';

export { ALL_SPORTS, ENABLED_SPORTS, isSportKey } from './types';

const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const lookup =
  (map: Record<string, string>) =>
  (role: string): string =>
    map[role] ?? role;

/** Sport definitions, ported 1:1 from the legacy `SPORTS` object. Rules live here, never in the database. */
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
    defaultColors: { ST: '#7b3fe4', MID: '#7b3fe4', DEF: '#7b3fe4', GK: '#14b8a6' },
    defaultFormation: '3-3',
    group: (r) => r,
    label: lookup({ ST: 'STRIKER', MID: 'MIDFIELD', DEF: 'DEFENDER', GK: 'GOALIE' }),
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
    defaultColors: { P: '#1f3a93', C: '#c0392b', IF: '#2e86c1', OF: '#27ae60' },
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
    defaultColors: { G: '#6c3fc5', F: '#e67e22', C: '#16a085' },
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
      QB: '#c0392b',
      RB: '#e67e22',
      OL: '#34495e',
      REC: '#27ae60',
      DL: '#8e44ad',
      LB: '#2980b9',
      DB: '#16a085',
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
    defaultColors: { ATT: '#7b3fe4', MID: '#7b3fe4', DEF: '#7b3fe4', GK: '#14b8a6' },
    defaultFormation: '3-3-3',
    group: (r) => r,
    label: lookup({ ATT: 'ATTACK', MID: 'MIDFIELD', DEF: 'DEFENSE', GK: 'GOALIE' }),
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
