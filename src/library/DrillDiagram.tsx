import { useId, useMemo } from 'react';
import { layoutDiagram, PLAYER_R } from './diagram';
import { type Overrides } from './params';
import { type ArrowKind, type DiagramSpec, type ParamDef } from './types';

const ARROW_LABEL: Readonly<Record<ArrowKind, string>> = {
  pass: 'Pass',
  touch: 'First touch',
  dribble: 'Dribble',
};
const ARROW_ORDER: readonly ArrowKind[] = ['pass', 'touch', 'dribble'];

/**
 * An overhead drill diagram drawn from the item's structured data and the team's numbers (D123):
 * striped grass like the Field tab's pitch, cones, the players, and one arrow style per kind
 * of movement, with a key underneath. Not an image and not editable.
 */
export function DrillDiagram({
  spec,
  params,
  overrides,
}: {
  spec: DiagramSpec;
  params: readonly ParamDef[];
  overrides: Overrides;
}) {
  const L = useMemo(() => layoutDiagram(spec, params, overrides), [spec, params, overrides]);
  const uid = useId();
  const stripes = `${uid}-stripes`;
  const kinds = ARROW_ORDER.filter((k) => L.arrows.some((a) => a.kind === k));
  const summary = [
    `${L.cones.length} cones`,
    ...L.measures.map((m) => m.label),
    ...L.players.map((p) => p.label.toLowerCase()),
    ...kinds.map((k) => ARROW_LABEL[k].toLowerCase()),
  ].join(', ');
  return (
    <figure className="drill">
      <svg
        className="drillsvg"
        viewBox={`0 0 ${L.width} ${L.height}`}
        role="img"
        aria-label={`Overhead diagram: ${summary}.`}
      >
        <defs>
          <pattern id={stripes} width="68" height="68" patternUnits="userSpaceOnUse">
            <rect width="34" height="68" fill="#2f8f4e" />
            <rect x="34" width="34" height="68" fill="#2a8347" />
          </pattern>
        </defs>
        <rect width={L.width} height={L.height} fill={`url(#${stripes})`} />
        {L.measures.map((m, i) => (
          <g key={`m${i}`} className="dmeasure">
            <path
              d={
                m.upright
                  ? `M${m.x1} ${m.y1}V${m.y2}M${m.x1 - 4} ${m.y1}h8M${m.x1 - 4} ${m.y2}h8`
                  : `M${m.x1} ${m.y1}H${m.x2}M${m.x1} ${m.y1 - 4}v8M${m.x2} ${m.y1 - 4}v8`
              }
              fill="none"
            />
            <text
              x={m.labelX}
              y={m.labelY}
              textAnchor="middle"
              transform={m.upright ? `rotate(-90 ${m.labelX} ${m.labelY})` : undefined}
            >
              {m.label}
            </text>
          </g>
        ))}
        {L.arrows.map((a, i) => (
          <g key={`a${i}`} className={`darrow ${a.kind}`} opacity={a.faded ? 0.6 : 1}>
            <path d={a.d} fill="none" />
            <polygon points={a.head} />
          </g>
        ))}
        {L.cones.map((c, i) => (
          <g key={`c${i}`} className="dcone" data-testid="drill-cone">
            <ellipse cx={c.x} cy={c.y + 7} rx="10" ry="3.2" />
            <path d={`M${c.x - 7} ${c.y + 7}L${c.x - 2} ${c.y - 9}h4L${c.x + 7} ${c.y + 7}Z`} />
          </g>
        ))}
        {L.players.map((p, i) => (
          <g key={`p${i}`} className={`dplayer ${p.role}`}>
            <circle cx={p.x} cy={p.y} r={PLAYER_R} />
            <text className="dletter" x={p.x} y={p.y + 4.5} textAnchor="middle">
              {p.label.charAt(0)}
            </text>
            <text className="dname" x={p.x} y={p.y - PLAYER_R - 6} textAnchor="middle">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
      {kinds.length > 0 && (
        <figcaption className="drillkey">
          {kinds.map((k) => (
            <span key={k}>
              <svg className={`darrow ${k}`} viewBox="0 0 34 12" width="34" height="12" aria-hidden="true">
                <path d={k === 'dribble' ? 'M1 6q3-6 6 0t6 0 6 0 6 0' : 'M1 6H26'} fill="none" />
                <polygon points="33,6 25,2 25,10" />
              </svg>
              {ARROW_LABEL[k]}
            </span>
          ))}
          <span className="scale">Not to scale</span>
        </figcaption>
      )}
    </figure>
  );
}
