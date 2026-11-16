import { useState } from 'react';
import { Navigate } from 'react-router';
import { LoadingScreen, useIsStaff } from '@/auth/guards';
import { Field, Select, TextInput } from '@/components/Form';
import { Footer, Group, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { LINE_ROLES, LINE_SLOTS, type Line, type LineKind, lineLabel, useLines, useSaveLine } from './api';

/**
 * A hockey team's lines (D122): three named forward lines (LW, C, RW) and two defense pairs
 * (LD, RD). Coaches and assistants name each and pick its players; the chips under the bench on
 * the live rink put a line on in one tap. Every change saves on its own.
 */
export function LinesPage() {
  const { teamId, sport } = useCurrentTeam();
  const isStaff = useIsStaff();
  const players = usePlayers(teamId);
  const lines = useLines(teamId);
  if (!isStaff || sport !== 'hockey') return <Navigate to="/team" replace />;
  if (players.isPending || lines.isPending) return <LoadingScreen />;
  const roster = (players.data ?? []).filter((p) => !p.archived_at);
  const saved = lines.data ?? [];
  return (
    <Page title="Lines" sub="Name each line and pick who plays where" back={{ to: '/team', label: 'Team' }}>
      {(['forward', 'defense'] as const).map((kind) => (
        <div key={kind}>
          <Section>{kind === 'forward' ? 'Forward lines' : 'Defense pairs'}</Section>
          <Group>
            {LINE_SLOTS.filter((s) => s.kind === kind).map(({ slot }) => (
              <LineEditor
                key={`${kind}${slot}`}
                teamId={teamId}
                kind={kind}
                slot={slot}
                line={saved.find((l) => l.kind === kind && l.slot === slot)}
                roster={roster}
              />
            ))}
          </Group>
        </div>
      ))}
      <Footer>
        On the live rink, tapping a line puts it on exactly as saved: a player already on the ice moves to
        their spot, whoever they replace goes to the bench, and a spot left empty is flagged. One Undo takes
        the whole change back.
      </Footer>
    </Page>
  );
}

function LineEditor({
  teamId,
  kind,
  slot,
  line,
  roster,
}: {
  teamId: string;
  kind: LineKind;
  slot: number;
  line: Line | undefined;
  roster: readonly { id: string; first_name: string; jersey_number: string | null }[];
}) {
  const toast = useToast();
  const save = useSaveLine(teamId);
  const roles = LINE_ROLES[kind];
  // the editor keeps its own copy: taps come faster than the refetch, and each save sends the whole line
  const [name, setName] = useState(line?.name ?? '');
  const [picks, setPicks] = useState<(string | null)[]>(roles.map((_, i) => line?.player_ids[i] ?? null));
  const label = lineLabel({ kind, slot });
  const commit = (nextName: string, nextPicks: (string | null)[]) =>
    save.mutate(
      { kind, slot, name: nextName.trim(), playerIds: nextPicks },
      { onError: (e) => toast(errorMessage(e)) },
    );
  // the picks are positional (LW, C, RW); an empty pick keeps its place so the others stay put
  const setPick = (i: number, id: string) => {
    const next = [...picks];
    next[i] = id || null;
    setPicks(next);
    commit(name, next);
  };
  return (
    <div className="lineeditor" role="group" aria-label={label}>
      <Field label={`${label} name`}>
        <TextInput
          value={name}
          maxLength={24}
          placeholder={label}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() !== (line?.name ?? '')) commit(name, picks);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </Field>
      <div className="linepicks">
        {roles.map((role, i) => (
          <Field key={role} label={`${label} ${role}`}>
            <Select value={picks[i] ?? ''} onChange={(e) => setPick(i, e.target.value)}>
              <option value="">—</option>
              {roster.map((p) => (
                <option key={p.id} value={p.id} disabled={picks.includes(p.id) && picks[i] !== p.id}>
                  {p.jersey_number ? `#${p.jersey_number} ` : ''}
                  {p.first_name}
                </option>
              ))}
            </Select>
          </Field>
        ))}
      </div>
    </div>
  );
}
