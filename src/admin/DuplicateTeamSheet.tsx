import { useState } from 'react';
import { Button } from '@/components/Button';
import { Field, TextInput } from '@/components/Form';
import { FormSheet } from '@/components/Sheet';

/** Ask for the copy's name (D81). Pre-filled with "<source> copy"; Enter submits. */
export function DuplicateTeamSheet({
  source,
  onClose,
  onSubmit,
  busy,
}: {
  /** The team being copied, or null when the sheet is closed. */
  source: { id: string; name: string } | null;
  onClose: () => void;
  onSubmit: (name: string) => void;
  busy: boolean;
}) {
  const [name, setName] = useState('');
  const [prev, setPrev] = useState<string | null>(null);
  if ((source?.id ?? null) !== prev) {
    setPrev(source?.id ?? null);
    setName(source ? `${source.name} copy`.slice(0, 40) : '');
  }
  const trimmed = name.replace(/\s+/g, ' ').trim().slice(0, 40);
  const submit = () => {
    if (!trimmed || busy) return;
    onSubmit(trimmed);
  };
  return (
    <FormSheet
      open={!!source}
      onClose={onClose}
      title={source ? `Duplicate ${source.name}` : 'Duplicate team'}
    >
      <p className="hint">
        Copies the settings, season, players with their details and contacts, skills, template lineups,
        practices and games. Members, parent links and the board are not copied; the copy’s invite link starts
        off.
      </p>
      <Field label="New team name">
        <TextInput
          value={name}
          maxLength={40}
          data-autofocus=""
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </Field>
      <Button onClick={submit} disabled={!trimmed || busy}>
        {busy ? 'Copying…' : 'Duplicate team'}
      </Button>
    </FormSheet>
  );
}
