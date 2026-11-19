import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { useWakeLock } from '@/clock/useWakeLock';
import { ChevronLeftIcon } from '@/components/icons';
import { useCurrentTeam } from '@/teams/TeamContext';
import { findGame } from './games';

/**
 * A library game, full screen (D124): a slim bar with the way back, and the game's own page in a
 * frame over everything else, tab bar included, because the games are built for the whole height
 * of a phone. The screen stays awake while it is open.
 */
export function GamePage() {
  const { game: slug } = useParams();
  const { sport } = useCurrentTeam();
  const game = findGame(slug);
  useWakeLock(true);
  useEffect(() => {
    if (game) document.title = `${game.title} · Mini-Messi's`;
  }, [game]);
  if (!game || game.sport !== sport) return <Navigate to="/training?tab=library" replace />;
  return (
    <section className="gamepage">
      <div className="gamebar">
        <Link to="/training?tab=library" className="back">
          <ChevronLeftIcon />
          Library
        </Link>
        <h1>{game.title}</h1>
      </div>
      <iframe
        className="gameframe"
        title={game.title}
        src={`${import.meta.env.BASE_URL}${game.file}`}
        allow="autoplay"
        onLoad={(e) => e.currentTarget.focus()}
      />
    </section>
  );
}
