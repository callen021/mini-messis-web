import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SPORTS, formationByName } from '@/sports/definitions';
import { FIELDS, STANDING, fieldFrac, perspJerseyWidth } from '@/sports/field';
import { FieldStage } from '../FieldStage';

const S = SPORTS.soccer;
const forms = S.formations({ size: 7, gk: true });
const f33 = formationByName(forms, '3-3');

const slotWidths = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('.slot')).map((el) => parseFloat(el.style.width));
const standingWidths = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('.standing')).map((el) => parseFloat(el.style.width));

describe('FieldStage', () => {
  it('3D view: every jersey has the same width while goals keep their depth scaling', () => {
    const { container } = render(
      <FieldStage sport="soccer" view="persp" formation={f33} renderSlot={(i) => <span>{i}</span>} />,
    );
    const widths = slotWidths(container);
    expect(widths).toHaveLength(7);
    expect(new Set(widths).size).toBe(1);
    expect(widths[0]).toBeCloseTo(perspJerseyWidth('soccer', f33), 5);
    // the far goal (y 2.7) is drawn narrower than the near goal (y 99.4), as before
    const [far, near] = standingWidths(container);
    expect(far).toBeLessThan(near as number);
    const F = FIELDS.soccer.persp;
    expect(far).toBeCloseTo((STANDING.soccer[0]?.[3] ?? 0) * fieldFrac(F, STANDING.soccer[0]?.[2] ?? 0), 5);
    // positions still follow the perspective: the striker row sits above the goalkeeper
    const tops = Array.from(container.querySelectorAll<HTMLElement>('.slot')).map((el) =>
      parseFloat(el.style.top),
    );
    expect(Math.min(...tops)).toBeLessThan(Math.max(...tops));
  });

  it('depthScale restores the legacy shrink toward the far end', () => {
    const { container } = render(
      <FieldStage sport="soccer" view="persp" formation={f33} depthScale renderSlot={() => null} />,
    );
    const widths = slotWidths(container);
    expect(new Set(widths).size).toBeGreaterThan(1);
    // forwards (y 26) are smaller than the goalkeeper (y ~90)
    const gkIdx = f33.positions.findIndex((p) => p.role === 'GK');
    expect(widths[0]).toBeLessThan(widths[gkIdx] as number);
  });

  it('jerseyWidth (dev tuner) replaces the formation width in both views', () => {
    const persp = render(
      <FieldStage sport="soccer" view="persp" formation={f33} jerseyWidth={25.5} renderSlot={() => null} />,
    );
    expect(new Set(slotWidths(persp.container))).toEqual(new Set([25.5]));
    const flat = render(
      <FieldStage sport="soccer" view="flat" formation={f33} jerseyWidth={30} renderSlot={() => null} />,
    );
    expect(slotWidths(flat.container)[0]).toBeCloseTo(30 * fieldFrac(FIELDS.soccer.flat, 50), 5);
  });

  it('flat view is unchanged: widths come from the formation and the affine field fraction', () => {
    const { container } = render(
      <FieldStage sport="soccer" view="flat" formation={f33} renderSlot={() => null} />,
    );
    const widths = slotWidths(container);
    expect(new Set(widths).size).toBe(1);
    expect(widths[0]).toBeCloseTo(Math.max(f33.w, 9) * fieldFrac(FIELDS.soccer.flat, 50), 5);
    expect(container.querySelectorAll('.standing')).toHaveLength(2);
  });
});
