import { type TeamPlace } from './places';

/** `<datalist>` of known locations for a text input's `list` attribute (D50). */
export function PlaceDatalist({ id, places }: { id: string; places: readonly TeamPlace[] | undefined }) {
  return (
    <datalist id={id}>
      {(places ?? []).map((p) => (
        <option key={p.location} value={p.location}>
          {p.address ?? ''}
        </option>
      ))}
    </datalist>
  );
}
