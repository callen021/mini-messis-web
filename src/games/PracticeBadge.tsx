import { Badge } from '@/components/Badge';
import { type Practice } from './practices';
import { timingLabel } from './timing';

/** "Practice" plus how soon it is; "Cancelled" when called off (D50). */
export function PracticeBadge({
  practice,
  today,
}: {
  practice: Pick<Practice, 'status'> & { practice_date?: string };
  today?: string;
}) {
  if (practice.status === 'cancelled') return <Badge status="cancelled">Cancelled</Badge>;
  const when = today && practice.practice_date ? timingLabel(practice.practice_date, today) : null;
  return (
    <span className="badges">
      <Badge>Practice</Badge>
      {when && (
        <Badge status="upcoming" className={when === 'Upcoming' ? undefined : 'soon'}>
          {when}
        </Badge>
      )}
    </span>
  );
}
