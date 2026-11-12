/**
 * Full names for the position codes printed on jerseys and rotation chips (D51). Codes come from
 * the formation generators; a code without an entry falls back to the role's long label.
 */
import { type Formation, type Period, type SportDefinition, type SportKey } from './types';

const SOCCER: Record<string, string> = {
  GK: 'Goalkeeper',
  SW: 'Sweeper',
  CB: 'Center back',
  LCB: 'Left center back',
  RCB: 'Right center back',
  LFB: 'Left fullback',
  RFB: 'Right fullback',
  LWB: 'Left wingback',
  RWB: 'Right wingback',
  CM: 'Center midfield',
  LM: 'Left midfield',
  RM: 'Right midfield',
  LCM: 'Left center midfield',
  RCM: 'Right center midfield',
  CDM: 'Defensive midfield',
  LDM: 'Left defensive midfield',
  RDM: 'Right defensive midfield',
  CAM: 'Attacking midfield',
  LAM: 'Left attacking midfield',
  RAM: 'Right attacking midfield',
  ST: 'Striker',
  LS: 'Left striker',
  RS: 'Right striker',
  LW: 'Left wing',
  RW: 'Right wing',
};

const BASEBALL: Record<string, string> = {
  P: 'Pitcher',
  C: 'Catcher',
  '1B': 'First base',
  '2B': 'Second base',
  '3B': 'Third base',
  SS: 'Shortstop',
  LF: 'Left field',
  CF: 'Center field',
  RF: 'Right field',
  LCF: 'Left-center field',
  RCF: 'Right-center field',
  ROV: 'Rover',
};

const BASKETBALL: Record<string, string> = {
  PG: 'Point guard',
  SG: 'Shooting guard',
  SF: 'Small forward',
  PF: 'Power forward',
  C: 'Center',
  G: 'Guard',
  F: 'Forward',
};

const LACROSSE: Record<string, string> = {
  GK: 'Goalie',
  A: 'Attack',
  LA: 'Left attack',
  RA: 'Right attack',
  X: 'X attack (behind the goal)',
  LX: 'Left X attack',
  RX: 'Right X attack',
  M: 'Midfield',
  LM: 'Left midfield',
  CM: 'Center midfield',
  RM: 'Right midfield',
  LCM: 'Left center midfield',
  RCM: 'Right center midfield',
  D: 'Defense',
  LD: 'Left defense',
  CD: 'Center defense',
  RD: 'Right defense',
  LCD: 'Left center defense',
  RCD: 'Right center defense',
};

const FOOTBALL: Record<string, string> = {
  QB: 'Quarterback',
  RB: 'Running back',
  FB: 'Fullback',
  HB: 'Halfback',
  WR: 'Wide receiver',
  TE: 'Tight end',
  C: 'Center',
  LG: 'Left guard',
  RG: 'Right guard',
  LT: 'Left tackle',
  RT: 'Right tackle',
  G: 'Guard',
  T: 'Tackle',
  DE: 'Defensive end',
  DT: 'Defensive tackle',
  NT: 'Nose tackle',
  LB: 'Linebacker',
  MLB: 'Middle linebacker',
  CB: 'Cornerback',
  S: 'Safety',
  FS: 'Free safety',
  SS: 'Strong safety',
  DB: 'Defensive back',
};

export const POSITION_NAMES: Readonly<Record<SportKey, Readonly<Record<string, string>>>> = {
  soccer: SOCCER,
  baseball: BASEBALL,
  basketball: BASKETBALL,
  lacrosse: LACROSSE,
  football: FOOTBALL,
};

/** "STRIKER" → "Striker". */
const humanize = (s: string): string => (s ? s[0]?.toUpperCase() + s.slice(1).toLowerCase() : s);

/** Full name for a code; a generated code such as DEF2 falls back to the role's label. */
export function positionName(sport: SportDefinition, code: string, role?: string): string {
  const named = POSITION_NAMES[sport.key][code];
  if (named) return named;
  const r = role ?? code.replace(/\d+$/, '');
  const label = sport.label(r);
  return label === r ? r : humanize(label);
}

export interface PositionKeyEntry {
  code: string;
  role: string;
  name: string;
}

/** The codes used anywhere in the current plan, in field order, each once (for the Position key). */
export function usedPositions(
  sport: SportDefinition,
  periods: readonly Period[],
  formationFor: (name: string) => Formation,
): PositionKeyEntry[] {
  const seen = new Map<string, PositionKeyEntry>();
  for (const q of periods) {
    for (const pos of formationFor(q.formation).positions) {
      if (!seen.has(pos.code))
        seen.set(pos.code, { code: pos.code, role: pos.role, name: positionName(sport, pos.code, pos.role) });
    }
  }
  return [...seen.values()];
}

/** Short header for the totals column: "Qtrs", "Halves", "Inn", "Periods". */
export function periodsHeader(sport: SportDefinition, periodCount: number): string {
  const name = sport.periodName(periodCount);
  if (name === 'Quarter') return 'Qtrs';
  if (name === 'Half') return 'Halves';
  if (name === 'Inning') return 'Inn';
  if (name === 'Game') return 'Played';
  return `${name}s`;
}
