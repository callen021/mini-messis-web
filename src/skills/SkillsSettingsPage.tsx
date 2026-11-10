import { useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { LoadingScreen, useIsStaff } from '@/auth/guards';
import { ChevronDownIcon, ChevronUpIcon, PlusIcon } from '@/components/icons';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { Sheet, SheetButton, SheetGroup, SheetHeader, useActionSheet } from '@/components/Sheet';
import { Switch } from '@/components/Switch';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { ENABLED_SPORTS, SPORTS } from '@/sports/definitions';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import {
  useAddSkillTest,
  useDeleteSkillTest,
  useReorderSkillTests,
  useRestoreSkillTests,
  useSkillResults,
  useSkillTests,
  useUpdateSkillTest,
} from './api';
import {
  DEFAULT_SKILL_TESTS,
  type DefaultSkillTest,
  defaultFor,
  metricLabel,
  type SkillTest,
} from './defaults';
import { EditTestSheet } from './EditTestSheet';

/** Settings → Skills tests: show/hide, reorder, edit, add custom, add from library, restore defaults. */
export function SkillsSettingsPage() {
  const { teamId, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const isStaff = useIsStaff();
  const toast = useToast();
  const sheet = useActionSheet();
  const tests = useSkillTests(teamId);
  const players = usePlayers(teamId);
  const ids = useMemo(() => (players.data ?? []).map((p) => p.id), [players.data]);
  const results = useSkillResults(teamId, ids);
  const add = useAddSkillTest(teamId);
  const update = useUpdateSkillTest(teamId);
  const remove = useDeleteSkillTest(teamId);
  const reorder = useReorderSkillTests(teamId);
  const restore = useRestoreSkillTests(teamId, sport);
  const [editing, setEditing] = useState<SkillTest | null | 'new'>(null);
  const [library, setLibrary] = useState(false);

  if (!isStaff) return <Navigate to="/settings" replace />;
  if (tests.isPending) return <LoadingScreen />;

  const all = tests.data ?? [];
  const shown = all.filter((t) => t.is_active);
  const hidden = all.filter((t) => !t.is_active);
  const withResults = new Set((results.data ?? []).map((r) => r.skill_test_id));
  const onError = (e: unknown) => toast(errorMessage(e));
  const defaults = DEFAULT_SKILL_TESTS[sport];
  const restorable =
    defaults.some((d) => !all.some((t) => t.key === d.key)) || hidden.some((t) => defaultFor(sport, t.key));

  const toggle = (t: SkillTest, on: boolean) => {
    update.mutate({ id: t.id, is_active: on }, { onError });
    toast(on ? `${t.name} shown` : `${t.name} hidden · history kept`);
  };
  const move = (i: number, to: number) => {
    if (to < 0 || to >= shown.length) return;
    const ids2 = shown.map((t) => t.id);
    const a = ids2[i];
    const b = ids2[to];
    if (a === undefined || b === undefined) return;
    ids2[i] = b;
    ids2[to] = a;
    reorder.mutate([...ids2, ...hidden.map((t) => t.id)], { onError });
  };
  const deleteTest = async (t: SkillTest) => {
    setEditing(null);
    const ok = await sheet({
      title: `Delete ${t.name}?`,
      message: 'This test has no results, so it can be removed.',
      actions: [{ label: 'Delete test', value: true, destructive: true }],
    });
    if (ok) {
      remove.mutate(t.id, { onError });
      toast(`${t.name} deleted`);
    }
  };
  const addFromLibrary = (d: DefaultSkillTest, from: string) => {
    const { draft: _d, ...input } = d;
    add.mutate(
      { ...input, unit: input.unit ?? null },
      { onError, onSuccess: () => toast(`${d.name} added from ${from}`) },
    );
    setLibrary(false);
  };

  const testRow = (t: SkillTest, i: number, list: SkillTest[]) => {
    const draft = defaultFor(sport, t.key)?.draft;
    const custom = !defaultFor(sport, t.key);
    return (
      <div key={t.id} className="row testrow">
        <Switch
          label={`${t.name} ${t.is_active ? 'shown' : 'hidden'}`}
          size="md"
          checked={t.is_active}
          onChange={(on) => toggle(t, on)}
        />
        <button type="button" className="lbl lblbtn" onClick={() => setEditing(t)}>
          <span>
            {t.name}
            {draft && <span className="chip draft">DRAFT</span>}
            {custom && <span className="chip">CUSTOM</span>}
          </span>
          <small>
            {metricLabel(t)}
            {withResults.has(t.id) ? ' · has results' : ''}
          </small>
        </button>
        {t.is_active ? (
          <div className="updown">
            <button
              type="button"
              aria-label={`Move ${t.name} up`}
              disabled={i === 0}
              onClick={() => move(i, i - 1)}
            >
              <ChevronUpIcon />
            </button>
            <button
              type="button"
              aria-label={`Move ${t.name} down`}
              disabled={i === list.length - 1}
              onClick={() => move(i, i + 1)}
            >
              <ChevronDownIcon />
            </button>
          </div>
        ) : (
          <span className="chev" aria-hidden="true" />
        )}
      </div>
    );
  };

  return (
    <Page
      title="Skills tests"
      sub={`${S.emoji} ${S.name} · ${shown.length} shown${hidden.length ? ` · ${hidden.length} hidden` : ''}`}
      back={{ to: '/settings', label: 'Settings' }}
    >
      <Section>Shown on player pages</Section>
      <Group>
        {shown.map((t, i) => testRow(t, i, shown))}
        {shown.length === 0 && (
          <div className="empty">Nothing shown. Switch a hidden test back on or add one.</div>
        )}
      </Group>
      {hidden.length > 0 && (
        <>
          <Section>Hidden</Section>
          <Group>{hidden.map((t, i) => testRow(t, i, hidden))}</Group>
        </>
      )}
      <Group style={{ marginTop: 12 }}>
        <Row
          icon={<PlusIcon />}
          iconColor="var(--tint)"
          label="Add a custom test"
          link
          chevron
          onClick={() => setEditing('new')}
        />
        <Row
          icon="📚"
          label="Add from library"
          detail="Tests from other sports’ default sets"
          link
          chevron
          onClick={() => setLibrary(true)}
        />
        {restorable && (
          <Row
            icon="↺"
            label="Restore defaults"
            detail="Bring back any hidden or missing default test"
            link
            onClick={() =>
              restore.mutate(undefined, {
                onError,
                onSuccess: (n) =>
                  toast(n ? `${n} default test${n > 1 ? 's' : ''} restored` : 'All defaults already shown'),
              })
            }
          />
        )}
      </Group>
      <Footer>
        Tap a test to edit it. The order here is the order on every player page and on the Stats table. Hidden
        tests keep their history. A test with results can be hidden but not deleted.
      </Footer>
      <EditTestSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        test={editing === 'new' ? null : editing}
        locked={editing !== null && editing !== 'new' && withResults.has(editing.id)}
        onSave={(input) => {
          if (editing && editing !== 'new') {
            const locked = withResults.has(editing.id);
            update.mutate(
              locked
                ? { id: editing.id, name: input.name, instructions: input.instructions }
                : { id: editing.id, ...input },
              { onError },
            );
            toast('Test updated');
          } else add.mutate(input, { onError, onSuccess: (t) => toast(`${t.name} added`) });
        }}
        onDelete={() => editing && editing !== 'new' && void deleteTest(editing)}
      />
      <Sheet open={library} onClose={() => setLibrary(false)} label="Add from library">
        <SheetGroup>
          <SheetHeader
            title="Add from library"
            message="Default tests from the other sports. Added tests become this team’s own copy to edit."
          />
        </SheetGroup>
        {ENABLED_SPORTS.filter((k) => k !== sport).map((k) => {
          const avail = DEFAULT_SKILL_TESTS[k].filter((d) => !all.some((t) => t.key === d.key));
          if (!avail.length) return null;
          return (
            <SheetGroup key={k}>
              <SheetHeader message={`${SPORTS[k].emoji} ${SPORTS[k].name}`} />
              {avail.map((d) => (
                <SheetButton key={d.key} onClick={() => addFromLibrary(d, SPORTS[k].name)}>
                  {d.name} ·{' '}
                  {metricLabel({
                    ...d,
                    unit: d.unit ?? null,
                    attempts: d.attempts ?? 5,
                    has_sides: d.has_sides ?? false,
                    higher_is_better: d.higher_is_better ?? true,
                  })}
                </SheetButton>
              ))}
            </SheetGroup>
          );
        })}
        <SheetGroup>
          <SheetButton cancel onClick={() => setLibrary(false)} initialFocus>
            Cancel
          </SheetButton>
        </SheetGroup>
      </Sheet>
    </Page>
  );
}
