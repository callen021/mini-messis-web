import { type FormEvent, useState } from 'react';
import { Button } from '@/components/Button';
import { Field, FieldGroup, Select, TextInput } from '@/components/Form';
import { FormSheet } from '@/components/Sheet';
import { Switch } from '@/components/Switch';
import { formatPhone, normalizePhone } from '@/lib/phone';
import { type ContactInput, type Person } from './api';

const RELATIONSHIPS = ['Mother', 'Father', 'Parent', 'Guardian', 'Grandparent', 'Step-parent', 'Other'];

/** Add or edit one contact (D57): name, relationship, phone, email, "this is me", share with team. */
export function ContactSheet({
  contact,
  selfId,
  onClose,
  onSave,
  onDelete,
}: {
  contact: Person | null;
  selfId: string | null;
  onClose: () => void;
  onSave: (input: ContactInput) => Promise<void>;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(contact?.name ?? '');
  const [relationship, setRelationship] = useState(contact?.relationship ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [phone, setPhone] = useState(contact?.phone ? formatPhone(contact.phone) : '');
  const [isMe, setIsMe] = useState(!!contact && !!selfId && contact.user_id === selfId);
  const [shared, setShared] = useState(contact?.share_with_team ?? true);
  const [busy, setBusy] = useState(false);
  const phoneOk = !phone.trim() || normalizePhone(phone) !== null;

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
        {selfId && (
          <label className="checkrow">
            <input type="checkbox" checked={isMe} onChange={(e) => setIsMe(e.target.checked)} />
            <span>This is me (links the contact to my account)</span>
          </label>
        )}
        <Button type="submit" disabled={busy || !name.trim() || !phoneOk}>
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
