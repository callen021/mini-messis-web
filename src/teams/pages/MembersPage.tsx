import { useState } from 'react';
import { useIsCoach } from '@/auth/guards';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { FieldGroup } from '@/components/Form';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { Segmented } from '@/components/Segmented';
import { FormSheet, useActionSheet } from '@/components/Sheet';
import { Switch } from '@/components/Switch';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import {
  type MemberRole,
  type TeamMemberRow,
  useApproveGuardianLink,
  useApproveMember,
  useDeclineMember,
  usePlayers,
  useRemoveMember,
  useRotateJoinCode,
  useSetMemberRole,
  useTeamMembers,
  useTransferOwnership,
} from '../api';
import { useCurrentTeam } from '../TeamContext';

const ROLE_LABEL: Record<MemberRole, string> = {
  coach: 'Coach',
  assistant: 'Assistant coach',
  parent: 'Parent',
};

export function MembersPage() {
  const { teamId, team, isOwner } = useCurrentTeam();
  const isCoach = useIsCoach();
  const toast = useToast();
  const sheet = useActionSheet();
  const members = useTeamMembers(teamId);
  const players = usePlayers(teamId);
  const rotate = useRotateJoinCode(teamId);
  const approve = useApproveMember(teamId);
  const decline = useDeclineMember(teamId);
  const remove = useRemoveMember(teamId);
  const setRole = useSetMemberRole(teamId);
  const approveLink = useApproveGuardianLink(teamId);
  const transfer = useTransferOwnership(teamId);
  const [approving, setApproving] = useState<TeamMemberRow | null>(null);

  const rows = members.data ?? [];
  const pending = rows.filter((m) => m.status === 'pending');
  const active = rows.filter((m) => m.status === 'active');

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(team.join_code);
      toast('Join code copied');
    } catch {
      toast(team.join_code);
    }
  };

  const rotateCode = async () => {
    const ok = await sheet({
      title: 'Rotate the join code?',
      message: 'The current code stops working immediately. Anyone who hasn’t joined yet needs the new one.',
      actions: [{ label: 'Rotate code', value: true, destructive: true }],
    });
    if (!ok) return;
    try {
      await rotate.mutateAsync(undefined);
      toast('New join code ready');
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  const declineReq = async (m: TeamMemberRow) => {
    const ok = await sheet({
      title: `Decline ${m.display_name}?`,
      message: 'They can request again with the join code.',
      actions: [{ label: 'Decline request', value: true, destructive: true }],
    });
    if (!ok) return;
    try {
      await decline.mutateAsync(m.member_id);
      toast('Request declined');
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  const manage = async (m: TeamMemberRow) => {
    const actions: { label: string; value: string; destructive?: boolean }[] = [];
    if (m.role !== 'coach') actions.push({ label: 'Make coach', value: 'coach' });
    if (m.role !== 'assistant' && !m.is_owner)
      actions.push({ label: 'Make assistant coach', value: 'assistant' });
    if (m.role !== 'parent' && !m.is_owner)
      actions.push({ label: 'Make parent (read-only)', value: 'parent' });
    if (isOwner && !m.is_owner) actions.push({ label: 'Transfer ownership to them', value: 'transfer' });
    if (!m.is_owner) actions.push({ label: 'Remove from team', value: 'remove', destructive: true });
    const choice = await sheet<string>({ title: m.display_name, message: m.email, actions });
    if (!choice) return;
    try {
      if (choice === 'remove') {
        const ok = await sheet({
          title: `Remove ${m.display_name}?`,
          message: 'They lose access right away. Past games and stats are not affected.',
          actions: [{ label: 'Remove', value: true, destructive: true }],
        });
        if (!ok) return;
        await remove.mutateAsync(m.member_id);
        toast('Member removed');
      } else if (choice === 'transfer') {
        const ok = await sheet({
          title: `Make ${m.display_name} the owner?`,
          message: 'Only the owner can delete the team or transfer it again. You stay a coach.',
          actions: [{ label: 'Transfer ownership', value: true, destructive: true }],
        });
        if (!ok) return;
        await transfer.mutateAsync(m.user_id);
        toast('Ownership transferred');
      } else {
        await setRole.mutateAsync({ memberId: m.member_id, role: choice as MemberRole });
        toast(`${m.display_name} is now ${ROLE_LABEL[choice as MemberRole].toLowerCase()}`);
      }
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  const childLinkAction = async (m: TeamMemberRow, linkId: string, name: string) => {
    const choice = await sheet<'approve' | 'decline'>({
      title: `Link ${m.display_name} to ${name}?`,
      actions: [
        { label: 'Approve link', value: 'approve' },
        { label: 'Decline link', value: 'decline', destructive: true },
      ],
    });
    if (!choice) return;
    try {
      await approveLink.mutateAsync({ linkId, approve: choice === 'approve' });
      toast(choice === 'approve' ? 'Link approved' : 'Link declined');
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  return (
    <Page
      title="Members"
      sub={`${active.length} member${active.length === 1 ? '' : 's'}${pending.length ? ` · ${pending.length} waiting` : ''}`}
      back={{ to: '/settings', label: 'Settings' }}
    >
      <Section>Join code</Section>
      <Group>
        <div className="codebox">
          <code className="code-big" aria-label={`Join code ${team.join_code.split('').join(' ')}`}>
            {team.join_code}
          </code>
          <div className="toolbar" style={{ margin: 0 }}>
            <Button variant="tinted" size="sm" onClick={copyCode}>
              Copy
            </Button>
            {isCoach && (
              <Button variant="gray" size="sm" onClick={rotateCode} disabled={rotate.isPending}>
                Rotate
              </Button>
            )}
          </div>
        </div>
      </Group>
      <Footer>
        Share this with parents and assistant coaches. They request to join; you approve them here.
      </Footer>

      {pending.length > 0 && (
        <>
          <Section>Waiting for approval</Section>
          <Group>
            {pending.map((m) => (
              <div key={m.member_id} className="row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <span className="lbl">
                  {m.display_name}
                  <small>
                    {m.email} · wants to be {ROLE_LABEL[m.requested_role ?? m.role].toLowerCase()}
                    {m.children.length > 0 && ` · child: ${m.children.map((c) => c.first_name).join(', ')}`}
                    {m.unlisted.length > 0 && ` · not on roster: ${m.unlisted.join(', ')}`}
                  </small>
                </span>
                {isCoach && (
                  <div className="toolbar" style={{ margin: 0, flexBasis: '100%' }}>
                    <Button size="sm" onClick={() => setApproving(m)}>
                      Approve…
                    </Button>
                    <Button size="sm" variant="gray" onClick={() => declineReq(m)}>
                      Decline
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </Group>
        </>
      )}

      <Section>Members</Section>
      <Group>
        {active.map((m) => {
          const pendingLinks = m.children.filter((c) => c.status === 'pending');
          const approved = m.children.filter((c) => c.status === 'approved');
          const detail = [
            m.email,
            approved.length ? `child: ${approved.map((c) => c.first_name).join(', ')}` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <div key={m.member_id}>
              <Row
                label={
                  <>
                    {m.display_name}
                    {m.is_owner && <Badge className="ml">Owner</Badge>}
                  </>
                }
                detail={detail}
                onClick={isCoach ? () => manage(m) : undefined}
                chevron={isCoach}
              >
                <Badge status={m.role === 'parent' ? undefined : 'live'}>{ROLE_LABEL[m.role]}</Badge>
              </Row>
              {pendingLinks.map((c) =>
                isCoach ? (
                  <Row
                    key={c.link_id}
                    label={`Link request: ${c.first_name}`}
                    detail="Tap to approve or decline"
                    link
                    chevron
                    onClick={() => childLinkAction(m, c.link_id, c.first_name)}
                  />
                ) : null,
              )}
            </div>
          );
        })}
        {members.isPending && <Row label="Loading…" />}
      </Group>
      <Footer>
        Coaches manage members and settings. Assistant coaches edit lineups, games and the roster. Parents see
        everything but change nothing. A team always keeps at least one coach.
      </Footer>

      {approving && (
        <ApproveSheet
          member={approving}
          players={players.data ?? []}
          onClose={() => setApproving(null)}
          onApprove={async (role, playerIds) => {
            try {
              await approve.mutateAsync({ memberId: approving.member_id, role, playerIds });
              toast(`${approving.display_name} approved`);
              setApproving(null);
            } catch (e) {
              toast(errorMessage(e));
            }
          }}
        />
      )}
    </Page>
  );
}

function ApproveSheet({
  member,
  players,
  onClose,
  onApprove,
}: {
  member: TeamMemberRow;
  players: { id: string; first_name: string; jersey_number: string | null }[];
  onClose: () => void;
  onApprove: (role: MemberRole, playerIds: string[] | null) => Promise<void>;
}) {
  const [role, setRole] = useState<MemberRole>(member.requested_role ?? member.role);
  const [kids, setKids] = useState<Set<string>>(new Set(member.children.map((c) => c.player_id)));
  const [busy, setBusy] = useState(false);
  const toggle = (id: string, on: boolean) =>
    setKids((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  return (
    <FormSheet open onClose={onClose} title={`Approve ${member.display_name}`}>
      <FieldGroup label="Role">
        <Segmented<MemberRole>
          label="Role"
          value={role}
          onChange={setRole}
          options={[
            { value: 'parent', label: 'Parent' },
            { value: 'assistant', label: 'Assistant' },
            { value: 'coach', label: 'Coach' },
          ]}
        />
      </FieldGroup>
      {role === 'parent' && (
        <FieldGroup label="Their children">
          <div className="checklist">
            {players.map((p) => (
              <label key={p.id} className="checkrow">
                <span>
                  {p.first_name}
                  {p.jersey_number ? ` · #${p.jersey_number}` : ''}
                </span>
                <Switch
                  label={`${p.first_name} is their child`}
                  size="sm"
                  checked={kids.has(p.id)}
                  onChange={(on) => toggle(p.id, on)}
                />
              </label>
            ))}
            {member.unlisted.length > 0 && (
              <p className="hint">
                Asked for: {member.unlisted.join(', ')} — add them to the roster first if needed.
              </p>
            )}
          </div>
        </FieldGroup>
      )}
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onApprove(role, role === 'parent' ? [...kids] : []);
          setBusy(false);
        }}
      >
        {busy ? 'Approving…' : `Approve as ${ROLE_LABEL[role].toLowerCase()}`}
      </Button>
    </FormSheet>
  );
}
