import { Link } from 'react-router';
import { Group, Section } from '@/components/List';
import { errorMessage } from '@/lib/supabase';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useLibraryItems } from './api';
import { gamesFor } from './games';
import { ageText, CATEGORY_ORDER, categoryLabel } from './types';

/**
 * Training → Library (D135; it was Settings → Practice library): the sport's items as cards,
 * grouped by category.
 */
export function LibraryList() {
  const { sport } = useCurrentTeam();
  const items = useLibraryItems(sport);
  const rows = items.data ?? [];
  const games = gamesFor(sport);
  const categories = [
    ...CATEGORY_ORDER.filter((c) => rows.some((r) => r.category === c)),
    ...[...new Set(rows.map((r) => r.category))].filter((c) => !CATEGORY_ORDER.some((k) => k === c)),
  ];
  return (
    <>
      {items.isPending && (
        <Group>
          <div className="empty">Loading…</div>
        </Group>
      )}
      {items.isError && (
        <Group>
          <div className="empty" role="alert">
            {errorMessage(items.error)}
          </div>
        </Group>
      )}
      {items.data && rows.length === 0 && games.length === 0 && (
        <Group>
          <div className="empty">Nothing here yet for this sport.</div>
        </Group>
      )}
      {categories.map((c) => (
        <div key={c}>
          <Section>{categoryLabel(c)}</Section>
          <ul className="libcards">
            {rows
              .filter((r) => r.category === c)
              .map((r) => (
                <li key={r.id}>
                  <Link to={`/library/${r.slug}`} className="libcard">
                    <span className="lbl">
                      <b>{r.title}</b>
                      <small>
                        <span className="pill">{categoryLabel(r.category)}</span>
                        {ageText(r.age_min, r.age_max)}
                        {!r.is_published && <span className="pill draft">Draft</span>}
                      </small>
                    </span>
                    <span className="chev" aria-hidden="true" />
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      ))}
      {games.length > 0 && (
        <div>
          <Section>Games</Section>
          <ul className="libcards">
            {games.map((g) => (
              <li key={g.slug}>
                <Link to={`/library/play/${g.slug}`} className="libcard">
                  <span className="lbl">
                    <b>{g.title}</b>
                    <small>
                      <span className="pill">Game</span>
                      {ageText(g.ageMin, g.ageMax)}
                    </small>
                    <small>{g.blurb}</small>
                  </span>
                  <span className="chev" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
