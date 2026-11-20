import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionSheetProvider } from '@/components/Sheet';
import { ToastProvider } from '@/components/Toast';
import { useUIStore } from '@/lib/ui-store';
import { LibraryItemPage } from '../LibraryItemPage';
import { LibraryList } from '../LibraryPage';
import { DRILL_GROUPS, groupDrills, type LibraryItemSummary } from '../types';

const api = vi.hoisted(() => ({
  rows: [] as unknown[],
  item: null as unknown,
  admin: false,
  publish: vi.fn(),
}));
vi.mock('../api', () => ({
  libraryImageUrl: (p: string) => `https://img.test/${p}`,
  useLibraryItems: () => ({ data: api.rows, isPending: false, isError: false }),
  useLibraryItem: () => ({ data: api.item, isPending: false, isError: false }),
  useSetLibraryPublished: () => ({ mutate: api.publish, isPending: false }),
  useLibraryOverride: () => ({ data: {}, isPending: false }),
  useSetLibraryOverride: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/teams/TeamContext', () => ({
  useCurrentTeam: () => ({ sport: 'soccer', team: { id: 'team', sport: 'soccer' }, role: 'parent' }),
}));
vi.mock('@/admin/useIsPlatformAdmin', () => ({ useIsPlatformAdmin: () => api.admin }));
vi.mock('@/clock/useWakeLock', () => ({ useWakeLock: () => undefined }));

let n = 0;
const row = (
  title: string,
  category: string,
  drill_group: string | null = null,
  is_published = true,
): LibraryItemSummary => ({
  id: `id-${++n}`,
  slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  sport: 'soccer',
  category,
  title,
  age_min: 6,
  age_max: 10,
  sort_order: n,
  is_published,
  drill_group,
});
const [TOUCH, MASTERY, STRIKING] = DRILL_GROUPS as [string, string, string];
const ROWS = [
  row('First Touch', 'fundamentals'),
  row('Toe Taps', 'home', MASTERY),
  row('Sole Rolls', 'home', MASTERY),
  row('Wall Passing and First Touch', 'home', STRIKING),
  row('Juggling', 'home', TOUCH),
];

const showList = () =>
  render(
    <MemoryRouter>
      <LibraryList />
    </MemoryRouter>,
  );
const head = (name: RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  api.rows = ROWS;
  api.admin = false;
  api.publish.mockReset();
  useUIStore.setState({ libraryOpen: [] });
});

describe('the Library list (D139)', () => {
  it('shows each category closed, with how many items it holds, in order', () => {
    showList();
    const heads = screen.getAllByRole('button').map((b) => b.textContent);
    expect(heads).toEqual(['Fundamentals1', 'Drills4', 'Games1']);
    for (const b of screen.getAllByRole('button')) expect(b).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('At home')).toBeNull();
  });

  it('opens a category on tap and remembers it on the device', async () => {
    const view = showList();
    await userEvent.click(head(/^Fundamentals/));
    expect(head(/^Fundamentals/)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: /First Touch/ })).toHaveAttribute('href', '/library/first-touch');
    expect(screen.queryByRole('link', { name: /Toe Taps/ })).toBeNull();
    expect(useUIStore.getState().libraryOpen).toEqual(['fundamentals']);
    // back from an item: the list is as it was left
    view.unmount();
    showList();
    expect(screen.getByRole('link', { name: /First Touch/ })).toBeInTheDocument();
    await userEvent.click(head(/^Fundamentals/));
    expect(screen.queryByRole('link')).toBeNull();
    expect(useUIStore.getState().libraryOpen).toEqual([]);
  });

  it('lists drills under their groups in the set order, and only the groups that have a drill', async () => {
    showList();
    await userEvent.click(head(/^Drills/));
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      TOUCH,
      MASTERY,
      STRIKING,
    ]);
    const mastery = screen.getByRole('group', { name: MASTERY });
    expect(within(mastery).getAllByRole('link')).toHaveLength(2);
    expect(within(mastery).getByRole('link', { name: /Toe Taps/ })).toBeInTheDocument();
    expect(screen.queryByText('Goalkeeping')).toBeNull();
    expect(screen.queryByText('Heading and Aerial Play')).toBeNull();
    expect(screen.queryByText('1v1 Defending')).toBeNull();
  });

  it('keeps a drill with an unknown group reachable, last', () => {
    const groups = groupDrills([row('Odd', 'home', 'Footwork'), row('Keeper', 'home', 'Goalkeeping')]);
    expect(groups.map((g) => g.group)).toEqual(['Goalkeeping', 'Other drills']);
  });

  it('opens Games like any other category, and a category with nothing is not listed', async () => {
    api.rows = [];
    showList();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Games1']);
    await userEvent.click(head(/^Games/));
    expect(screen.getByRole('link', { name: /Coach’s Call/ })).toBeInTheDocument();
  });

  it('counts a draft only for the platform admin who is sent it', async () => {
    api.rows = [...ROWS, row('Heading Basics', 'home', 'Heading and Aerial Play', false)];
    showList();
    expect(head(/^Drills/)).toHaveTextContent('Drills5');
    await userEvent.click(head(/^Drills/));
    const link = screen.getByRole('link', { name: /Heading Basics/ });
    expect(within(link).getByText('Draft')).toBeInTheDocument();
  });
});

describe('Publish / Unpublish on an item (D139)', () => {
  const item = (o: Record<string, unknown> = {}) => ({
    id: 'item-1',
    slug: 'toe-taps',
    sport: 'soccer',
    category: 'home',
    title: 'Toe Taps',
    age_min: null,
    age_max: null,
    sort_order: 1,
    is_published: true,
    content: { home: { skill: MASTERY, type: 'repetition', levels: [{ text: 'Tap the ball.' }] } },
    ...o,
  });
  const showItem = () =>
    render(
      <ToastProvider>
        <ActionSheetProvider>
          <MemoryRouter initialEntries={['/library/toe-taps']}>
            <Routes>
              <Route path="/library/:slug" element={<LibraryItemPage />} />
            </Routes>
          </MemoryRouter>
        </ActionSheetProvider>
      </ToastProvider>,
    );

  it('is not shown to a parent or a coach', () => {
    api.item = item();
    showItem();
    expect(screen.getByText(MASTERY)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publish/i })).toBeNull();
  });

  it('a platform admin publishes a draft', async () => {
    api.admin = true;
    api.item = item({ is_published: false });
    showItem();
    expect(screen.getByText(/^Draft: only platform admins can see this item/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unpublish' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(api.publish).toHaveBeenCalledWith({ itemId: 'item-1', published: true }, expect.anything());
  });

  it('unpublishing a drill in the Daily Drills rotation says what parents will see, and asks first', async () => {
    api.admin = true;
    api.item = item();
    showItem();
    // the control on the page; the sheet has a button of the same name
    const control = () =>
      within(screen.getByText(/Published for every team/)).getByRole('button', { name: 'Unpublish' });
    await userEvent.click(control());
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Unpublish Toe Taps?');
    expect(dialog).toHaveTextContent(
      'Parents will no longer see it, and another drill will show in its place in Daily Drills.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.publish).not.toHaveBeenCalled();
    await userEvent.click(control());
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Unpublish' }));
    expect(api.publish).toHaveBeenCalledWith({ itemId: 'item-1', published: false }, expect.anything());
  });

  it('unpublishing any other item has the plain warning', async () => {
    api.admin = true;
    api.item = item({ slug: 'first-touch', category: 'fundamentals', title: 'First Touch' });
    showItem();
    await userEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Parents and coaches will no longer see it.');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Daily Drills');
  });
});
