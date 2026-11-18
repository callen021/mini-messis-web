import { useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Footer, Group } from '@/components/List';
import { useActionSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { fmtDate } from '@/games/format';
import { errorMessage } from '@/lib/supabase';
import {
  useAddSkillResults,
  useDeleteSkillResult,
  useSkillResults,
  useSkillTests,
  useUpdateSkillResult,
} from '@/skills/api';
import {
  bestOf,
  fmtResult,
  mainSide,
  metricSentence,
  type SkillResult,
  type SkillTest,
  SOURCE_LABEL,
  sortResults,
  sourceOf,
} from '@/skills/defaults';
import { HomeResultSheet } from './HomeResultSheet';

/** How many results a test shows before "Show all". */
const SHORT = 4;

/**
 * Skill Tests on the Training page (D132): the team's existing tests, with a child's Home and
 * Coach results shown together and labelled. Each source has its own best and latest; the two
 * are never mixed into one number. A parent records at home, and edits or deletes only the Home
 * results they recorded.
 */
export function SkillTestsTab({
  teamId,
  playerId,
  playerName,
  today,
}: {
  teamId: string;
  playerId: string;
  playerName: string;
  today: string;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const sheet = useActionSheet();
  const tests = useSkillTests(teamId);
  const results = useSkillResults(teamId, [playerId]);
  const add = useAddSkillResults(teamId);
  const update = useUpdateSkillResult(teamId);
  const del = useDeleteSkillResult(teamId);
  const [recording, setRecording] = useState<SkillTest | null>(null);
  const [editing, setEditing] = useState<SkillResult | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const shown = useMemo(() => (tests.data ?? []).filter((t) => t.is_active), [tests.data]);
  const byTest = useMemo(() => {
    const m = new Map<string, SkillResult[]>();
    for (const r of sortResults(results.data ?? [])) {
      const list = m.get(r.skill_test_id) ?? [];
      list.push(r);
      m.set(r.skill_test_id, list);
    }
    return m;
  }, [results.data]);
  const onError = (e: unknown) => toast(errorMessage(e));

  if (tests.isPending || results.isPending) {
    return (
      <Group>
        <div className="empty">Loading…</div>
      </Group>
    );
  }
  if (tests.isError || results.isError) {
    return (
      <Group>
        <div className="empty" role="alert">
          {errorMessage(tests.error ?? results.error)}
        </div>
      </Group>
    );
  }
  if (shown.length === 0) {
    return (
      <Group>
        <div className="empty">The coach has no skill tests shown yet.</div>
      </Group>
    );
  }

  const editingTest = editing ? (shown.find((t) => t.id === editing.skill_test_id) ?? null) : null;
  const deleteEditing = async () => {
    const r = editing;
    const t = editingTest;
    if (!r || !t) return;
    setEditing(null);
    const ok = await sheet({
      title: 'Delete this home result?',
      message: `${fmtDate(r.tested_on)} · ${fmtResult(t, r)}`,
      actions: [{ label: 'Delete result', value: true, destructive: true }],
    });
    if (ok) del.mutate(r.id, { onError, onSuccess: () => toast('Result deleted') });
  };

  return (
    <>
      <ul className="testcards">
        {shown.map((t) => {
          const all = byTest.get(t.id) ?? [];
          const newest = [...all].reverse();
          const open = expanded.has(t.id);
          const rows = open ? newest : newest.slice(0, SHORT);
          return (
            <li key={t.id} className="testcard">
              <h3>{t.name}</h3>
              <p className="how">
                {t.instructions || 'No instructions yet.'} {metricSentence(t)}
              </p>
              <dl className="srcbests">
                {(['home', 'coach'] as const).map((src) => {
                  const list = mainSide(
                    t,
                    all.filter((r) => sourceOf(r) === src),
                  );
                  const best = bestOf(t, list);
                  const last = list[list.length - 1];
                  return (
                    <div key={src} className={src}>
                      <dt>
                        <span className={`chip src ${src}`}>{SOURCE_LABEL[src]}</span>
                      </dt>
                      <dd>
                        {best ? (
                          <>
                            Best <b>{fmtResult(t, best, false)}</b> · latest {fmtResult(t, last, false)}
                          </>
                        ) : (
                          'No results yet'
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              {rows.length > 0 && (
                <ul className="srcrows" aria-label={`${t.name} results`}>
                  {rows.map((r) => {
                    const src = sourceOf(r);
                    const mine = src === 'home' && r.recorded_by === user?.id && !r.id.startsWith('temp-');
                    const body = (
                      <>
                        <span className="d">{fmtDate(r.tested_on)}</span>
                        <span className="v">{fmtResult(t, r)}</span>
                        <span className={`chip src ${src}`}>{SOURCE_LABEL[src]}</span>
                        <span className="n">{r.conditions ?? r.note ?? ''}</span>
                      </>
                    );
                    return (
                      <li key={r.id}>
                        {mine ? (
                          <button
                            type="button"
                            onClick={() => setEditing(r)}
                            aria-label={`Edit home result of ${fmtDate(r.tested_on)}`}
                          >
                            {body}
                            <span className="chev" aria-hidden="true" />
                          </button>
                        ) : (
                          <div>{body}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="testactions">
                <Button size="sm" onClick={() => setRecording(t)}>
                  Record at home
                </Button>
                {newest.length > SHORT && (
                  <button
                    type="button"
                    className="linkbtn"
                    aria-expanded={open}
                    onClick={() => {
                      const next = new Set(expanded);
                      if (open) next.delete(t.id);
                      else next.add(t.id);
                      setExpanded(next);
                    }}
                  >
                    {open ? 'Show fewer' : `Show all ${newest.length}`}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Footer>
        Home and Coach results are kept apart: each has its own best, and they are never mixed into one trend.
        You can change or delete the home results you recorded; the coach’s are theirs to change.
      </Footer>
      <HomeResultSheet
        open={!!recording || !!editing}
        onClose={() => {
          setRecording(null);
          setEditing(null);
        }}
        playerId={playerId}
        playerName={playerName}
        test={recording ?? editingTest}
        existing={editing}
        today={today}
        onSave={(rows) => add.mutate(rows, { onError, onSuccess: () => toast('Home result saved') })}
        onUpdate={(patch) => {
          if (editing)
            update.mutate(
              { id: editing.id, ...patch },
              { onError, onSuccess: () => toast('Result updated') },
            );
        }}
        onDelete={() => void deleteEditing()}
      />
    </>
  );
}
