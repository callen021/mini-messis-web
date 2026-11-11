import { useMemo } from 'react';
import { Link } from 'react-router';
import { useIsStaff } from '@/auth/guards';
import { Footer, Group, Section } from '@/components/List';
import { cn } from '@/lib/cn';
import { useMyChildren } from '@/lineups/api';
import { type Player } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useSkillResults, useSkillTests } from './api';
import { bestOf, fmtResult, mainSide, shortTestName, type SkillResult, sortResults, trend } from './defaults';

/** Stats → Skills: players down the side, shown tests across, each cell the personal best with a trend arrow. */
export function SkillsMatrix({ players }: { players: readonly Player[] }) {
  const { teamId } = useCurrentTeam();
  const isStaff = useIsStaff();
  const children = useMyChildren();
  const tests = useSkillTests(teamId);
  const ids = useMemo(() => players.map((p) => p.id), [players]);
  const results = useSkillResults(teamId, ids);

  const shown = (tests.data ?? []).filter((t) => t.is_active);
  const mine = children.data ?? new Set<string>();
  const rows = isStaff ? players : players.filter((p) => mine.has(p.id));
  const byKey = useMemo(() => {
    const m = new Map<string, SkillResult[]>();
    for (const r of sortResults(results.data ?? [])) {
      const k = `${r.player_id}:${r.skill_test_id}`;
      const list = m.get(k) ?? [];
      list.push(r);
      m.set(k, list);
    }
    return m;
  }, [results.data]);

  return (
    <>
      <Section>
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Personal bests
          <span className="pill">
            {shown.length} test{shown.length === 1 ? '' : 's'}
          </span>
        </span>
      </Section>
      <Group className="matrix">
        {shown.length === 0 ? (
          <div className="empty">
            No tests shown.{isStaff ? ' Add or restore tests under Settings → Skills tests.' : ''}
          </div>
        ) : rows.length === 0 ? (
          <div className="empty">
            {isStaff
              ? 'Add players on the Team tab.'
              : 'Link your child from the team’s join code to see their results here.'}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Player</th>
                {shown.map((t) => (
                  <th key={t.id} scope="col" title={t.name}>
                    {shortTestName(t.name)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className={cn(!isStaff && mine.has(p.id) && 'me')}>
                  <td>
                    <Link to={`/players/${p.id}`} state={{ from: '/stats', fromLabel: 'Skills' }}>
                      {p.first_name}
                    </Link>
                  </td>
                  {shown.map((t) => {
                    const list = mainSide(t, byKey.get(`${p.id}:${t.id}`) ?? []);
                    const best = bestOf(t, list);
                    const tr = trend(t, list);
                    return (
                      <td key={t.id}>
                        {!best ? (
                          <span className="none">–</span>
                        ) : (
                          <>
                            <b>{fmtResult(t, best, false)}</b>
                            {tr !== 0 && (
                              <span
                                className={tr > 0 ? 'up' : 'dn'}
                                aria-label={tr > 0 ? 'improved' : 'slipped'}
                              >
                                {tr > 0 ? '↑' : '↓'}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Group>
      <Footer>
        Best result on record for each test. An arrow shows whether the latest result beat (↑) or missed (↓)
        the one before it. Swipe sideways for more tests; tap a name for the full history and trend.
      </Footer>
    </>
  );
}
