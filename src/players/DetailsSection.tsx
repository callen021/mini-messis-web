import { type FormEvent, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Field, Select, TextInput } from '@/components/Form';
import { Footer, Group, Row, Section } from '@/components/List';
import { FormSheet, useActionSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { fmtDate } from '@/games/format';
import { errorMessage } from '@/lib/supabase';
import {
  ageOn,
  type PlayerContact,
  SHIRT_SIZES,
  type ShirtSize,
  shirtSizeLabel,
  useDeleteContact,
  usePlayerContacts,
  usePlayerDetails,
  useSaveContact,
  useSavePlayerDetails,
} from './api';

const RELATIONSHIPS = ['Mother', 'Father', 'Parent', 'Guardian', 'Grandparent', 'Step-parent', 'Other'];

/**
 * Birthdate, shirt size and contacts for one player (D52). Rendered only for staff and the
 * player's own guardians (RLS would return nothing for anyone else anyway); both may edit.
 */
export function DetailsSection({
  playerId,
  playerName,
  canEdit,
  compact = false,
}: {
  playerId: string;
  playerName: string;
  canEdit: boolean;
  /** Parent home: no section header of its own. */
  compact?: boolean;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const sheet = useActionSheet();
  const details = usePlayerDetails(playerId);
  const contacts = usePlayerContacts(playerId);
  const save = useSavePlayerDetails(playerId);
  const saveContact = useSaveContact(playerId);
  const removeContact = useDeleteContact(playerId);
  const [editing, setEditing] = useState<PlayerContact | 'new' | null>(null);
  const onError = (e: unknown) => toast(errorMessage(e));

  const d = details.data;
  const age = ageOn(d?.birthdate);
  const list = contacts.data ?? [];

  const remove = async (c: PlayerContact) => {
    const ok = await sheet({
      title: `Remove ${c.name}?`,
      actions: [{ label: 'Remove contact', value: true, destructive: true }],
    });
    if (!ok) return;
    removeContact.mutate(c.id, { onError, onSuccess: () => toast('Contact removed') });
  };

  const contactDetail = (c: PlayerContact) =>
    [c.relationship, c.phone, c.email].filter(Boolean).join(' · ') || 'No phone or email yet';

  return (
    <>
      {!compact && <Section>Details</Section>}
      <Group>
        <Row label="Birthdate" detail={age !== null ? `${age} years old` : undefined}>
          {canEdit ? (
            <input
              className="inline"
              type="date"
              aria-label="Birthdate"
              value={d?.birthdate ?? ''}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => {
                const v = e.target.value || null;
                if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
                save.mutate({ birthdate: v }, { onError });
              }}
            />
          ) : (
            <span className="val">{d?.birthdate ? fmtDate(d.birthdate, true) : '–'}</span>
          )}
        </Row>
        <Row label="Shirt size">
          {canEdit ? (
            <select
              className="inline"
              aria-label="Shirt size"
              value={d?.shirt_size ?? ''}
              onChange={(e) =>
                save.mutate({ shirt_size: (e.target.value || null) as ShirtSize | null }, { onError })
              }
            >
              <option value="">Not set</option>
              {SHIRT_SIZES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="val">{shirtSizeLabel(d?.shirt_size) || '–'}</span>
          )}
        </Row>
      </Group>
      {!compact && <Section>Contacts</Section>}
      {compact && <Section>Contacts</Section>}
      <Group>
        {list.map((c) => (
          <Row
            key={c.id}
            label={
              <>
                {c.name}
                {c.user_id && c.user_id === user?.id ? <small> (you)</small> : null}
              </>
            }
            detail={contactDetail(c)}
            onClick={canEdit ? () => setEditing(c) : undefined}
            chevron={canEdit}
          />
        ))}
        {list.length === 0 && !contacts.isPending && (
          <Row label="No contacts yet" detail="Who should the coach call about this player?" />
        )}
        {canEdit && <Row link label="Add contact" onClick={() => setEditing('new')} />}
      </Group>
      <Footer>
        Only the coaches and {playerName}’s own parents can see these details. Other parents on the team
        cannot.
      </Footer>
      {editing && (
        <ContactSheet
          contact={editing === 'new' ? null : editing}
          selfId={user?.id ?? null}
          onClose={() => setEditing(null)}
          onDelete={editing === 'new' ? undefined : () => void remove(editing)}
          onSave={async (input) => {
            try {
              await saveContact.mutateAsync(editing === 'new' ? input : { ...input, id: editing.id });
              toast(editing === 'new' ? 'Contact added' : 'Contact saved');
              setEditing(null);
            } catch (e) {
              onError(e);
            }
          }}
        />
      )}
    </>
  );
}

function ContactSheet({
  contact,
  selfId,
  onClose,
  onSave,
  onDelete,
}: {
  contact: PlayerContact | null;
  selfId: string | null;
  onClose: () => void;
  onSave: (input: {
    name: string;
    relationship: string | null;
    email: string | null;
    phone: string | null;
    user_id: string | null;
  }) => Promise<void>;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(contact?.name ?? '');
  const [relationship, setRelationship] = useState(contact?.relationship ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [isMe, setIsMe] = useState(!!contact && !!selfId && contact.user_id === selfId);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await onSave({
      name,
      relationship: relationship || null,
      email: email || null,
      phone: phone || null,
      user_id: isMe && selfId ? selfId : null,
    });
    setBusy(false);
  };
  return (
    <FormSheet open onClose={onClose} title={contact ? 'Edit contact' : 'Add contact'}>
      <form onSubmit={submit} className="form" style={{ padding: 0 }}>
        <Field label="Name">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoComplete="name"
            required
            data-autofocus=""
          />
        </Field>
        <Field label="Relationship">
          <Select
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            aria-label="Relationship"
          >
            <option value="">—</option>
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Phone (optional)">
          <TextInput
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={40}
            autoComplete="tel"
            inputMode="tel"
          />
        </Field>
        <Field label="Email (optional)">
          <TextInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={120}
            autoComplete="email"
            inputMode="email"
          />
        </Field>
        {selfId && (
          <label className="checkrow">
            <input type="checkbox" checked={isMe} onChange={(e) => setIsMe(e.target.checked)} />
            <span>This is me (links the contact to my account)</span>
          </label>
        )}
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? 'Saving…' : contact ? 'Save contact' : 'Add contact'}
        </Button>
        {onDelete && (
          <Button type="button" variant="gray" onClick={onDelete}>
            Remove contact
          </Button>
        )}
      </form>
    </FormSheet>
  );
}
