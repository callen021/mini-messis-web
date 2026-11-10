import { type FormEvent, useMemo, useState } from 'react';
import { Button } from '@/components/Button';
import { Field, FieldGroup, Select, TextInput, Textarea } from '@/components/Form';
import { Segmented } from '@/components/Segmented';
import { FormSheet } from '@/components/Sheet';
import { fmtDate, todayISO } from './format';
import { type NewPracticesInput } from './practices';
import { MAX_SERIES, WEEKDAYS, weekdayOf, weeklyDates } from './recurrence';

export interface PracticeSheetProps {
  open: boolean;
  onClose: () => void;
  busy?: boolean;
  onSubmit: (input: NewPracticesInput) => void;
}

type Mode = 'once' | 'weekly';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const plusDays = (iso: string, days: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y ?? 2000, (m ?? 1) - 1, (d ?? 1) + days);
  return [
    dt.getFullYear(),
    String(dt.getMonth() + 1).padStart(2, '0'),
    String(dt.getDate()).padStart(2, '0'),
  ].join('-');
};

/**
 * New practice: a single date, or a weekly repeat between two dates with a checkbox per generated
 * date so holidays can be skipped before anything is saved.
 */
export function PracticeSheet({ open, onClose, busy, onSubmit }: PracticeSheetProps) {
  const today = todayISO();
  const [mode, setMode] = useState<Mode>('once');
  const [date, setDate] = useState(today);
  const [weekday, setWeekday] = useState<number>(() => weekdayOf(today) ?? 1);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(() => plusDays(today, 7 * 8));
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');

  const series = useMemo(() => weeklyDates(weekday, from, to), [weekday, from, to]);
  const kept = series.filter((d) => !skipped.has(d));
  const dates = mode === 'once' ? (ISO.test(date) ? [date] : []) : kept;
  const endOk = !end || !start || end > start;

  const toggle = (d: string) =>
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!dates.length || !endOk) return;
    onSubmit({
      dates,
      start_time: start || null,
      end_time: end || null,
      location: location || null,
      notes: notes || null,
    });
  };

  const label =
    mode === 'once'
      ? 'Add practice'
      : dates.length
        ? `Add ${dates.length} practice${dates.length === 1 ? '' : 's'}`
        : 'Add practices';

  return (
    <FormSheet open={open} onClose={onClose} title="New practice">
      <form onSubmit={submit} className="form" style={{ padding: 0 }}>
        <FieldGroup label="Repeat">
          <Segmented<Mode>
            label="Repeat"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'once', label: 'Once' },
              { value: 'weekly', label: 'Every week' },
            ]}
          />
        </FieldGroup>
        {mode === 'once' ? (
          <Field label="Date">
            <TextInput
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              data-autofocus=""
            />
          </Field>
        ) : (
          <>
            <Field label="Weekday">
              <Select
                value={weekday}
                onChange={(e) => setWeekday(Number(e.target.value))}
                aria-label="Weekday"
              >
                {WEEKDAYS.map((name, i) => (
                  <option key={name} value={i}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="First date">
              <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
            </Field>
            <Field label="Last date">
              <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
            </Field>
          </>
        )}
        <Field label="Start time">
          <TextInput type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="End time (optional)">
          <TextInput type="time" value={end} onChange={(e) => setEnd(e.target.value)} aria-invalid={!endOk} />
        </Field>
        {!endOk && <p className="sub">End time must be after the start.</p>}
        <Field label="Location (optional)">
          <TextInput
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={80}
            autoComplete="off"
            placeholder="Field 3, Riverside Park"
          />
        </Field>
        <Field label="Note for parents (optional)">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Bring water · shin guards"
          />
        </Field>
        {mode === 'weekly' && (
          <FieldGroup
            label={
              series.length
                ? `Every ${WEEKDAYS[weekday]} · ${series.length} date${series.length === 1 ? '' : 's'} · untick to skip`
                : 'No dates in that range'
            }
          >
            <div role="group" aria-label="Dates">
              {series.map((d) => {
                const on = !skipped.has(d);
                return (
                  <label key={d} className={on ? 'checkrow' : 'checkrow off'}>
                    <input type="checkbox" checked={on} onChange={() => toggle(d)} />
                    <span>{fmtDate(d, true)}</span>
                  </label>
                );
              })}
              {series.length >= MAX_SERIES && (
                <p className="sub">
                  Showing the first {MAX_SERIES} weeks. Shorten the range for more control.
                </p>
              )}
            </div>
          </FieldGroup>
        )}
        <Button type="submit" disabled={busy || !dates.length || !endOk}>
          {busy ? 'Saving…' : label}
        </Button>
      </form>
    </FormSheet>
  );
}
