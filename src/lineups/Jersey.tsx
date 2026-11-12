import { memo } from 'react';
import { cn } from '@/lib/cn';
import { halo, textColor } from '@/sports/colors';
import { JERSEY_DEFS, jerseySvg } from '@/sports/jersey';
import { type JerseyStyle } from '@/sports/types';

/** Shared SVG patterns/gradients for jerseys and goals. Render once near the root of a page that shows fields. */
export function JerseyDefs() {
  return <svg className="hidden-svg" aria-hidden="true" dangerouslySetInnerHTML={{ __html: JERSEY_DEFS }} />;
}

export interface JerseyProps {
  /** Unique per rendered jersey (keys the SVG gradient ids). */
  id: string;
  color: string;
  kind: JerseyStyle;
  /** Player name; empty means the jersey is open. */
  name: string;
  number?: string;
  /** Position code printed on the shirt (LCB, SS, PG…). */
  code: string;
  /** Picked by Auto-fill → white dot badge. */
  auto?: boolean;
  /** Accessible label for the tap target. */
  label: string;
  onClick?: () => void;
  /** Read-only variant (parents): still focusable for the highlight, but not announced as a button action. */
  readOnly?: boolean;
  highlighted?: boolean;
  /** The jersey is the first tap of a select-then-target change (D70, D77). */
  selected?: boolean;
  /** A completed tap just touched this jersey: the same gold outline for a moment (D77). */
  flash?: boolean;
  /** Clock mode: a small time line under the shirt ("4:12" on the field, "12 min" on the bench). */
  time?: string;
}

/**
 * One jersey on the field: SVG shirt + name/number/code overlays. Visual port of the legacy `.shirt`
 * markup; the picker that opens on tap is the caller's business.
 */
export const Jersey = memo(function Jersey({
  id,
  color,
  kind,
  name,
  number,
  code,
  auto,
  label,
  onClick,
  readOnly,
  highlighted,
  selected,
  flash,
  time,
}: JerseyProps) {
  const open = !name;
  const tc = textColor(color);
  const style = { '--shirt-text': tc, '--halo': halo(tc) } as React.CSSProperties;
  const svg = jerseySvg({ id, color, contrast: tc, kind, open });
  return (
    <button
      type="button"
      className={cn(
        'shirt',
        kind,
        open && 'open',
        number && 'hasnum',
        auto && 'auto',
        highlighted && 'highlight',
        selected && 'selected',
        flash && 'flash',
      )}
      style={style}
      aria-label={label}
      aria-pressed={selected === undefined ? undefined : selected}
      onClick={onClick}
      disabled={readOnly && !onClick}
      aria-disabled={readOnly || undefined}
    >
      <span dangerouslySetInnerHTML={{ __html: svg }} />
      {open ? (
        // an open jersey shows its position code only, plus a small "+" (D63): no "Select" text
        <span className="plus" aria-hidden="true">
          +
        </span>
      ) : (
        <span className="name">{name}</span>
      )}
      {number && <span className="num">{number}</span>}
      <span className="code">{code}</span>
      {auto && !open && <span className="autobadge" title="Picked by Auto-fill" />}
      {highlighted && !open && (
        <span className="starbadge" title="Your child" aria-hidden="true">
          ★
        </span>
      )}
      {time && <span className="jtime">{time}</span>}
    </button>
  );
});
