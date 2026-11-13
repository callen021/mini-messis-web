import { type RsvpStatus } from './rsvp';

/** Small check (going) or cross (can't make it); nothing for no reply. */
export function RsvpIcon({ status }: { status: RsvpStatus }) {
  if (status === 'none') return null;
  return (
    <svg className={`rsvpico ${status}`} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="7.25" />
      {status === 'going' ? (
        <path d="M4.6 8.3l2.3 2.3 4.5-4.8" />
      ) : (
        <path d="M5.3 5.3l5.4 5.4M10.7 5.3l-5.4 5.4" />
      )}
    </svg>
  );
}

export interface RsvpMark {
  playerId: string;
  name: string;
  status: RsvpStatus;
}

/**
 * A parent's marks on a schedule row (D107): one icon per linked child who replied, each named
 * for screen readers; nothing when no child has replied.
 */
export function RsvpMarks({ marks }: { marks: readonly RsvpMark[] }) {
  const shown = marks.filter((m) => m.status !== 'none');
  if (!shown.length) return null;
  return (
    <span className="rsvpmarks">
      {shown.map((m) => (
        <span
          key={m.playerId}
          className="rsvpmark"
          role="img"
          aria-label={`${m.name}: ${m.status === 'going' ? 'going' : 'can’t make it'}`}
          title={`${m.name}: ${m.status === 'going' ? 'going' : 'can’t make it'}`}
        >
          <RsvpIcon status={m.status} />
          {marks.length > 1 && <small>{m.name}</small>}
        </span>
      ))}
    </span>
  );
}

/** The coach's "9 in · 2 out" on a schedule row. */
export function RsvpCountMark({ count }: { count: { in: number; out: number } }) {
  return (
    <span
      className={`rsvpcount${count.out ? ' hasout' : ''}`}
      aria-label={`${count.in} in, ${count.out} out`}
    >
      {count.in} in · {count.out} out
    </span>
  );
}
