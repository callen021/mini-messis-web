import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Field, TextInput } from '@/components/Form';
import { CheckIcon, PlusIcon } from '@/components/icons';
import { Footer, Group, Row, Section } from '@/components/List';
import { FormSheet, useActionSheet } from '@/components/Sheet';
import { Switch } from '@/components/Switch';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { useCurrentPlan } from '@/lineups/api';
import { SPORTS } from '@/sports/definitions';
import { type Player } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useAddPlayer, useArchivePlayer, useEveryoneBack, useSetAvailable, useUpdatePlayer } from './api';

export function RosterView({
  players,
  canEdit,
  highlight,
}: {
  players: Player[];
  canEdit: boolean;
  highlight: ReadonlySet<string>;
}) {
  const { teamId, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const toast = useToast();
  const sheet = useActionSheet();
  const plan = useCurrentPlan(teamId);
  const update = useUpdatePlayer(teamId);
  const setAvailable = useSetAvailable(teamId);
  const everyoneBack = useEveryoneBack(teamId);
  const archive = useArchivePlayer(teamId);
  const add = useAddPlayer(teamId);
  const [adding, setAdding] = useState(false);

  const active = players.filter((p) => p.is_available);
  const outs = players.filter((p) => !p.is_available);
  const N = plan.periods.length;
  const noun = S.periodName(N).toLowerCase();

  const onError = (e: unknown) => toast(errorMessage(e));

  const saveName = (p: Player, value: string) => {
    const v = value.trim().slice(0, 40);
    if (!v || v === p.first_name) return;
    update.mutate({ id: p.id, first_name: v }, { onError });
  };
  const saveNumber = (p: Player, value: string) => {
    const v = value.replace(/\D/g, '').slice(0, 3);
    if ((v || null) === p.jersey_number) return;
    update.mutate({ id: p.id, jersey_number: v || null }, { onError });
  };
  const toggle = (p: Player, on: boolean) => {
    const used = plan.periods.some((q) => q.slots.includes(p.id));
    setAvailable.mutate({ id: p.id, available: on }, { onError });
    toast(on ? `${p.first_name} is active` : `${p.first_name} out${used ? ' · positions cleared' : ''}`);
  };
  const remove = async (p: Player) => {
    const used = plan.periods.some((q) => q.slots.includes(p.id));
    const ok = await sheet({
      title: p.first_name,
      message:
        (used
          ? `This player is ${S.unit} in at least one ${noun}. Those jerseys will become unassigned. `
          : '') + 'Past game results keep their name and stats. Remove from the roster?',
      actions: [{ label: 'Remove player', value: true, destructive: true }],
    });
    if (!ok) return;
    archive.mutate(p.id, { onError, onSuccess: () => toast('Player removed') });
  };

  const editableRow = (p: Player, isOut: boolean) => (
    <div key={p.id} className={`prow${isOut ? ' out' : ''}`}>
      <input
        className="numin"
        defaultValue={p.jersey_number ?? ''}
        placeholder="#"
        inputMode="numeric"
        maxLength={3}
        aria-label={`${p.first_name} jersey number`}
        onBlur={(e) => saveNumber(p, e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <input
        className="name"
        defaultValue={p.first_name}
        placeholder="Player name"
        autoComplete="off"
        enterKeyHint="done"
        aria-label="Player name"
        onBlur={(e) => saveName(p, e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <Switch
        label={
          isOut
            ? `${p.first_name}: out — tap to make active`
            : `${p.first_name}: active — tap to mark out for this game`
        }
        size="md"
        checked={!isOut}
        onChange={(on) => toggle(p, on)}
      />
      <button type="button" className="rm" aria-label={`Remove ${p.first_name}`} onClick={() => remove(p)} />
      <Link to={`/players/${p.id}`} className="plink chev-link" aria-label={`Open ${p.first_name}`}>
        <span className="chev" aria-hidden="true" />
      </Link>
    </div>
  );

  const readRow = (p: Player, isOut: boolean) => (
    <div key={p.id} className={`prow${isOut ? ' out' : ''}${highlight.has(p.id) ? ' mine' : ''}`}>
      <div className="num">{p.jersey_number || '–'}</div>
      <Link to={`/players/${p.id}`} className="pname plink">
        {p.first_name}
      </Link>
      {highlight.has(p.id) && <Badge status="live">Mine</Badge>}
      {isOut && <Badge>Out</Badge>}
      <span className="chev" aria-hidden="true" />
    </div>
  );

  const row = canEdit ? editableRow : readRow;
  const ordered = highlight.size
    ? [...active.filter((p) => highlight.has(p.id)), ...active.filter((p) => !highlight.has(p.id))]
    : active;

  return (
    <>
      <Section>Playing today</Section>
      <Group>
        {ordered.map((p) => row(p, false))}
        {!players.length && (
          <div className="prow">No players yet{canEdit ? ' — add your team below.' : '.'}</div>
        )}
        {players.length > 0 && !active.length && (
          <div className="prow">
            Everyone is marked out{canEdit ? ' — flip a switch below to activate.' : '.'}
          </div>
        )}
      </Group>
      {canEdit && (
        <Footer style={{ marginTop: 8 }}>
          Switch a player off if they’re not at the game. They move to the Out list and disappear from the
          jersey menus, rotation and batting order until you switch them back on.
        </Footer>
      )}
      {outs.length > 0 && (
        <>
          <Section>Out this game</Section>
          <Group>{outs.map((p) => row(p, true))}</Group>
          {canEdit && (
            <Group style={{ marginTop: 12 }}>
              <Row
                icon={<CheckIcon />}
                iconColor="var(--green)"
                label="Everyone’s back"
                detail="Mark the whole roster active for the next game"
                link
                onClick={() =>
                  everyoneBack.mutate(undefined, { onError, onSuccess: () => toast('Everyone is active') })
                }
              />
            </Group>
          )}
        </>
      )}
      {canEdit && (
        <Group style={{ marginTop: 12 }}>
          <Row
            icon={<PlusIcon />}
            iconColor="var(--tint)"
            label="Add player"
            link
            onClick={() => setAdding(true)}
          />
        </Group>
      )}
      <Footer>
        {canEdit
          ? 'Removing a player keeps their name on past game results.'
          : `${players.length} player${players.length === 1 ? '' : 's'} on the roster.`}
      </Footer>
      {canEdit && (
        <AddPlayerSheet
          open={adding}
          onClose={() => setAdding(false)}
          onAdd={(firstName, number) =>
            add.mutateAsync({ firstName, number }).then(() => toast(`${firstName} added`), onError)
          }
        />
      )}
    </>
  );
}

function AddPlayerSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (firstName: string, number: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await onAdd(name.trim(), number.replace(/\D/g, '').slice(0, 3));
    setBusy(false);
    setName('');
    setNumber('');
    onClose();
  };
  return (
    <FormSheet open={open} onClose={onClose} title="Add player">
      <form onSubmit={submit} className="form" style={{ padding: 0 }}>
        <Field label="First name">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            autoComplete="off"
            required
            data-autofocus=""
          />
        </Field>
        <Field label="Jersey number (optional)">
          <TextInput
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 3))}
            inputMode="numeric"
            maxLength={3}
          />
        </Field>
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? 'Adding…' : 'Add player'}
        </Button>
      </form>
    </FormSheet>
  );
}
