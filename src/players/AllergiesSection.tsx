import { useRef, useState } from 'react';
import { Footer, Group, Section } from '@/components/List';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/supabase';
import { ALLERGENS, type AllergenKey } from './allergies';
import { type AllergiesInput, usePlayerAllergies, useSavePlayerAllergies } from './api';

/**
 * Allergies for one player (D114): multi-select chips, a None chip that clears and excludes the
 * others, Other with its own name, and a separate Notes field (severity, EpiPen…). Rendered only
 * for staff and the player's own confirmed parents; every chip tap saves at once, the text
 * fields save when you leave them. Three states are kept: not answered, none, has allergies.
 */
export function AllergiesSection({
  playerId,
  teamId,
  playerName,
  compact = false,
}: {
  playerId: string;
  teamId: string;
  playerName: string;
  /** Parent home: no section header of its own. */
  compact?: boolean;
}) {
  const toast = useToast();
  const row = usePlayerAllergies(playerId);
  const save = useSavePlayerAllergies(playerId, teamId);
  const onError = (e: unknown) => toast(errorMessage(e));
  const d = row.data;
  const status = d?.status ?? null;
  const picked = new Set<string>(d?.allergens ?? []);
  const hasOther = picked.has('other');
  // the Other chip opens the name field; the chip is saved once a name is typed (the row needs one)
  const [otherOpen, setOtherOpen] = useState(false);
  // the two text fields are typed locally and saved on blur; a new server value replaces the
  // draft (state adjusted during render, no effect)
  const [other, setOther] = useState(d?.other ?? '');
  const [notes, setNotes] = useState(d?.notes ?? '');
  // each field follows its own server value only, so a save of one never wipes the other's draft
  const [seen, setSeen] = useState({ other: d?.other ?? null, notes: d?.notes ?? null });
  if ((d?.other ?? null) !== seen.other || (d?.notes ?? null) !== seen.notes) {
    if ((d?.other ?? null) !== seen.other) setOther(d?.other ?? '');
    if ((d?.notes ?? null) !== seen.notes) setNotes(d?.notes ?? '');
    setSeen({ other: d?.other ?? null, notes: d?.notes ?? null });
  }

  // every save sends the whole row, so two quick saves (the Other name, then the notes) must
  // build on the last one sent, not on a snapshot the cache has not caught up with yet
  const sentRef = useRef<AllergiesInput | null>(null);
  const commit = (input: AllergiesInput) => {
    sentRef.current = input;
    save.mutate(input, { onError, onSettled: () => (sentRef.current = null) });
  };
  const current = (): AllergiesInput =>
    sentRef.current ?? {
      status: status ?? 'has',
      allergens: [...picked],
      other: d?.other ?? null,
      notes: d?.notes ?? null,
    };
  const toggle = (key: AllergenKey) => {
    if (key === 'other' && !hasOther) {
      // nothing to save yet: the name field opens, and the chip is saved with the name
      setOtherOpen((o) => !o);
      return;
    }
    const next = new Set(picked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const allergens = [...next];
    if (key === 'other') setOtherOpen(false);
    commit({
      ...current(),
      status: 'has',
      allergens,
      other: allergens.includes('other') ? (d?.other ?? null) : null,
    });
  };
  const none = () => {
    setOtherOpen(false);
    if (status === 'none') return;
    commit({ status: 'none', allergens: [], other: null, notes: d?.notes ?? null });
  };
  const saveOther = () => {
    const v = other.trim().slice(0, 80);
    if (!v) {
      // an empty name drops the Other chip
      setOtherOpen(false);
      if (hasOther)
        commit({ ...current(), allergens: [...picked].filter((k) => k !== 'other'), other: null });
      return;
    }
    if (hasOther && v === (d?.other ?? '')) return;
    commit({
      ...current(),
      status: 'has',
      allergens: hasOther ? [...picked] : [...picked, 'other'],
      other: v,
    });
  };
  const saveNotes = () => {
    const v = notes.trim().slice(0, 500) || null;
    if (v === (d?.notes ?? null)) return;
    commit({ ...current(), status: status ?? 'none', notes: v });
  };

  const chipClass = (on: boolean) => cn('achip', on && 'on');

  return (
    <>
      {!compact && <Section>Allergies</Section>}
      <Group className="allergies">
        <div className="achips" role="group" aria-label={`${playerName}’s allergies`}>
          <button
            type="button"
            className={chipClass(status === 'none')}
            aria-pressed={status === 'none'}
            onClick={none}
            disabled={row.isPending}
          >
            None
          </button>
          {ALLERGENS.map((a) => (
            <button
              key={a.key}
              type="button"
              className={chipClass(picked.has(a.key))}
              aria-pressed={picked.has(a.key)}
              onClick={() => toggle(a.key)}
              disabled={row.isPending}
            >
              {a.label}
            </button>
          ))}
          <button
            type="button"
            className={chipClass(hasOther || otherOpen)}
            aria-pressed={hasOther || otherOpen}
            onClick={() => toggle('other')}
            disabled={row.isPending}
          >
            Other
          </button>
        </div>
        {(hasOther || otherOpen) && (
          <label className="afield">
            <span>Other allergen</span>
            <input
              className="input"
              type="text"
              value={other}
              maxLength={80}
              placeholder="e.g. kiwi"
              onChange={(e) => setOther(e.target.value)}
              onBlur={saveOther}
            />
          </label>
        )}
        <label className="afield">
          <span>Notes</span>
          <textarea
            className="input"
            rows={2}
            value={notes}
            maxLength={500}
            placeholder="Severity, EpiPen, what to do…"
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
          />
        </label>
        {status === null && !row.isPending && (
          <p className="anote" role="status">
            Not answered yet. Tap None if {playerName} has no allergies.
          </p>
        )}
      </Group>
      <Footer>
        Only the coaches and {playerName}’s own parents can see this. The team sees a combined list of
        allergens with no names; the notes stay here.
      </Footer>
    </>
  );
}
