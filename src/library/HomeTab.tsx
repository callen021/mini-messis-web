import { Section } from '@/components/List';
import { type HomeSection, levelLabel } from './types';

/** "Footwork · Repetition · 3 min", each part only when the drill gives it. */
export function HomeMeta({ home }: { home: HomeSection }) {
  return (
    <span className="homemeta">
      {home.skill && <span className="pill">{home.skill}</span>}
      <span>{home.typeLabel}</span>
      {home.minutes !== null && <span>· {home.minutes} min</span>}
    </span>
  );
}

/**
 * The At Home tab (D127): one drill as a parent reads it — what it is, the two ways to do it,
 * the three levels and what to say while practising. The demo clip description is stored for
 * later and not shown: there are no videos yet.
 */
export function HomeTab({ home }: { home: HomeSection }) {
  return (
    <div className="homedrill">
      <HomeMeta home={home} />
      {home.intro && <p className="homeintro">{home.intro}</p>}
      {home.withParent && (
        <div className="libnote">
          <b>With a parent</b>
          <p>{home.withParent}</p>
        </div>
      )}
      {home.onMyOwn && (
        <div className="libnote">
          <b>On my own</b>
          <p>{home.onMyOwn}</p>
        </div>
      )}
      {home.levels.length > 0 && (
        <>
          <Section>Levels</Section>
          <ol className="homelevels">
            {home.levels.map((l, i) => (
              <li key={i}>
                <b>{levelLabel(home, i)}</b>
                <span>{l.text}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      {home.notes.map((n) => (
        <div className="libnote" key={n.title}>
          <b>{n.title}</b>
          <p>{n.text}</p>
        </div>
      ))}
      {home.tips && (
        <div className="libnote big">
          <b>Coaching tips</b>
          <p>{home.tips}</p>
        </div>
      )}
    </div>
  );
}
