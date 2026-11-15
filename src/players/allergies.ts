/* =====================================================================
   ALLERGIES (D114). A fixed list of allergens plus "Other" with its own name; three states per
   player: not answered (no row), none, or has. The team summary is the combined list with no
   names and never the notes.
   ===================================================================== */

export const ALLERGENS = [
  { key: 'peanuts', label: 'Peanuts' },
  { key: 'tree_nuts', label: 'Tree nuts' },
  { key: 'dairy', label: 'Dairy' },
  { key: 'eggs', label: 'Eggs' },
  { key: 'wheat', label: 'Wheat/Gluten' },
  { key: 'soy', label: 'Soy' },
  { key: 'sesame', label: 'Sesame' },
  { key: 'fish', label: 'Fish' },
  { key: 'shellfish', label: 'Shellfish' },
] as const;
export type AllergenKey = (typeof ALLERGENS)[number]['key'] | 'other';

export const allergenLabel = (key: string): string => ALLERGENS.find((a) => a.key === key)?.label ?? key;

export interface AllergySummary {
  allergens: string[];
  others: string[];
  unanswered: boolean;
}

/** "Peanuts, Dairy, Kiwi" in list order, the Other names last; empty when nobody has an allergy. */
export function summaryList(s: AllergySummary): string[] {
  const known = ALLERGENS.filter((a) => s.allergens.includes(a.key)).map((a) => a.label);
  return [...known, ...s.others];
}

/** One line for the summary: the list, "No allergies reported", or "No one has answered yet". */
export function summaryLine(s: AllergySummary | null | undefined): string {
  if (!s) return '';
  const items = summaryList(s);
  if (items.length) return items.join(', ');
  return s.unanswered ? 'No allergies reported yet' : 'No allergies on the team';
}

export const UNANSWERED_NOTE = 'Not every family has answered.';
