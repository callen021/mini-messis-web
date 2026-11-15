import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import { AllergiesSection } from '../AllergiesSection';
import { AllergySummary } from '../AllergySummary';
import { type PlayerAllergies } from '../api';

let row: PlayerAllergies | null = null;
const save = vi.fn();
let summary = { allergens: ['peanuts', 'dairy'], others: ['Kiwi'], unanswered: true };
vi.mock('../api', () => ({
  usePlayerAllergies: () => ({ data: row, isPending: false }),
  useSavePlayerAllergies: () => ({ mutate: save }),
  useTeamAllergySummary: () => ({ data: summary }),
}));

const chip = (name: string) => screen.getByRole('button', { name });
const renderSection = () =>
  render(
    <ToastProvider>
      <AllergiesSection playerId="p1" teamId="t1" playerName="Nolan" />
    </ToastProvider>,
  );

describe('AllergiesSection (D114)', () => {
  beforeEach(() => {
    row = null;
    save.mockReset();
  });

  it('not answered: every chip off and a note; a chip tap saves "has" with that allergen', async () => {
    renderSection();
    expect(document.querySelector('.anote')).toHaveTextContent('Not answered yet');
    expect(chip('None')).toHaveAttribute('aria-pressed', 'false');
    expect(chip('Peanuts')).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(chip('Peanuts'));
    expect(save).toHaveBeenCalledWith(
      { status: 'has', allergens: ['peanuts'], other: null, notes: null },
      expect.anything(),
    );
  });

  it('None clears and excludes the others; a second allergen joins the list', async () => {
    row = {
      player_id: 'p1',
      status: 'has',
      allergens: ['peanuts', 'eggs'],
      other: null,
      notes: 'EpiPen in the bag',
      updated_at: '',
      updated_by: null,
    };
    renderSection();
    expect(chip('Peanuts')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Eggs')).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('.anote')).toBeNull();
    await userEvent.click(chip('Dairy'));
    expect(save).toHaveBeenLastCalledWith(
      { status: 'has', allergens: ['peanuts', 'eggs', 'dairy'], other: null, notes: 'EpiPen in the bag' },
      expect.anything(),
    );
    await userEvent.click(chip('None'));
    expect(save).toHaveBeenLastCalledWith(
      { status: 'none', allergens: [], other: null, notes: 'EpiPen in the bag' },
      expect.anything(),
    );
  });

  it('Other opens a name field that saves when left; the notes save on their own', async () => {
    row = {
      player_id: 'p1',
      status: 'none',
      allergens: [],
      other: null,
      notes: null,
      updated_at: '',
      updated_by: null,
    };
    renderSection();
    expect(chip('None')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByLabelText('Other allergen')).not.toBeInTheDocument();
    await userEvent.click(chip('Other'));
    // the chip opens the field; nothing is saved until a name is typed (the row needs one)
    expect(save).not.toHaveBeenCalled();
    expect(chip('Other')).toHaveAttribute('aria-pressed', 'true');
    const other = screen.getByLabelText('Other allergen') as HTMLInputElement;
    await userEvent.type(other, 'Kiwi');
    await userEvent.tab();
    expect(save).toHaveBeenLastCalledWith(
      { status: 'has', allergens: ['other'], other: 'Kiwi', notes: null },
      expect.anything(),
    );
    row = { ...row, status: 'has', allergens: ['other'], other: 'Kiwi' };
    cleanup();
    renderSection();
    const notes = screen.getByLabelText('Notes') as HTMLTextAreaElement;
    await userEvent.type(notes, 'Mild');
    await userEvent.tab();
    expect(save).toHaveBeenLastCalledWith(
      { status: 'has', allergens: ['other'], other: 'Kiwi', notes: 'Mild' },
      expect.anything(),
    );
  });
});

describe('AllergiesSection drafts (D114)', () => {
  it('a save landing for one field never wipes the draft typed in the other', async () => {
    row = {
      player_id: 'p1',
      status: 'has',
      allergens: ['other'],
      other: null,
      notes: null,
      updated_at: '',
      updated_by: null,
    };
    const { rerender } = render(
      <ToastProvider>
        <AllergiesSection playerId="p1" teamId="t1" playerName="Nolan" />
      </ToastProvider>,
    );
    await userEvent.type(screen.getByLabelText('Notes'), 'EpiPen');
    // the Other name's save lands (the row now carries it) while the notes are still being typed
    row = { ...row, other: 'Kiwi' };
    rerender(
      <ToastProvider>
        <AllergiesSection playerId="p1" teamId="t1" playerName="Nolan" />
      </ToastProvider>,
    );
    expect(screen.getByLabelText('Other allergen')).toHaveValue('Kiwi');
    expect(screen.getByLabelText('Notes')).toHaveValue('EpiPen');
    await userEvent.tab();
    expect(save).toHaveBeenLastCalledWith(
      { status: 'has', allergens: ['other'], other: 'Kiwi', notes: 'EpiPen' },
      expect.anything(),
    );
  });
});

describe('AllergySummary (D114)', () => {
  it('shows the combined list with the Other names and the unanswered note, never a player', () => {
    render(<AllergySummary teamId="t1" />);
    expect(screen.getByText('Allergies on the team')).toBeInTheDocument();
    expect(screen.getByText('Peanuts, Dairy, Kiwi · Not every family has answered.')).toBeInTheDocument();
  });

  it('drops the note once everyone answered; bare renders inline text', () => {
    summary = { allergens: ['sesame'], others: [], unanswered: false };
    render(<AllergySummary teamId="t1" bare label="Allergies" />);
    expect(screen.getByText('Sesame')).toBeInTheDocument();
    expect(screen.queryByText(/Not every family/)).not.toBeInTheDocument();
  });
});
