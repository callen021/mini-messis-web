import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useIsStaff } from '@/auth/guards';
import { Button, Toolbar } from '@/components/Button';
import { Footer, Group, Section } from '@/components/List';
import { useActionSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/supabase';
import { useMyChildren } from '@/lineups/api';
import { type Player } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useAddSkillResults, useSkillResults, useSkillTests, useUpdateSkillResult } from './api';
import {
  bestOf,
  fmtResult,
  mainSide,
  shortTestName,
  type SkillResult,
  type SkillTest,
  sortResults,
  trend,
} from './defaults';
import { RecordResultSheet } from './RecordResultSheet';
import { RecordSessionSheet } from './RecordSessionSheet';

/** Stats → Skills: players down the side, shown tests across, each cell the personal best with a trend arrow. */
export function SkillsMatrix({ players }: { players: readonly Player[] }) {
  const { teamId } = useCurrentTeam();
  const isStaff = useIsStaff();
  const toast = useToast();
  const sheet = useActionSheet();
  const children = useMyChildren();
  const tests = useSkillTests(teamId);
  const ids = useMemo(() => players.map((p) => p.id), [players]);
  const results = useSkillResults(teamId, ids);
  const add = useAddSkillResults(teamId);
  const update = useUpdateSkillResult(teamId);
  const [session, setSession] = useState(false);
  const [cell, setCell] = useState<{ player: Player; test: SkillTest; existing: SkillResult | null } | null>(
    null,
  );

  const shown = (tests.data ?? []).filter((t) => t.is_active);
  const mine = children.data ?? new Set<string>();
  const rows = isStaff ? players : players.filter((p) => mine.has(p.id));
  const active = players.filter((p) => p.is_available);
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
  const onError = (e: unknown) => toast(errorMessage(e));

  /** Tap a cell (staff): add a result for that player and test, or edit the latest one (D62). */
  const tapCell = async (p: Player, t: SkillTest) => {
    const list = byKey.get(`${p.id}:${t.id}`) ?? [];
    const latest = list[list.length - 1] ?? null;
    if (!latest) {
      setCell({ player: p, test: t, existing: null });
      return;
    }
    const choice = await sheet<'add' | 'edit'>({
      title: `${p.first_name} · ${t.name}`,
      message: `Latest: ${fmtResult(t, latest)}`,
      actions: [
        { label: 'Add a new result', value: 'add' },
        { label: `Edit latest (${fmtResult(t, latest)})`, value: 'edit' },
      ],
    });
    if (choice === 'add') setCell({ player: p, test: t, existing: null });
    else if (choice === 'edit') setCell({ player: p, test: t, existing: latest });
  };

  return (
    <>
      {isStaff && shown.length > 0 && (
        <Toolbar className="noprint">
          <Button onClick={() => setSession(true)} disabled={!active.length}>
            Record results
          </Button>
        </Toolbar>
      )}
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
                    <Link to={`/players/${p.id}/skills`} state={{ from: '/stats', fromLabel: 'Skills' }}>
                      {p.first_name}
                    </Link>
                  </td>
                  {shown.map((t) => {
                    const list = mainSide(t, byKey.get(`${p.id}:${t.id}`) ?? []);
                    const best = bestOf(t, list);
                    const tr = trend(t, list);
                    const content = !best ? (
                      <span className="none">–</span>
                    ) : (
                      <>
                        <b>{fmtResult(t, best, false)}</b>
                        {tr !== 0 && (
                          <span className={tr > 0 ? 'up' : 'dn'} aria-label={tr > 0 ? 'improved' : 'slipped'}>
                            {tr > 0 ? '↑' : '↓'}
                          </span>
                        )}
                      </>
                    );
                    return (
                      <td key={t.id}>
                        {isStaff ? (
                          <button
                            type="button"
                            className="cellbtn"
                            aria-label={`${p.first_name} · ${t.name}: ${best ? fmtResult(t, best, false) : 'no result'}. Tap to record`}
                            onClick={() => void tapCell(p, t)}
                          >
                            {content}
                          </button>
                        ) : (
                          content
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
        {isStaff ? ' Tap a cell to add or edit a result; Record results takes a whole session at once.' : ''}
      </Footer>
      {isStaff && (
        <>
          <RecordSessionSheet
            open={session}
            onClose={() => setSession(false)}
            tests={shown}
            players={active}
            busy={add.isPending}
            onSave={(rows) => {
              add.mutate(rows, {
                onError,
                onSuccess: () => {
                  setSession(false);
                  toast(`${rows.length} result${rows.length === 1 ? '' : 's'} saved`);
                },
              });
            }}
          />
          {cell && (
            <RecordResultSheet
              open
              onClose={() => setCell(null)}
              playerId={cell.player.id}
              playerName={cell.player.first_name}
              tests={shown}
              testId={cell.test.id}
              existing={cell.existing}
              onSave={(rows) => {
                add.mutate(rows, {
                  onError,
                  onSuccess: () => toast(rows.length > 1 ? 'Results saved' : 'Result saved'),
                });
              }}
              onUpdate={(patch) => {
                if (cell.existing) update.mutate({ id: cell.existing.id, ...patch }, { onError });
                toast('Result updated');
              }}
            />
          )}
        </>
      )}
    </>
  );
}
