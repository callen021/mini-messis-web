import { useState } from 'react';
import { Section } from '@/components/List';
import { libraryImageUrl } from './api';
import { DrillDiagram } from './DrillDiagram';
import { type Challenge, type HomeSection, levelLabel, type StepImage } from './types';

/** "60 seconds · target 40", "Stopwatch · target 10.0 s". */
function challengeLine(c: Challenge): string {
  const how = c.mode === 'stopwatch' ? 'Stopwatch' : `${c.seconds} seconds`;
  if (c.target === null) return how;
  return `${how} · target ${c.mode === 'stopwatch' ? `${c.target.toFixed(1)} s` : c.target}`;
}

/** The drill's pictures, each once, with the levels it belongs to: one picture often serves all. */
function picturesOf(home: HomeSection): { image: StepImage; levels: string[] }[] {
  const out: { image: StepImage; levels: string[] }[] = [];
  home.levels.forEach((l, i) => {
    if (!l.image) return;
    const path = l.image.path;
    const have = out.find((p) => p.image.path === path);
    if (have) have.levels.push(`Level ${i + 1}`);
    else out.push({ image: l.image, levels: [`Level ${i + 1}`] });
  });
  return out;
}

/** One picture in its own shape, kept between a tall portrait and a wide landscape; nothing if it fails. */
function HomePicture({ image, caption }: { image: StepImage; caption: string | null }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const r = image.width && image.height ? image.width / image.height : 4 / 3;
  return (
    <figure className="homepic">
      <img
        src={libraryImageUrl(image.path)}
        width={image.width ?? undefined}
        height={image.height ?? undefined}
        style={{ aspectRatio: String(Math.max(3 / 4, Math.min(16 / 9, r))) }}
        alt=""
        decoding="async"
        onError={() => setFailed(true)}
      />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

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
  const pictures = picturesOf(home);
  return (
    <div className="homedrill">
      <HomeMeta home={home} />
      {home.intro && <p className="homeintro">{home.intro}</p>}
      {pictures.map((p) => (
        <HomePicture
          key={p.image.path}
          image={p.image}
          caption={pictures.length > 1 ? p.levels.join(', ') : null}
        />
      ))}
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
                {l.challenge && <span className="homechallenge">{challengeLine(l.challenge)}</span>}
                {l.harder && <span className="homeharder">Make it harder: {l.harder}</span>}
              </li>
            ))}
          </ol>
        </>
      )}
      {home.diagram && <DrillDiagram spec={home.diagram} params={[]} overrides={{}} />}
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
