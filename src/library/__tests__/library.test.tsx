import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { layoutDiagram } from '../diagram';
import { LearnTab } from '../LearnTab';
import { cleanOverrides, paramNumber, paramText, stepperModel } from '../params';
import { SetupTab } from '../SetupTab';
import { ageText, parseContent, tabsOf } from '../types';

const api = vi.hoisted(() => ({ stored: {} as Record<string, unknown>, save: vi.fn() }));
vi.mock('../api', () => ({
  libraryImageUrl: (p: string) => `https://img.test/${p}`,
  useLibraryOverride: () => ({ data: api.stored, isPending: false }),
  useSetLibraryOverride: () => ({ mutate: api.save }),
}));

const CONTENT = {
  learn: {
    tagline: 'First touch into space, move with it!',
    focus: 'Receive the ball and move it away from pressure.',
    steps: [
      {
        title: 'Receive the Ball',
        text: 'Cushion the pass.',
        image: { path: 'a/1.webp', width: 368, height: 284 },
      },
      { title: 'Redirect', text: 'Away from pressure.', image: null },
    ],
    cues: ['Keep your head up.'],
    compare: [{ wrong: 'Head down the whole time.', right: 'Look up after the touch.' }],
    big_picture: 'A good first touch gives you time.',
  },
  setup: {
    params: [
      { key: 'cones', label: 'Cones', type: 'count', default: 4, min: 3, max: 5, adjustable: true },
      {
        key: 'spacing',
        label: 'Spacing',
        type: 'distance',
        default: [3, 5],
        min: 2,
        max: 8,
        adjustable: true,
      },
      { key: 'players', label: 'Players', type: 'text', default: '2+' },
      {
        key: 'duration',
        label: 'Duration',
        type: 'duration',
        default: null,
        min: 5,
        max: 30,
        step: 5,
        adjustable: true,
      },
    ],
    diagram: {
      elements: [
        { type: 'cones', id: 'c', from: [0, 0], step: [1, 0], count: '$cones' },
        { type: 'measure', from: 'c0', to: 'c1', label: '$spacing' },
        { type: 'player', id: 'passer', role: 'passer', label: 'Passer', at: ['c0', -1.2, 0.8] },
        { type: 'player', id: 'receiver', role: 'receiver', label: 'Receiver', at: ['c0', -0.2, 0.8] },
        { type: 'arrow', kind: 'pass', from: 'passer', to: 'receiver' },
        { type: 'arrow', kind: 'touch', from: ['c0', 0, 0.9], to: ['c0', 0.4, 1.4], repeat: 'c' },
        { type: 'arrow', kind: 'dribble', from: ['c0', 0.4, 1.4], to: ['c1', -0.2, 1], repeat: 'c' },
        { type: 'hologram', at: [0, 0] },
      ],
    },
    steps: ['Set up the cones in a straight line.'],
    equipment: ['Cones', 'One ball per pair'],
  },
};
function must<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) throw new Error('missing fixture value');
  return v;
}
const content = parseContent(CONTENT);
const setup = must(content.setup);
const diagram = must(setup.diagram);
const learn = must(content.learn);
const defs = setup.params;
const def = (key: string) => must(defs.find((d) => d.key === key));

describe('library content', () => {
  it('finds a tab per section and skips what it does not know', () => {
    expect(tabsOf(content)).toEqual(['learn', 'setup']);
    expect(tabsOf(parseContent({ learn: CONTENT.learn }))).toEqual(['learn']);
    expect(tabsOf(parseContent(null))).toEqual([]);
    expect(setup.diagram?.elements).toHaveLength(7); // the unknown element kind is dropped
    expect(def('players').adjustable).toBe(false);
  });
  it('writes the age range', () => {
    expect(ageText(6, 10)).toBe('Ages 6–10');
    expect(ageText(8, null)).toBe('Ages 8+');
    expect(ageText(null, null)).toBe('');
  });
});

describe('setup numbers', () => {
  it('shows the defaults, with yards also in feet', () => {
    expect(paramText(def('cones'), {})).toBe('4');
    expect(paramText(def('spacing'), {})).toBe('3–5 yd (9–15 ft)');
    expect(paramText(def('players'), {})).toBe('2+');
    expect(paramText(def('duration'), {})).toBe('Not set');
    expect(paramNumber(def('spacing'), {})).toBe(4);
  });
  it('shows the team’s numbers instead', () => {
    const o = { cones: 5, spacing: 6, duration: 10 };
    expect(paramText(def('cones'), o)).toBe('5');
    expect(paramText(def('spacing'), o)).toBe('6 yd (18 ft)');
    expect(paramText(def('duration'), o)).toBe('10 min');
  });
  it('drops stored values that are out of range, unknown or not adjustable', () => {
    expect(cleanOverrides(defs, { cones: 9, spacing: 6, players: 4, duration: 10.5, extra: 1 })).toEqual({
      spacing: 6,
    });
    expect(cleanOverrides(defs, null)).toEqual({});
  });
  it('steps: back onto the default clears it, duration steps down to not set', () => {
    const cones = stepperModel(def('cones'), { cones: 5 });
    expect(cones.apply(4)).toEqual({});
    const duration = stepperModel(def('duration'), { duration: 5, cones: 5 });
    expect([duration.min, duration.max, duration.step]).toEqual([0, 30, 5]);
    expect(duration.apply(0)).toEqual({ cones: 5 });
    expect(stepperModel(def('duration'), {}).value).toBe(0);
    expect(stepperModel(def('spacing'), {}).apply(5)).toEqual({ spacing: 5 });
  });
});

describe('drill diagram layout', () => {
  it('draws the default: four cones, both players, a pass, and a touch and dribble per gap', () => {
    const L = layoutDiagram(diagram, defs, {});
    expect(L.cones).toHaveLength(4);
    expect(L.players.map((p) => p.label)).toEqual(['Passer', 'Receiver']);
    expect(L.arrows.filter((a) => a.kind === 'pass')).toHaveLength(1);
    expect(L.arrows.filter((a) => a.kind === 'touch')).toHaveLength(3);
    expect(L.arrows.filter((a) => a.kind === 'dribble')).toHaveLength(3);
    expect(L.measures[0]?.label).toBe('3–5 yd (9–15 ft)');
  });
  it('follows the team’s numbers and stays inside the width', () => {
    for (const cones of [3, 4, 5]) {
      const L = layoutDiagram(diagram, defs, { cones, spacing: 8 });
      expect(L.cones).toHaveLength(cones);
      expect(L.measures[0]?.label).toBe('8 yd (24 ft)');
      const xs = [...L.cones, ...L.players].map((p) => p.x);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(13);
      expect(Math.max(...xs)).toBeLessThanOrEqual(L.width - 10);
      // the cones never crowd each other
      expect(must(L.cones[1]).x - must(L.cones[0]).x).toBeGreaterThan(40);
    }
  });
});

describe('LearnTab', () => {
  it('renders the text from data; an image is data too and a missing one shows the step number', () => {
    render(<LearnTab learn={learn} />);
    expect(screen.getByText('First touch into space, move with it!')).toBeInTheDocument();
    const steps = screen.getAllByRole('listitem').filter((li) => li.classList.contains('stepcard'));
    expect(steps).toHaveLength(2);
    expect(within(must(steps[0])).getByRole('heading', { name: /Receive the Ball/ })).toBeInTheDocument();
    expect(must(steps[0]).querySelector('img')).toHaveAttribute('src', 'https://img.test/a/1.webp');
    expect(must(steps[1]).querySelector('img')).toBeNull();
    expect(screen.getByText('Head down the whole time.')).toBeInTheDocument();
    expect(screen.getByText('Look up after the touch.')).toBeInTheDocument();
    expect(screen.getByText('A good first touch gives you time.')).toBeInTheDocument();
  });
});

describe('SetupTab', () => {
  beforeEach(() => {
    api.stored = {};
    api.save.mockReset();
  });
  const show = (canEdit: boolean) =>
    render(
      <ToastProvider>
        <SetupTab setup={setup} teamId="team" itemId="item" canEdit={canEdit} />
      </ToastProvider>,
    );

  it('a coach steps the numbers; each tap saves the team’s override', async () => {
    show(true);
    expect(screen.getAllByTestId('drill-cone')).toHaveLength(4);
    await userEvent.click(screen.getByRole('button', { name: 'Increase Cones' }));
    expect(api.save).toHaveBeenLastCalledWith({ cones: 5 }, expect.anything());
    await userEvent.click(screen.getByRole('button', { name: 'Increase Duration' }));
    expect(api.save).toHaveBeenLastCalledWith({ duration: 5 }, expect.anything());
    expect(screen.queryByRole('button', { name: 'Reset to default' })).toBeNull();
  });
  it('shows the team’s setup and resets it', async () => {
    api.stored = { cones: 3, spacing: 6 };
    show(true);
    expect(screen.getAllByTestId('drill-cone')).toHaveLength(3);
    expect(screen.getByRole('img', { name: /3 cones in a line, 6 yd \(18 ft\) apart/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
    expect(api.save).toHaveBeenLastCalledWith({}, expect.anything());
  });
  it('a parent reads the same numbers with no controls', () => {
    api.stored = { cones: 5 };
    show(false);
    expect(screen.getAllByTestId('drill-cone')).toHaveLength(5);
    // once on the diagram, once in the numbers
    expect(screen.getAllByText('3–5 yd (9–15 ft)')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Increase|Decrease|Reset/ })).toBeNull();
    expect(screen.getByText('Your coach adjusted this setup for your team.')).toBeInTheDocument();
  });
});
