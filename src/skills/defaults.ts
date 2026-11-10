import { type Enums, type Tables } from '@/lib/database.types';
import { type SportKey } from '@/sports/types';

export type SkillTest = Tables<'skill_tests'>;
export type SkillResult = Tables<'skill_results'>;
export type SkillMetric = Enums<'skill_metric'>;
export type SkillUnit = 'yd' | 'ft' | 'm';

/** A default test as the sport definition ships it (also the `create_team` / `restore_skill_tests` payload). */
export interface DefaultSkillTest {
  key: string;
  name: string;
  instructions: string;
  metric: SkillMetric;
  unit?: SkillUnit;
  has_sides?: boolean;
  higher_is_better?: boolean;
  attempts?: number;
  /** Baseball, basketball and lacrosse sets are drafts for the coach to review. */
  draft?: boolean;
}

const T = (
  key: string,
  name: string,
  instructions: string,
  metric: SkillMetric,
  o: Partial<Omit<DefaultSkillTest, 'key' | 'name' | 'instructions' | 'metric'>> = {},
): DefaultSkillTest => ({
  key,
  name,
  instructions,
  metric,
  unit: metric === 'distance' ? (o.unit ?? 'yd') : undefined,
  has_sides: o.has_sides ?? false,
  higher_is_better: o.higher_is_better ?? metric !== 'time_seconds',
  attempts: o.attempts ?? 5,
  draft: o.draft ?? false,
});

/**
 * Default test sets. Soccer wording is the coach's; the other sports are drafts. Shared athletic
 * tests (sprint speed) are part of every sport's own set under the same key, so there is no
 * cross-sport library: Restore defaults brings built-ins back, Add a custom test adds new ones.
 * The SQL twin is default_skill_tests() in supabase/migrations/20261109000800_skills_defaults.sql.
 */
export const DEFAULT_SKILL_TESTS: Readonly<Record<SportKey, readonly DefaultSkillTest[]>> = {
  soccer: [
    T(
      'ticktocks',
      'Tick-tocks',
      'Count alternating inside-foot touches in a small marked box. Stop when the ball leaves the box or the player loses the rhythm.',
      'count',
    ),
    T(
      'juggling',
      'Juggling',
      'Start with a hand drop. Count consecutive foot touches before the ball hits the ground.',
      'count',
    ),
    T(
      'dribble',
      'Dribbling with control',
      'Weave through four cones on the same course each time. Time the run and record the fastest attempt that goes around every cone.',
      'time_seconds',
    ),
    T(
      'passing',
      'Passing accuracy',
      'From 5 yards, pass a stationary ball through a 1-yard cone gate. Five tries with each foot.',
      'made_of_attempted',
      { has_sides: true },
    ),
    T(
      'shooting',
      'Shooting accuracy',
      'Five shots from 7 yards at the same goal without a keeper. Count shots that go in.',
      'made_of_attempted',
    ),
    T(
      'kickdist',
      'Kick distance',
      'Kick a stationary ball down a marked lane. Measure to where it first lands, using the same size ball each time.',
      'distance',
      { unit: 'yd' },
    ),
    T(
      'sprint',
      'Sprint speed',
      'Run 20 yards from a standing start. Two tries, same start signal and timing method each session.',
      'time_seconds',
    ),
  ],
  baseball: [
    T(
      'throwacc',
      'Throwing accuracy',
      'From 40 feet, throw at a target on a fence or net. Ten throws; count hits.',
      'made_of_attempted',
      { attempts: 10, draft: true },
    ),
    T(
      'throwdist',
      'Throwing distance',
      'Crow-hop and throw down a marked lane. Measure to the first bounce. Best of three.',
      'distance',
      { unit: 'ft', draft: true },
    ),
    T(
      'tee',
      'Tee contact',
      'Ten swings off a tee into a net. Count solid line-drive contacts.',
      'made_of_attempted',
      { attempts: 10, draft: true },
    ),
    T(
      'grounders',
      'Ground balls',
      'Ten rolled grounders at game speed. Count clean fields and throws.',
      'made_of_attempted',
      { attempts: 10, draft: true },
    ),
    T('popups', 'Fly balls', 'Ten tossed pop-ups. Count clean catches.', 'made_of_attempted', {
      attempts: 10,
      draft: true,
    }),
    T(
      'sprint',
      'Sprint speed',
      'Run from home to first base (60 feet) from a standing start. Two tries, same start signal and timing method each session.',
      'time_seconds',
      { draft: true },
    ),
  ],
  basketball: [
    T('ft', 'Free throws', 'Ten free throws from the line. Count makes.', 'made_of_attempted', {
      attempts: 10,
      draft: true,
    }),
    T(
      'layups',
      'Layups',
      'Ten layups, five from each side, off the dribble. Count makes.',
      'made_of_attempted',
      { attempts: 5, has_sides: true, draft: true },
    ),
    T(
      'dribblecones',
      'Dribble weave',
      'Dribble through five cones and back. Time the run; a lost ball restarts the attempt.',
      'time_seconds',
      { draft: true },
    ),
    T(
      'passwall',
      'Chest passes',
      'Chest passes against a wall from 6 feet for 30 seconds. Count catches.',
      'count',
      { draft: true },
    ),
    T(
      'sprint',
      'Sprint speed',
      'Sprint baseline to baseline from a standing start. Two tries, same start signal and timing method each session.',
      'time_seconds',
      { draft: true },
    ),
  ],
  lacrosse: [
    T(
      'wallball',
      'Wall ball',
      'Throw and catch against a wall from 5 yards for 60 seconds, alternating hands. Count catches.',
      'count',
      { draft: true },
    ),
    T(
      'shoot',
      'Shooting accuracy',
      'Ten shots from 8 yards at an open goal with corners marked. Count shots in a corner.',
      'made_of_attempted',
      { attempts: 10, draft: true },
    ),
    T(
      'ground',
      'Ground balls',
      'Ten rolled ground balls. Count clean scoops on the first try.',
      'made_of_attempted',
      { attempts: 10, draft: true },
    ),
    T(
      'cradle',
      'Cradle and run',
      'Weave four cones while cradling. Time the run; a dropped ball restarts it.',
      'time_seconds',
      { draft: true },
    ),
    T(
      'sprint',
      'Sprint speed',
      'Run 20 yards from a standing start. Two tries, same start signal and timing method each session.',
      'time_seconds',
      { draft: true },
    ),
  ],
  football: [],
};

/** Payload shape for `create_team(p_skill_tests)` / `restore_skill_tests`. */
export const defaultsPayload = (sport: SportKey) =>
  DEFAULT_SKILL_TESTS[sport].map(({ draft: _draft, ...t }) => t);

/** Is this team test one of the sport's defaults (and is that default a draft)? */
export function defaultFor(sport: SportKey, key: string): DefaultSkillTest | undefined {
  return DEFAULT_SKILL_TESTS[sport].find((d) => d.key === key);
}

/* ---------- formatting and personal bests ---------- */

export const UNIT_NAME: Record<SkillUnit, string> = { yd: 'Yards', ft: 'Feet', m: 'Meters' };

/** "Count · higher wins", "Made of 5 · L/R · higher wins" (settings rows). */
export function metricLabel(
  t: Pick<SkillTest, 'metric' | 'unit' | 'attempts' | 'has_sides' | 'higher_is_better'>,
): string {
  const base = {
    count: 'Count',
    time_seconds: 'Time (s)',
    distance: `Distance (${t.unit ?? 'yd'})`,
    made_of_attempted: `Made of ${t.attempts}`,
  }[t.metric];
  return `${base}${t.has_sides ? ' · L/R' : ''}${t.higher_is_better ? ' · higher wins' : ' · lower wins'}`;
}

/** Longer form for the test page subtitle. */
export function metricSentence(
  t: Pick<SkillTest, 'metric' | 'unit' | 'attempts' | 'has_sides' | 'higher_is_better'>,
): string {
  switch (t.metric) {
    case 'count':
      return `Count · ${t.higher_is_better ? 'higher' : 'lower'} is better`;
    case 'time_seconds':
      return `Seconds · ${t.higher_is_better ? 'higher' : 'lower'} is better`;
    case 'distance':
      return `${UNIT_NAME[(t.unit as SkillUnit | null) ?? 'yd']} · ${t.higher_is_better ? 'higher' : 'lower'} is better`;
    case 'made_of_attempted':
      return `Made of ${t.attempts}${t.has_sides ? ' · each side' : ''}`;
  }
}

/** Numeric score used to compare results (made/attempted becomes a ratio). */
export function scoreOf(t: Pick<SkillTest, 'metric'>, r: Pick<SkillResult, 'value' | 'attempts'>): number {
  const v = Number(r.value);
  if (t.metric === 'made_of_attempted') {
    const a = Number(r.attempts ?? 0);
    return a ? v / a : 0;
  }
  return v;
}

/** "4/5 R", "12.4 s", "25 yd", "20". */
export function fmtResult(
  t: Pick<SkillTest, 'metric' | 'unit'>,
  r: Pick<SkillResult, 'value' | 'attempts' | 'side'> | null | undefined,
  withSide = true,
): string {
  if (!r) return '–';
  const v = Number(r.value);
  switch (t.metric) {
    case 'made_of_attempted':
      return `${v}/${Number(r.attempts ?? 0)}${withSide && r.side ? (r.side === 'right' ? ' R' : ' L') : ''}`;
    case 'time_seconds':
      return `${v.toFixed(1)} s`;
    case 'distance':
      return `${v} ${t.unit ?? 'yd'}`;
    default:
      return String(v);
  }
}

/** Oldest first, stable. */
export const sortResults = (list: readonly SkillResult[]): SkillResult[] =>
  [...list].sort(
    (a, b) => a.tested_on.localeCompare(b.tested_on) || a.created_at.localeCompare(b.created_at),
  );

/** For two-sided tests the headline numbers use the right side, as in the prototype. */
export const mainSide = (t: Pick<SkillTest, 'has_sides'>, list: readonly SkillResult[]): SkillResult[] =>
  t.has_sides ? list.filter((r) => r.side === 'right') : [...list];

export function bestOf(
  t: Pick<SkillTest, 'metric' | 'higher_is_better'>,
  list: readonly SkillResult[],
): SkillResult | null {
  let best: SkillResult | null = null;
  for (const r of list) {
    if (!best) best = r;
    else {
      const a = scoreOf(t, r);
      const b = scoreOf(t, best);
      if (t.higher_is_better ? a > b : a < b) best = r;
    }
  }
  return best;
}

/** +1 when the latest result beat the one before, -1 when it missed, 0 when tied or too few. */
export function trend(
  t: Pick<SkillTest, 'metric' | 'higher_is_better'>,
  list: readonly SkillResult[],
): -1 | 0 | 1 {
  if (list.length < 2) return 0;
  const a = scoreOf(t, list[list.length - 1] as SkillResult);
  const z = scoreOf(t, list[list.length - 2] as SkillResult);
  const d = a - z;
  if (!d) return 0;
  return d > 0 === t.higher_is_better ? 1 : -1;
}

/** Points for a 72×26 sparkline over the last eight results (null with fewer than two). */
export function sparkPoints(
  t: Pick<SkillTest, 'metric' | 'higher_is_better'>,
  list: readonly SkillResult[],
  W = 72,
  H = 26,
): [number, number][] | null {
  const pts = list.slice(-8).map((r) => scoreOf(t, r));
  if (pts.length < 2) return null;
  const mn = Math.min(...pts);
  const mx = Math.max(...pts);
  const rg = mx - mn || 1;
  return pts.map((v, i) => [
    4 + (i * (W - 8)) / (pts.length - 1),
    t.higher_is_better ? H - 4 - ((v - mn) / rg) * (H - 8) : 4 + ((v - mn) / rg) * (H - 8),
  ]);
}

/** Short header for the Stats matrix. */
export const shortTestName = (name: string): string =>
  name
    .replace('Dribbling with control', 'Dribble')
    .replace(' accuracy', '')
    .replace('Sprint speed', 'Sprint')
    .replace('Kick distance', 'Kick');

/** Key for a custom test. */
export const customKey = (): string => `c${Date.now().toString(36)}`;
