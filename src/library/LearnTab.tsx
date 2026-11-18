import { Section } from '@/components/List';
import { libraryImageUrl } from './api';
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
      {learn.tips.length > 0 && (
        <>
          <Section>Technique tips</Section>
          <ul className="libtips">
            {learn.tips.map((t) => (
              <li key={t.title}>
                {t.image && (
                  <img
                    src={libraryImageUrl(t.image.path)}
                    width={t.image.width ?? undefined}
                    height={t.image.height ?? undefined}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                )}
                <b>{t.title}</b>
                {t.text && <span>{t.text}</span>}
              </li>
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
      {(learn.bigPicture || learn.bigPicturePoints.length > 0) && (
        <>
          <Section>The big picture</Section>
          <div className="libnote big">
            {learn.bigPicture && <p>{learn.bigPicture}</p>}
            {learn.bigPicturePoints.length > 0 && (
              <ul className="libticks">
                {learn.bigPicturePoints.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            {learn.bigPictureClose && <p className="close">{learn.bigPictureClose}</p>}
          </div>
        </>
      )}
    </div>
  );
}
