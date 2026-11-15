import { type FormEvent, useState } from 'react';
import { Button } from '@/components/Button';
import { Field, FieldGroup, Select, TextInput } from '@/components/Form';
import { FormSheet } from '@/components/Sheet';
import { Switch } from '@/components/Switch';
import { formatPhone, normalizePhone } from '@/lib/phone';
import { type ContactInput, type Person } from './api';

const RELATIONSHIPS = ['Mother', 'Father', 'Parent', 'Guardian', 'Grandparent', 'Step-parent', 'Other'];

/**
 * Add or edit one contact (D57): name, relationship, phone, email, "this is me", share with
 * team. Editing also offers "Merge with…" another contact of the player (D116): this one stays,
 * its blanks filled from the other, which is removed.
 */
export function ContactSheet({
  contact,
  selfId,
  forceSelf = false,
  others = [],
  onClose,
  onSave,
  onDelete,
  onMerge,
}: {
  contact: Person | null;
  selfId: string | null;
  /** The entry can only be the signed-in parent's own (an unconfirmed link, D91). */
  forceSelf?: boolean;
  /** The player's other contact rows, offered under "Merge with…". */
  others?: readonly Person[];
  onClose: () => void;
  onSave: (input: ContactInput) => Promise<void>;
  onDelete?: () => void;
  onMerge?: (dropId: string) => Promise<void>;
}) {
  const [name, setName] = useState(contact?.name ?? '');
  const [relationship, setRelationship] = useState(contact?.relationship ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [phone, setPhone] = useState(contact?.phone ? formatPhone(contact.phone) : '');
  const [isMe, setIsMe] = useState(forceSelf || (!!contact && !!selfId && contact.user_id === selfId));
  const [shared, setShared] = useState(contact?.share_with_team ?? true);
  const [busy, setBusy] = useState(false);
  const [mergeWith, setMergeWith] = useState('');
  const phoneOk = !phone.trim() || normalizePhone(phone) !== null;
  const mergeable = others.filter((o) => !!o.contact_id && o.contact_id !== contact?.contact_id);
  const merge = async () => {
    if (!mergeWith || !onMerge) return;
    setBusy(true);
    await onMerge(mergeWith);
    setBusy(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phoneOk) return;
    setBusy(true);
    await onSave({
      name,
      relationship: relationship || null,
      email: email || null,
      phone: phone || null,
      user_id: isMe && selfId ? selfId : (contact?.user_id ?? null),
      share_with_team: shared,
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
            placeholder="(555) 010-0001"
            aria-invalid={!phoneOk}
          />
        </Field>
        {!phoneOk && <p className="sub">That doesn’t look like a phone number.</p>}
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
        <FieldGroup label="Share with team parents">
          <div className="checkrow" style={{ justifyContent: 'space-between' }}>
            <span>
              {shared
                ? 'Other parents on the team can see this contact'
                : 'Coaches and this child’s parents only'}
            </span>
            <Switch label="Share with team parents" size="md" checked={shared} onChange={setShared} />
          </div>
        </FieldGroup>
        {selfId && !forceSelf && (
          <label className="checkrow">
            <input type="checkbox" checked={isMe} onChange={(e) => setIsMe(e.target.checked)} />
            <span>This is me (links the contact to my account)</span>
          </label>
        )}
        <Button type="submit" disabled={busy || !name.trim() || !phoneOk}>
          {busy ? 'Saving…' : contact ? 'Save contact' : 'Add contact'}
        </Button>
        {contact && onMerge && mergeable.length > 0 && (
          <Field label="Merge with…">
            <Select value={mergeWith} onChange={(e) => setMergeWith(e.target.value)} aria-label="Merge with">
              <option value="">—</option>
              {mergeable.map((o) => (
                <option key={o.contact_id ?? ''} value={o.contact_id ?? ''}>
                  {o.name}
                  {o.relationship ? ` · ${o.relationship}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {contact && onMerge && mergeWith && (
          <Button type="button" variant="tinted" disabled={busy} onClick={() => void merge()}>
            Merge into {name.trim() || 'this contact'}
          </Button>
        )}
        {onDelete && (
          <Button type="button" variant="gray" onClick={onDelete}>
            Remove contact
          </Button>
        )}
      </form>
    </FormSheet>
  );
}
