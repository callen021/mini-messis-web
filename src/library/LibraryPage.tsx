import { type ReactNode, useId } from 'react';
import { Link } from 'react-router';
import { Group } from '@/components/List';
import { errorMessage } from '@/lib/supabase';
import { useUIStore } from '@/lib/ui-store';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useLibraryItems } from './api';
import { gamesFor, type LibraryGame } from './games';
import {
  ageText,
  categoryLabel,
  GAMES_CATEGORY,
  groupDrills,
  LIBRARY_CATEGORIES,
  type LibraryItemSummary,
} from './types';

function ItemCard({ row }: { row: LibraryItemSummary }) {
  return (
    <li>
      <Link to={`/library/${row.slug}`} className="libcard">
        <span className="lbl">
          <b>{row.title}</b>
          <small>
            <span className="pill">{categoryLabel(row.category)}</span>
            {ageText(row.age_min, row.age_max)}
            {!row.is_published && <span className="pill draft">Draft</span>}
          </small>
        </span>
        <span className="chev" aria-hidden="true" />
      </Link>
    </li>
  );
}

function GameCard({ game }: { game: LibraryGame }) {
  return (
    <li>
      <Link to={`/library/play/${game.slug}`} className="libcard">
        <span className="lbl">
          <b>{game.title}</b>
          <small>
            <span className="pill">Game</span>
            {ageText(game.ageMin, game.ageMax)}
          </small>
          <small>{game.blurb}</small>
        </span>
        <span className="chev" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** One category: a row with its name and count that opens and closes its items. */
function Category({
  label,
  count,
  open,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className={open ? 'libcat open' : 'libcat'}>
      <h2>
        <button
          type="button"
          className="libcathead"
          aria-expanded={open}
          aria-controls={`${id}-items`}
          onClick={onToggle}
        >
          <span className="name">{label}</span>
          <span className="count" aria-label={`${count} ${count === 1 ? 'item' : 'items'}`}>
            {count}
          </span>
          <span className="chev" aria-hidden="true" />
        </button>
      </h2>
      {open && (
        <div className="libcatbody" id={`${id}-items`}>
          {children}
        </div>
      )}
    </section>
  );
}

/**
 * Training → Library (D135, reorganized in D139): the sport's items by category. Each category is
 * a row with its count, closed until tapped; the ones left open are remembered on the device.
 * Drills are listed under their groups. A count is what this viewer can open: drafts are counted
 * for a platform admin, the only one who gets them.
 */
export function LibraryList() {
  const { sport } = useCurrentTeam();
  const items = useLibraryItems(sport);
  const openKeys = useUIStore((s) => s.libraryOpen);
  const toggle = useUIStore((s) => s.toggleLibrary);
  const rows = items.data ?? [];
  const games = gamesFor(sport);

  // the listed categories in order, then any the database has that this build does not name
  const keys = [
    ...LIBRARY_CATEGORIES.map((c) => c.key),
    ...[...new Set(rows.map((r) => r.category))].filter((c) => !LIBRARY_CATEGORIES.some((k) => k.key === c)),
  ];
  const categories = keys.flatMap((key) => {
    if (key === GAMES_CATEGORY) {
      if (games.length === 0) return [];
      const body = (
        <ul className="libcards">
          {games.map((g) => (
            <GameCard key={g.slug} game={g} />
          ))}
        </ul>
      );
      return [{ key, count: games.length, body }];
    }
    const mine = rows.filter((r) => r.category === key);
    if (mine.length === 0) return [];
    const body =
      key === 'home' ? (
        groupDrills(mine).map((g) => (
          <div key={g.group} role="group" aria-label={g.group}>
            <h3 className="libgroup">{g.group}</h3>
            <ul className="libcards">
              {g.rows.map((r) => (
                <ItemCard key={r.id} row={r} />
              ))}
            </ul>
          </div>
        ))
      ) : (
        <ul className="libcards">
          {mine.map((r) => (
            <ItemCard key={r.id} row={r} />
          ))}
        </ul>
      );
    return [{ key, count: mine.length, body }];
  });

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
      {items.data && categories.length === 0 && (
        <Group>
          <div className="empty">Nothing here yet for this sport.</div>
        </Group>
      )}
      {!items.isPending &&
        categories.map((c) => (
          <Category
            key={c.key}
            label={categoryLabel(c.key)}
            count={c.count}
            open={openKeys.includes(c.key)}
            onToggle={() => toggle(c.key)}
          >
            {c.body}
          </Category>
        ))}
    </>
  );
}
