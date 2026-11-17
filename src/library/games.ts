import { type SportKey } from '@/sports/types';

/**
 * Games in the practice library (D124). A game is a self-contained HTML file under public/games,
 * shown full screen in a frame, so it shares nothing with the app but the origin (it keeps its own
 * progress in its own localStorage key). The list is code, not a database row: the file ships
 * with the build, and adding a game is adding the file and a line here.
 */
export interface LibraryGame {
  slug: string;
  sport: SportKey;
  title: string;
  blurb: string;
  ageMin: number | null;
  ageMax: number | null;
  /** Path under the app's base URL. */
  file: string;
}

export const LIBRARY_GAMES: readonly LibraryGame[] = [
  {
    slug: 'coachs-call',
    sport: 'soccer',
    title: 'Coach’s Call',
    blurb: 'Soccer skill games: hear the coach, make the play',
    ageMin: 6,
    ageMax: 9,
    file: 'games/coachs-call.html',
  },
];

export const gamesFor = (sport: SportKey): LibraryGame[] => LIBRARY_GAMES.filter((g) => g.sport === sport);
export const findGame = (slug: string | undefined): LibraryGame | undefined =>
  LIBRARY_GAMES.find((g) => g.slug === slug);
