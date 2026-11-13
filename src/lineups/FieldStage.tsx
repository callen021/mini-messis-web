import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import {
  type FieldView,
  STANDING,
  fieldImage,
  jerseyWidth as widthFor,
  place,
  placeFixed,
} from '@/sports/field';
import { STANDING_SVG } from '@/sports/jersey';
import { type Formation, type SportKey } from '@/sports/types';

export interface FieldStageProps {
  sport: SportKey;
  view: FieldView;
  formation: Formation;
  /** Render the jersey for slot `i` (position already placed; return the <Jersey/>). */
  renderSlot: (slotIndex: number) => ReactNode;
  className?: string;
  /** Legacy behaviour for comparison: shrink jerseys with depth in the 3D view. */
  depthScale?: boolean;
  /**
   * Dev tuner: jersey width as a percent of the field (flat) or stage (3D), replacing the
   * formation's `w` and the per-sport 3D factor for every slot.
   */
  jerseyWidth?: number;
  /** The first field on the page: load its artwork now, not lazily (D89). */
  priority?: boolean;
}

/**
 * The field artwork with goals/hoops and one absolutely-positioned slot per formation position.
 * Pure layout: the sport's homography places everything; goals and hoops shrink with depth, jerseys
 * keep one size in both views (D37, D102) unless `depthScale` asks for the legacy look.
 */
export function FieldStage({
  sport,
  view,
  formation,
  renderSlot,
  className,
  depthScale = false,
  jerseyWidth,
  priority = false,
}: FieldStageProps) {
  const F = fieldImage(sport, view);
  const base = import.meta.env.BASE_URL;
  const w = Math.max(jerseyWidth ?? widthFor(sport, formation, 'flat'), 9);
  // one on-field size in both views (D102): the 3D width, as a percent of the stage
  const fixed = !depthScale;
  const fixedW = jerseyWidth ?? widthFor(sport, formation, 'persp');
  return (
    <div className="pitchwrap">
      <div className={cn('stage', sport, view === 'flat' && 'flat', className)}>
        <img
          className="pitch"
          src={`${base}${F.src}`}
          width={F.w}
          height={F.h}
          alt=""
          decoding="async"
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
        />
        {STANDING[sport].map(([kind, x, y, sw], i) => {
          const p = place(F, x, y, sw);
          // goals and hoops sit behind every jersey (D103): the keeper's label is never behind the net
          return (
            <div
              key={`${kind}-${i}`}
              className="standing"
              style={{ left: p.left, top: p.top, width: p.width, zIndex: 5 }}
              dangerouslySetInnerHTML={{ __html: STANDING_SVG[kind] }}
            />
          );
        })}
        {formation.positions.map((pos, i) => {
          const p = fixed ? placeFixed(F, pos.x, pos.y, fixedW) : place(F, pos.x, pos.y, w);
          return (
            <div
              key={i}
              className="slot"
              style={{ left: p.left, top: p.top, width: p.width, zIndex: p.zIndex }}
            >
              {renderSlot(i)}
              <div className="gshadow" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
