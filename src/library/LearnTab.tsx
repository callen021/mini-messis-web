import { Section } from '@/components/List';
import { StepCarousel } from './StepCarousel';
import { type LearnSection } from './types';

/** The Learn tab: what the skill is, step by step, in words a player can read. */
export function LearnTab({ learn }: { learn: LearnSection }) {
  return (
    <div className="learn">
      {learn.tagline && <p className="libtagline">{learn.tagline}</p>}
      {learn.focus && (
        <div className="libnote">
          <b>Main focus</b>
          <p>{learn.focus}</p>
        </div>
      )}
      {learn.steps.length > 0 && <StepCarousel steps={learn.steps} />}
      {learn.cues.length > 0 && (
        <>
          <Section>Coaching cues</Section>
          <ul className="libcues">
            {learn.cues.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      )}
      {learn.compare.length > 0 && (
        <>
          <Section>Wrong vs right</Section>
          <ul className="libcompare">
            {learn.compare.map((c) => (
              <li key={`${c.wrong}|${c.right}`}>
                <p className="wrong">
                  <span className="mark" aria-hidden="true">
                    ✕
                  </span>
                  <span>
                    <b>Wrong</b>
                    {c.wrong}
                  </span>
                </p>
                <p className="right">
                  <span className="mark" aria-hidden="true">
                    ✓
                  </span>
                  <span>
                    <b>Right</b>
                    {c.right}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
      {learn.bigPicture && (
        <>
          <Section>The big picture</Section>
          <div className="libnote big">
            <p>{learn.bigPicture}</p>
          </div>
        </>
      )}
    </div>
  );
}
