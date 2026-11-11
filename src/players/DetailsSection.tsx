import { Footer, Group, Row, Section } from '@/components/List';
import { useToast } from '@/components/Toast';
import { fmtDate } from '@/games/format';
import { errorMessage } from '@/lib/supabase';
import {
  ageOn,
  SHIRT_SIZES,
  type ShirtSize,
  shirtSizeLabel,
  usePlayerDetails,
  useSavePlayerDetails,
} from './api';

/**
 * Birthdate and shirt size for one player (D52). Rendered only for staff and the player's own
 * guardians (RLS returns nothing for anyone else); both may edit. Contacts live in PeopleSection.
 */
export function DetailsSection({
  playerId,
  playerName,
  canEdit,
  compact = false,
}: {
  playerId: string;
  playerName: string;
  canEdit: boolean;
  /** Parent home: no section header of its own. */
  compact?: boolean;
}) {
  const toast = useToast();
  const details = usePlayerDetails(playerId);
  const save = useSavePlayerDetails(playerId);
  const onError = (e: unknown) => toast(errorMessage(e));
  const d = details.data;
  const age = ageOn(d?.birthdate);

  return (
    <>
      {!compact && <Section>Details</Section>}
      <Group>
        <Row label="Birthdate" detail={age !== null ? `${age} years old` : undefined}>
          {canEdit ? (
            <input
              className="inline"
              type="date"
              aria-label="Birthdate"
              value={d?.birthdate ?? ''}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => {
                const v = e.target.value || null;
                if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
                save.mutate({ birthdate: v }, { onError });
              }}
            />
          ) : (
            <span className="val">{d?.birthdate ? fmtDate(d.birthdate, true) : '–'}</span>
          )}
        </Row>
        <Row label="Shirt size">
          {canEdit ? (
            <select
              className="inline"
              aria-label="Shirt size"
              value={d?.shirt_size ?? ''}
              onChange={(e) =>
                save.mutate({ shirt_size: (e.target.value || null) as ShirtSize | null }, { onError })
              }
            >
              <option value="">Not set</option>
              {SHIRT_SIZES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="val">{shirtSizeLabel(d?.shirt_size) || '–'}</span>
          )}
        </Row>
      </Group>
      <Footer>Only the coaches and {playerName}’s own parents can see the birthdate and shirt size.</Footer>
    </>
  );
}
