import { type FormEvent, useState } from 'react';
import { Button } from '@/components/Button';
import { Field, FieldGroup, TextInput, Textarea } from '@/components/Form';
import { Segmented } from '@/components/Segmented';
import { FormSheet } from '@/components/Sheet';
import { type HomeAway, type NewGameInput } from './api';
import { todayISO } from './format';

export interface NewGameSheetProps {
  open: boolean;
  onClose: () => void;
  /** A game is already live: only "Save for later" is offered. */
  liveExists: boolean;
  /** Title variant used from the Field score button. */
  startOnly?: boolean;
  busy?: boolean;
  onSubmit: (input: NewGameInput) => void;
}

type HomeAwayChoice = HomeAway | 'unset';

/** New game form: opponent, date, time, location, home/away, notes for parents; Start now / Save for later. */
export function NewGameSheet({ open, onClose, liveExists, startOnly, busy, onSubmit }: NewGameSheetProps) {
  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [homeAway, setHomeAway] = useState<HomeAwayChoice>('unset');
  const [notes, setNotes] = useState('');

  const submit = (start: boolean) => {
    onSubmit({
      opponent,
      game_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayISO(),
      start_time: time || null,
      location: location || null,
      home_away: homeAway === 'unset' ? null : homeAway,
      parent_notes: notes || null,
      start,
    });
  };
  // Enter / the submit button: "Start game" on the Field shortcut, otherwise "Save for later".
  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(!!startOnly && !liveExists);
  };

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={startOnly ? 'Start a game to record the score' : liveExists ? 'Schedule a game' : 'New game'}
    >
      <form onSubmit={onFormSubmit} className="form" style={{ padding: 0 }}>
        <Field label="Opponent">
          <TextInput
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            maxLength={40}
            autoComplete="off"
            placeholder="Opponent"
            data-autofocus=""
          />
        </Field>
        <Field label="Date">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Start time (optional)">
          <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Location / field (optional)">
          <TextInput
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={80}
            autoComplete="off"
            placeholder="Field 3, Riverside Park"
          />
        </Field>
        <FieldGroup label="Home or away">
          <Segmented<HomeAwayChoice>
            label="Home or away"
            value={homeAway}
            onChange={setHomeAway}
            options={[
              { value: 'unset', label: '—', ariaLabel: 'Not set' },
              { value: 'home', label: 'Home' },
              { value: 'away', label: 'Away' },
              { value: 'neutral', label: 'Neutral' },
            ]}
          />
        </FieldGroup>
        <Field label="Note for parents (optional)">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Wear white · arrive 20 minutes early"
          />
        </Field>
        {!startOnly || liveExists ? (
          <>
            <Button type="button" disabled={busy || liveExists} onClick={() => submit(true)}>
              {liveExists ? 'Finish the current game to start another' : 'Start game now'}
            </Button>
            <Button type="submit" variant="gray" disabled={busy}>
              Save for later
            </Button>
          </>
        ) : (
          <Button type="submit" disabled={busy}>
            Start game
          </Button>
        )}
      </form>
    </FormSheet>
  );
}
