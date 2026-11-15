import { useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { Badge } from '@/components/Badge';
import { Footer, Group, Row, Section } from '@/components/List';
import { useActionSheet } from '@/components/Sheet';
import { Switch } from '@/components/Switch';
import { useToast } from '@/components/Toast';
import { formatPhone, smsHref, telHref } from '@/lib/phone';
import { errorMessage } from '@/lib/supabase';
import {
  type Person,
  useDeleteContact,
  useMergeContacts,
  usePlayerPeople,
  useSaveContact,
  useSetContactShared,
} from './api';
import { ContactSheet } from './ContactSheet';
import { MATCH_TEXT, findDuplicates } from './duplicates';
import { buildVCard, deliverVcf } from './vcard';

/** Phone / text / email / vCard actions under a person's row. */
function PersonActions({ p, childName, teamName }: { p: Person; childName: string; teamName: string }) {
  const vcard = () =>
    deliverVcf(
      buildVCard({
        name: p.name,
        relationship: p.relationship,
        phone: p.phone,
        email: p.email,
        childName,
        teamName,
      }),
      `${p.name}.vcf`,
    );
  if (!p.phone && !p.email) return null;
  return (
    <div className="actions">
      {p.phone && (
        <a className="btn tinted sm" href={telHref(p.phone)} aria-label={`Call ${p.name}`}>
          Call
        </a>
      )}
      {p.phone && (
        <a className="btn tinted sm" href={smsHref(p.phone)} aria-label={`Text ${p.name}`}>
          Text
        </a>
      )}
      {p.email && (
        <a className="btn tinted sm" href={`mailto:${p.email}`} aria-label={`Email ${p.name}`}>
          Email
        </a>
      )}
      <button type="button" className="btn gray sm" onClick={vcard} aria-label={`Add ${p.name} to contacts`}>
        Add to contacts
      </button>
    </div>
  );
}

/**
 * The one Parents list on a player's contact card (D57): contacts and guardian accounts merged,
 * "In app" for linked accounts, "Pending" for staff, call / text / email / vCard actions, and a
 * Share with team parents switch for the child's guardians and staff.
 */
export function PeopleSection({
  playerId,
  childName,
  teamName,
  canEdit,
  selfLinked = false,
  isStaff,
}: {
  playerId: string;
  childName: string;
  teamName: string;
  /** Staff or a confirmed guardian: every contact, the details. */
  canEdit: boolean;
  /** Linked to this child, confirmed or not: may add and edit one entry for themselves (D91). */
  selfLinked?: boolean;
  isStaff: boolean;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const sheet = useActionSheet();
  const people = usePlayerPeople(playerId);
  const save = useSaveContact(playerId);
  const setShared = useSetContactShared(playerId);
  const remove = useDeleteContact(playerId);
  const merge = useMergeContacts(playerId);
  const [editing, setEditing] = useState<Person | 'new' | null>(null);
  const onError = (e: unknown) => toast(errorMessage(e));
  const list = people.data ?? [];
  // two rows that look like the same person (D116): the coaches get a prompt, never an automatic merge
  const duplicates = isStaff ? findDuplicates(list) : [];
  const mergeFlow = async (keep: Person, drop: Person) => {
    if (!keep.contact_id || !drop.contact_id) return;
    const ok = await sheet({
      title: `Merge ${drop.name} into ${keep.name}?`,
      message: `One contact is kept with ${keep.name}’s label and sharing; anything blank is filled from ${drop.name}, who is removed.`,
      actions: [{ label: 'Merge', value: true }],
    });
    if (!ok) return;
    merge.mutate(
      { keepId: keep.contact_id, dropId: drop.contact_id },
      { onError, onSuccess: () => toast('Contacts merged') },
    );
  };
  const hasOwnEntry = list.some((p) => !!p.contact_id && p.user_id === user?.id);
  const canAddSelf = !canEdit && selfLinked && !hasOwnEntry;

  const removeFlow = async (p: Person) => {
    if (!p.contact_id) return;
    const ok = await sheet({
      title: `Remove ${p.name}?`,
      actions: [{ label: 'Remove contact', value: true, destructive: true }],
    });
    if (!ok) return;
    remove.mutate(p.contact_id, { onError, onSuccess: () => toast('Contact removed') });
    setEditing(null);
  };

  const detail = (p: Person) => {
    const bits = [p.relationship, p.phone ? formatPhone(p.phone) : null, p.email].filter(Boolean);
    if (bits.length) return bits.join(' · ');
    return p.in_app ? 'Linked account · no phone or email shared yet' : 'No phone or email yet';
  };

  return (
    <>
      <Section>Parents</Section>
      <Group>
        {list.map((p, i) => (
          <div key={p.contact_id ?? `u-${p.user_id ?? i}`} className="person">
            <Row
              label={
                <>
                  {p.name}
                  {p.user_id && p.user_id === user?.id ? <small> (you)</small> : null}
                </>
              }
              detail={detail(p)}
              onClick={p.can_edit && p.contact_id ? () => setEditing(p) : undefined}
              chevron={p.can_edit && !!p.contact_id}
            >
              <span className="badges">
                {p.in_app && p.link_status !== 'pending' && <Badge status="live">In app</Badge>}
                {isStaff && p.link_status === 'pending' && <Badge status="upcoming">Pending link</Badge>}
              </span>
            </Row>
            <PersonActions p={p} childName={childName} teamName={teamName} />
            {p.can_edit && p.contact_id && (
              <div className="share">
                <span>Share with team parents</span>
                <Switch
                  label={`Share ${p.name} with team parents`}
                  size="sm"
                  checked={p.share_with_team}
                  onChange={(on) =>
                    setShared.mutate(
                      { id: p.contact_id as string, shared: on },
                      {
                        onError,
                        onSuccess: () => toast(on ? 'Shared with team parents' : 'Hidden from other parents'),
                      },
                    )
                  }
                />
              </div>
            )}
          </div>
        ))}
        {list.length === 0 && !people.isPending && (
          <Row
            label="No parents listed yet"
            detail={
              canEdit ? 'Add a contact so the coach knows who to call.' : 'Nothing shared with the team yet.'
            }
          />
        )}
        {duplicates.map((d) => (
          <Row
            key={`${d.keep.contact_id}-${d.drop.contact_id}`}
            className="dupe"
            icon="⚠︎"
            iconColor="var(--orange)"
            label={`Possible duplicate: ${d.keep.name} and ${d.drop.name}`}
            detail={`They have ${MATCH_TEXT[d.match]}. Merge?`}
            onClick={() => void mergeFlow(d.keep, d.drop)}
            chevron
          />
        ))}
        {(canEdit || canAddSelf) && (
          <Row
            link
            label={canEdit ? 'Add contact' : 'Add my contact details'}
            onClick={() => setEditing('new')}
          />
        )}
      </Group>
      <Footer>
        {canEdit
          ? 'Contacts marked “Share with team parents” are visible to every parent on the team; the rest only to coaches and this child’s own parents.'
          : 'Only contacts the family chose to share are shown here.'}
      </Footer>
      {editing && (
        <ContactSheet
          contact={editing === 'new' ? null : editing}
          selfId={user?.id ?? null}
          forceSelf={!canEdit}
          onClose={() => setEditing(null)}
          onDelete={editing === 'new' || !editing.contact_id ? undefined : () => void removeFlow(editing)}
          others={editing === 'new' ? [] : list.filter((p) => !!p.contact_id && p.can_edit)}
          onMerge={
            editing === 'new' || !editing.contact_id
              ? undefined
              : async (dropId) => {
                  try {
                    await merge.mutateAsync({ keepId: editing.contact_id as string, dropId });
                    toast('Contacts merged');
                    setEditing(null);
                  } catch (e) {
                    onError(e);
                  }
                }
          }
          onSave={async (input) => {
            try {
              await save.mutateAsync(editing === 'new' ? input : { ...input, id: editing.contact_id });
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
