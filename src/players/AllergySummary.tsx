import { Group, Row } from '@/components/List';
import { UNANSWERED_NOTE, summaryLine } from './allergies';
import { useTeamAllergySummary } from './api';

/**
 * The team's allergies at a glance (D114): the combined chip list, Other names included, never a
 * player's name or notes. "Not every family has answered." while some family has not.
 */
export function AllergySummary({
  teamId,
  bare = false,
  label = 'Allergies on the team',
}: {
  teamId: string;
  /** Inline text only (inside another card), no Group of its own. */
  bare?: boolean;
  label?: string;
}) {
  const summary = useTeamAllergySummary(teamId);
  const s = summary.data;
  if (!s) return null;
  const line = summaryLine(s);
  const text = s.unanswered ? `${line} · ${UNANSWERED_NOTE}` : line;
  if (bare)
    return (
      <span className="asummary">
        <b>{label}:</b> {text}
      </span>
    );
  return (
    <Group>
      <Row icon="🥜" iconColor="var(--orange)" label={label} detail={text} />
    </Group>
  );
}
