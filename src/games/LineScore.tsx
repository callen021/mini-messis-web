import { type SportDefinition } from '@/sports/types';
import { type ScoreEvent } from './api';
import { lineScore } from './stats';

/** Baseball line score / basketball quarter breakdown. */
export function LineScore({
  S,
  events,
  periodCount,
  opponent,
}: {
  S: SportDefinition;
  events: readonly ScoreEvent[];
  periodCount: number;
  opponent: string;
}) {
  const { us, them, n } = lineScore(events, periodCount);
  const name = S.periodName(n);
  const total = (a: number[]) => a.reduce((x, y) => x + y, 0);
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
              {S.scoring.panel === 'run' ? 'R' : 'T'}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">US</th>
            {us.map((v, i) => (
              <td key={i}>{v}</td>
            ))}
            <td className="tot">{total(us)}</td>
          </tr>
          <tr>
            <th scope="row" title={opponent}>
              THEM
            </th>
            {them.map((v, i) => (
              <td key={i}>{v}</td>
            ))}
            <td className="tot">{total(them)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
