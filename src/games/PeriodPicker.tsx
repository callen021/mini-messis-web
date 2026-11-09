import { Field, FieldGroup, Select } from '@/components/Form';
import { Segmented } from '@/components/Segmented';
import { type SportDefinition } from '@/sports/types';

/**
 * Period chooser inside a form sheet: a segmented control for a handful of quarters/halves,
 * a select once a baseball game has too many innings to fit.
 */
export function PeriodPicker({
  S,
  count,
  value,
  onChange,
}: {
  S: SportDefinition;
  count: number;
  value: number;
  onChange: (index: number) => void;
}) {
  const name = S.periodName(count);
  const n = Math.max(1, count);
  if (n > 6) {
    return (
      <Field label={name}>
        <Select value={String(value)} onChange={(e) => onChange(Number(e.target.value))}>
          {Array.from({ length: n }, (_, i) => (
            <option key={i} value={i}>
              {name} {i + 1}
            </option>
          ))}
        </Select>
      </Field>
    );
  }
  return (
    <FieldGroup label={name}>
      <Segmented<string>
        label={name}
        value={String(Math.min(value, n - 1))}
        onChange={(v) => onChange(Number(v))}
        options={Array.from({ length: n }, (_, i) => ({
          value: String(i),
          label: name === 'Inning' ? String(i + 1) : `${name[0] ?? ''}${i + 1}`,
          ariaLabel: `${name} ${i + 1}`,
        }))}
      />
    </FieldGroup>
  );
}
