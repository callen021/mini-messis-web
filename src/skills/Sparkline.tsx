import { type SkillResult, type SkillTest, sparkPoints } from './defaults';

/** Trend over the last eight results; renders nothing with fewer than two. */
export function Sparkline({
  test,
  results,
}: {
  test: Pick<SkillTest, 'metric' | 'higher_is_better'>;
  results: readonly SkillResult[];
}) {
  const W = 72;
  const H = 26;
  const xy = sparkPoints(test, results, W, H);
  if (!xy) return null;
  const d = xy.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = xy[xy.length - 1] as [number, number];
  const first = xy[0] as [number, number];
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path className="area" d={`${d} L${last[0].toFixed(1)} ${H} L${first[0].toFixed(1)} ${H} Z`} />
      <path d={d} />
      <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r="2.2" />
    </svg>
  );
}
