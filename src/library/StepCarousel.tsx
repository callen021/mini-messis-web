import { useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { libraryImageUrl } from './api';
import { type LearnStep } from './types';

/** Frame shape for a step image: its own, kept between a tall portrait and a wide landscape. */
function frameRatio(step: LearnStep): number {
  const { width, height } = step.image ?? { width: null, height: null };
  const r = width && height ? width / height : 4 / 3;
  return Math.max(3 / 4, Math.min(16 / 9, r));
}

function StepImage({ step, n, eager }: { step: LearnStep; n: number; eager: boolean }) {
  const [failed, setFailed] = useState(false);
  const show = step.image && !failed;
  return (
    <div className={cn('stepimg', !show && 'none')} style={{ aspectRatio: String(frameRatio(step)) }}>
      {show && step.image ? (
        <img
          src={libraryImageUrl(step.image.path)}
          width={step.image.width ?? undefined}
          height={step.image.height ?? undefined}
          alt=""
          decoding="async"
          loading={eager ? 'eager' : 'lazy'}
          onError={() => setFailed(true)}
        />
      ) : (
        // no picture yet (or it did not load): the step number stands in
        <span aria-hidden="true">{n}</span>
      )}
    </div>
  );
}

/**
 * Swipeable step cards: a large picture with the title and text drawn by the app. A scroll-snap
 * row, so a swipe, a trackpad or the dots all work; the next card peeks in from the right. The
 * row scrolls on its own, the page never scrolls sideways.
 */
export function StepCarousel({ steps }: { steps: readonly LearnStep[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(0);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let dist = Infinity;
    Array.from(el.children).forEach((c, i) => {
      const card = c as HTMLElement;
      const d = Math.abs(card.offsetLeft - el.offsetLeft + card.offsetWidth / 2 - mid);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    setActive((a) => (a === best ? a : best));
  };
  const go = (i: number) => {
    const el = ref.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (!el || !card) return;
    el.scrollTo({
      left: card.offsetLeft - el.offsetLeft - (el.clientWidth - card.offsetWidth) / 2,
      behavior: 'smooth',
    });
  };

  return (
    <section className="steps" aria-roledescription="carousel" aria-label="Steps">
      <ol className="steprow" ref={ref} onScroll={onScroll}>
        {steps.map((s, i) => (
          <li key={i} className="stepcard" aria-label={`Step ${i + 1} of ${steps.length}: ${s.title}`}>
            <StepImage step={s} n={i + 1} eager={i === 0} />
            <div className="steptext">
              <h2>
                <span className="stepnum">{i + 1}</span>
                {s.title}
              </h2>
              <p>{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
      {steps.length > 1 && (
        <div className="stepdots">
          {steps.map((s, i) => (
            <button
              key={i}
              type="button"
              className={cn(i === active && 'on')}
              aria-label={`Step ${i + 1}: ${s.title}`}
              aria-current={i === active ? 'step' : undefined}
              onClick={() => go(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
