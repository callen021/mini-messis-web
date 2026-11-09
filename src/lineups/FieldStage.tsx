import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { type FieldView, STANDING, fieldImage, place } from '@/sports/field';
import { STANDING_SVG } from '@/sports/jersey';
import { type Formation, type SportKey } from '@/sports/types';

export interface FieldStageProps {
  sport: SportKey;
  view: FieldView;
  formation: Formation;
  /** Render the jersey for slot `i` (position already placed; return the <Jersey/>). */
  renderSlot: (slotIndex: number) => ReactNode;
  className?: string;
}

/**
 * The field artwork with goals/hoops and one absolutely-positioned slot per formation position.
 * Pure layout: uses the sport's homography to place everything; the caller renders the jerseys.
 */
export function FieldStage({ sport, view, formation, renderSlot, className }: FieldStageProps) {
  const F = fieldImage(sport, view);
  const base = import.meta.env.BASE_URL;
  const w = Math.max(formation.w || 22, 9);
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
          loading="lazy"
        />
        {STANDING[sport].map(([kind, x, y, sw], i) => {
          const p = place(F, x, y, sw);
          return (
            <div
              key={`${kind}-${i}`}
              className="standing"
              style={{ left: p.left, top: p.top, width: p.width, zIndex: p.zIndex }}
              dangerouslySetInnerHTML={{ __html: STANDING_SVG[kind] }}
            />
          );
        })}
        {formation.positions.map((pos, i) => {
          const p = place(F, pos.x, pos.y, w);
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
