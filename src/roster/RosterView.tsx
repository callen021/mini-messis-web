import { type FormEvent, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Badge } from '@/components/Badge';
import { Button, Toolbar } from '@/components/Button';
import { Field, TextInput } from '@/components/Form';
import { PlusIcon } from '@/components/icons';
import { Footer, Group, Row, Section } from '@/components/List';
import { FormSheet, useActionSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { useCurrentPlan } from '@/lineups/api';
import { type PlayerContact, useRosterDirectory, useTeamContacts } from '@/players/api';
import { buildVCards, deliverVcf } from '@/players/vcard';
import { SPORTS } from '@/sports/definitions';
import { type Player } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useAddPlayer, useArchivePlayer, useUpdatePlayer } from './api';

/**
 * Team → Roster is the team directory (D57): number, name and the parents' first names the viewer
 * may see; tapping opens the contact card. Staff controls sit behind an Edit roster button; the
 * game-day out switch lives on Rotation.
 */
export function RosterView({
  players,
  canEdit,
  highlight,
}: {
  players: Player[];
  canEdit: boolean;
  highlight: ReadonlySet<string>;
}) {
  const { teamId, team, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const toast = useToast();
  const sheet = useActionSheet();
  const location = useLocation();
  const plan = useCurrentPlan(teamId);
  const directory = useRosterDirectory(teamId);
  const ids = useMemo(() => players.map((p) => p.id), [players]);
  const contacts = useTeamContacts(teamId, ids);
  const update = useUpdatePlayer(teamId);
  const archive = useArchivePlayer(teamId);
  const add = useAddPlayer(teamId);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  const N = plan.periods.length;
  const noun = S.periodName(N).toLowerCase();
  const onError = (e: unknown) => toast(errorMessage(e));
  const back = { from: location.pathname, fromLabel: 'Team' };
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

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

  const addAll = () => {
    const list = (contacts.data ?? []).map((c: PlayerContact) => ({
      name: c.name,
      relationship: c.relationship,
      phone: c.phone,
      email: c.email,
      childName: byId.get(c.player_id)?.first_name ?? 'player',
      teamName: team.name,
    }));
    if (!list.length) {
      toast('No contacts to add yet');
      return;
    }
    deliverVcf(buildVCards(list), `${team.name}-contacts.vcf`);
    toast(`${list.length} contact${list.length === 1 ? '' : 's'} ready for your phone`);
  };

  const directoryRow = (p: Player) => {
    const parents = directory.data?.get(p.id) ?? [];
    return (
      <Link
        key={p.id}
        to={`/players/${p.id}`}
        state={back}
        className={`prow dir${!p.is_available ? ' out' : ''}${highlight.has(p.id) ? ' mine' : ''}`}
      >
        <div className="num">{p.jersey_number || '–'}</div>
        <div className="pname">
          {p.first_name}
          {p.last_name ? ` ${p.last_name}` : ''}
          <span className="parents">
            {parents.length ? parents.join(' · ') : canEdit ? 'No parent on file' : ''}
          </span>
        </div>
        {highlight.has(p.id) && <Badge status="live">Mine</Badge>}
        {!p.is_available && <Badge>Out</Badge>}
        <span className="chev" aria-hidden="true" />
      </Link>
    );
  };

  const editableRow = (p: Player) => (
    <div key={p.id} className={`prow${!p.is_available ? ' out' : ''}`}>
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
      <button type="button" className="rm" aria-label={`Remove ${p.first_name}`} onClick={() => remove(p)} />
      <Link
        to={`/players/${p.id}`}
        state={back}
        className="plink chev-link"
        aria-label={`Open ${p.first_name}`}
      >
        <span className="chev" aria-hidden="true" />
      </Link>
    </div>
  );

  const ordered = highlight.size
    ? [...players.filter((p) => highlight.has(p.id)), ...players.filter((p) => !highlight.has(p.id))]
    : players;
  const contactCount = contacts.data?.length ?? 0;

  return (
    <>
      {canEdit && (
        <Toolbar className="noprint">
          <Button variant={editing ? 'primary' : 'tinted'} onClick={() => setEditing((v) => !v)}>
            {editing ? 'Done' : 'Edit roster'}
          </Button>
          {!editing && (
            <Button variant="gray" onClick={addAll} disabled={!contactCount}>
              Add all to contacts
            </Button>
          )}
        </Toolbar>
      )}
      {!canEdit && contactCount > 0 && (
        <Toolbar className="noprint">
          <Button variant="gray" onClick={addAll}>
            Add all to contacts
          </Button>
        </Toolbar>
      )}
      <Section>{editing ? 'Edit roster' : 'Players'}</Section>
      <Group>
        {ordered.map((p) => (editing ? editableRow(p) : directoryRow(p)))}
        {!players.length && (
          <div className="prow">No players yet{canEdit ? ' — tap Edit roster, then Add player.' : '.'}</div>
        )}
      </Group>
      {editing && (
        <Group style={{ marginTop: 12 }}>
          <Row
            icon={<PlusIcon />}
            iconColor="var(--tint)"
            label="Add player"
            link
            onClick={() => setAdding(true)}
          />
          <Row
            to="/team/sheet"
            label="Team sheet"
            detail="Birthdates, shirt sizes and every parent"
            chevron
          />
        </Group>
      )}
      <Footer>
        {editing
          ? 'Numbers and names save as you type. Removing a player keeps their name on past game results. Mark players out for a game on the Rotation view.'
          : canEdit
            ? `${players.length} player${players.length === 1 ? '' : 's'}. Tap a player for their contact card. Add all to contacts saves every contact you can see to your phone.`
            : `${players.length} player${players.length === 1 ? '' : 's'}. Tap a player for the contacts their family shares with the team.`}
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
