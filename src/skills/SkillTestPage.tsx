import { useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import { LoadingScreen, useIsStaff } from '@/auth/guards';
import { Button, Toolbar } from '@/components/Button';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { useActionSheet } from '@/components/Sheet';
import { Tile, Tiles } from '@/components/Tile';
import { useToast } from '@/components/Toast';
import { fmtDate } from '@/games/format';
import { errorMessage } from '@/lib/supabase';
import { useMyChildren } from '@/lineups/api';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import {
  useAddSkillResults,
  useDeleteSkillResult,
  useSkillResults,
  useSkillTests,
  useUpdateSkillResult,
} from './api';
import { bestOf, fmtResult, mainSide, metricSentence, type SkillResult, sortResults } from './defaults';
import { type PlayerBackState, playerBack } from './playerBack';
import { RecordResultSheet } from './RecordResultSheet';

/** One test for one player: Best / Latest / Sessions, the how-to, and the full history newest first. */
export function SkillTestPage() {
  const { playerId = '', testId = '' } = useParams<{ playerId: string; testId: string }>();
  const { teamId } = useCurrentTeam();
  const location = useLocation();
  const isStaff = useIsStaff();
  const toast = useToast();
  const sheet = useActionSheet();
  const players = usePlayers(teamId);
  const tests = useSkillTests(teamId);
  const results = useSkillResults(teamId, [playerId]);
  const children = useMyChildren();
  const add = useAddSkillResults(teamId);
  const update = useUpdateSkillResult(teamId);
  const del = useDeleteSkillResult(teamId);
  const [recording, setRecording] = useState(false);
  const [editing, setEditing] = useState<SkillResult | null>(null);

  const player = players.data?.find((p) => p.id === playerId);
  const test = tests.data?.find((t) => t.id === testId);
  const back = playerBack((location.state as PlayerBackState | null) ?? {}, {
    to: `/players/${playerId}/skills`,
    label: player?.first_name ?? 'Skills',
  });
  const all = useMemo(
    () => sortResults((results.data ?? []).filter((r) => r.skill_test_id === testId)),
    [results.data, testId],
  );

  if (players.isPending || tests.isPending) return <LoadingScreen />;
  if (!player || !test) {
    return (
      <Page title="Skill" back={back}>
        <p className="sub">This test is no longer available.</p>
      </Page>
    );
  }
  const canSee = isStaff || (children.data?.has(playerId) ?? false);
  const shownTests = (tests.data ?? []).filter((t) => t.is_active);
  const list = mainSide(test, all);
  const best = bestOf(test, list);
  const last = all[all.length - 1];
  const sessions = new Set(all.map((r) => r.tested_on)).size;
  const onError = (e: unknown) => toast(errorMessage(e));

  const deleteEditing = async () => {
    const r = editing;
    if (!r) return;
    setEditing(null);
    const ok = await sheet({
      title: 'Delete this result?',
      message: `${fmtDate(r.tested_on)} · ${fmtResult(test, r)}`,
      actions: [{ label: 'Delete result', value: true, destructive: true }],
    });
    if (ok) {
      del.mutate(r.id, { onError });
      toast('Result deleted');
    }
  };

  return (
    <Page title={test.name} sub={`${player.first_name} · ${metricSentence(test)}`} back={back}>
      {canSee && (
        <Tiles>
          <Tile label="Best" value={fmtResult(test, best)} />
          <Tile label="Latest" value={fmtResult(test, last)} />
          <Tile label="Sessions" value={sessions} />
        </Tiles>
      )}
      <Section>How to run it</Section>
      <Group>
        <div className="howto">
          <b>How to run it.</b> {test.instructions || 'No instructions yet.'}
        </div>
      </Group>
      {canSee && (
        <>
          <Section>History</Section>
          <Group className="hist">
            {[...all].reverse().map((r) => (
              <Row
                key={r.id}
                onClick={isStaff ? () => setEditing(r) : undefined}
                chevron={isStaff}
                label={
                  <span className="histrow">
                    <span className="d">{fmtDate(r.tested_on)}</span>
                    <span className="v">
                      {fmtResult(test, r)}
                      {best && r.id === best.id && <span className="chip pb">PB</span>}
                    </span>
                    <span className="n">{r.note ?? ''}</span>
                  </span>
                }
              />
            ))}
            {all.length === 0 && (
              <div className="empty">
                {isStaff ? 'No results yet. Record the first one below.' : 'No results yet.'}
              </div>
            )}
          </Group>
        </>
      )}
      {isStaff && (
        <>
          <Toolbar className="noprint">
            <Button onClick={() => setRecording(true)}>Record a result</Button>
          </Toolbar>
          <Footer>
            Results are kept in order; nothing is averaged away. Whoever recorded a result, or any coach, can
            edit or delete it.
          </Footer>
          <RecordResultSheet
            open={recording || !!editing}
            onClose={() => {
              setRecording(false);
              setEditing(null);
            }}
            playerId={playerId}
            playerName={player.first_name}
            tests={shownTests.some((t) => t.id === test.id) ? shownTests : [test, ...shownTests]}
            testId={test.id}
            existing={editing}
            onSave={(rows) => {
              add.mutate(rows, {
                onError,
                onSuccess: () => {
                  const next = mainSide(test, sortResults([...all, ...(rows as unknown as SkillResult[])]));
                  const b = bestOf(test, next);
                  const l = next[next.length - 1];
                  toast(
                    b && l && b === l && next.length > 1
                      ? `New personal best · ${fmtResult(test, l)}`
                      : `Saved · ${fmtResult(test, rows[0] ? { ...rows[0], attempts: rows[0].attempts ?? null, side: rows[0].side ?? null } : null)}`,
                  );
                },
              });
            }}
            onUpdate={(patch) => {
              if (editing) update.mutate({ id: editing.id, ...patch }, { onError });
              toast('Result updated');
            }}
            onDelete={() => void deleteEditing()}
          />
        </>
      )}
    </Page>
  );
}
