import { type SportDefinition } from '@/sports/types';
import { type ScoreEvent } from './api';
import { lineScore } from './stats';

/**
 * Baseball line score / basketball quarter breakdown; for volleyball (D121) the points per set
 * with the sets won as the total, counting only the sets that have ended.
 */
export function LineScore({
  S,
  events,
  periodCount,
  opponent,
  endedSets,
}: {
  S: SportDefinition;
  events: readonly ScoreEvent[];
  periodCount: number;
  opponent: string;
  /** Volleyball: how many sets have ended (the total counts those); absent for other sports. */
  endedSets?: number;
}) {
  const { us, them, n } = lineScore(events, periodCount);
  const name = S.periodName(n);
  const sets = endedSets !== undefined;
  const total = (a: number[], b: number[]) =>
    sets ? a.filter((v, i) => i < endedSets && v > (b[i] ?? 0)).length : a.reduce((x, y) => x + y, 0);
  return (
    <div className="linescore-wrap">
      <table className="linescore">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Team</span>
            </th>
            {Array.from({ length: n }, (_, i) => (
              <th key={i} scope="col" aria-label={`${name} ${i + 1}`}>
                {i + 1}
              </th>
            ))}
            <th scope="col" className="tot">
              {sets ? 'Sets' : S.scoring.panel === 'run' ? 'R' : 'T'}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">US</th>
            {us.map((v, i) => (
              <td key={i}>{v}</td>
            ))}
            <td className="tot">{total(us, them)}</td>
          </tr>
          <tr>
            <th scope="row" title={opponent}>
              THEM
            </th>
            {them.map((v, i) => (
              <td key={i}>{v}</td>
            ))}
            <td className="tot">{total(them, us)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
