import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { LoadingScreen } from '@/auth/guards';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Field, Select, TextInput } from '@/components/Form';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { FormSheet, useActionSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { fmtDate } from '@/games/format';
import { errorMessage } from '@/lib/supabase';
import { ENABLED_SPORTS, SPORTS } from '@/sports/definitions';
import { type SportKey } from '@/sports/types';
import {
  type MemberRole,
  type TeamMemberRow,
  useApproveMember,
  useDeclineMember,
  useRemoveMember,
  useRotateJoinCode,
  useSetMemberRole,
  useTeam,
  useTeamMembers,
} from '@/teams/api';
import { useActAs } from './actAs';
import {
  useAdminAddMember,
  useAdminArchiveTeam,
  useAdminChangeSport,
  useAdminRenameTeam,
  useAdminTeams,
} from './api';

const ROLE_LABEL: Record<MemberRole, string> = {
  coach: 'Coach',
  assistant: 'Assistant coach',
  parent: 'Parent',
};

/** /admin/teams/:teamId — everything an admin can do to one team. */
export function AdminTeamPage() {
  const { teamId = '' } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const sheet = useActionSheet();
  const team = useTeam(teamId);
  const summary = useAdminTeams();
  const members = useTeamMembers(teamId);
  const rename = useAdminRenameTeam(teamId);
  const archive = useAdminArchiveTeam(teamId);
  const changeSport = useAdminChangeSport(teamId);
  const addMember = useAdminAddMember(teamId);
  const rotate = useRotateJoinCode(teamId);
  const setRole = useSetMemberRole(teamId);
  const remove = useRemoveMember(teamId);
  const approve = useApproveMember(teamId);
  const decline = useDeclineMember(teamId);
  const setActAs = useActAs((s) => s.setTeamId);
  const [adding, setAdding] = useState(false);

  if (team.isPending || members.isPending) return <LoadingScreen />;
  if (!team.data) {
    return (
      <Page title="Team" back={{ to: '/admin', label: 'Admin' }}>
        <p className="sub">This team does not exist.</p>
      </Page>
    );
  }
  const t = team.data;
  const S = SPORTS[t.sport];
  const row = summary.data?.find((x) => x.id === teamId);
  const rows = members.data ?? [];
  const pending = rows.filter((m) => m.status === 'pending');
  const active = rows.filter((m) => m.status === 'active');
  const onError = (e: unknown) => toast(errorMessage(e));

  const openAsCoach = () => {
    setActAs(teamId);
    void navigate('/field');
  };

  const pickSport = async () => {
    const choice = await sheet<SportKey>({
      title: 'Change sport',
      message: `${t.name} is ${S.name.toLowerCase()} today.`,
      actions: ENABLED_SPORTS.filter((k) => k !== t.sport).map((k) => ({
        label: `${SPORTS[k].emoji} ${SPORTS[k].name}`,
        value: k,
      })),
    });
    if (!choice) return;
    const ok = await sheet({
      title: `Switch ${t.name} to ${SPORTS[choice].name.toLowerCase()}?`,
      message: `Lineups, formations and skill tests reset for ${SPORTS[choice].name.toLowerCase()} (tests with recorded results are hidden, not deleted). Players, games and members are kept.`,
      actions: [{ label: `Switch to ${SPORTS[choice].name}`, value: true, destructive: true }],
    });
    if (!ok) return;
    changeSport.mutate(choice, {
      onSuccess: () => toast(`${t.name} is now ${SPORTS[choice].name.toLowerCase()}`),
      onError,
    });
  };

  const resetCode = async () => {
    const ok = await sheet({
      title: 'Reset the join code?',
      message: 'The current code stops working immediately.',
      actions: [{ label: 'Reset code', value: true, destructive: true }],
    });
    if (ok) rotate.mutate(undefined, { onSuccess: () => toast('New join code ready'), onError });
  };

  const toggleArchive = async () => {
    const archiving = !t.archived_at;
    const ok = await sheet({
      title: archiving ? `Archive ${t.name}?` : `Restore ${t.name}?`,
      message: archiving
        ? 'Members lose access until the team is restored. Nothing is deleted.'
        : 'Members get their access back.',
      actions: [{ label: archiving ? 'Archive team' : 'Restore team', value: true, destructive: archiving }],
    });
    if (ok)
      archive.mutate(archiving, {
        onSuccess: () => toast(archiving ? 'Team archived' : 'Team restored'),
        onError,
      });
  };

  const manage = async (m: TeamMemberRow) => {
    const actions: { label: string; value: string; destructive?: boolean }[] = [];
    if (m.role !== 'coach') actions.push({ label: 'Make coach', value: 'coach' });
    if (m.role !== 'assistant' && !m.is_owner)
      actions.push({ label: 'Make assistant coach', value: 'assistant' });
    if (m.role !== 'parent' && !m.is_owner)
      actions.push({ label: 'Make parent (read-only)', value: 'parent' });
    if (!m.is_owner) actions.push({ label: 'Remove from team', value: 'remove', destructive: true });
    const choice = await sheet<string>({ title: m.display_name, message: m.email, actions });
    if (!choice) return;
    try {
      if (choice === 'remove') {
        await remove.mutateAsync(m.member_id);
        toast('Member removed');
      } else {
        await setRole.mutateAsync({ memberId: m.member_id, role: choice as MemberRole });
        toast(`${m.display_name} is now ${ROLE_LABEL[choice as MemberRole].toLowerCase()}`);
      }
    } catch (e) {
      onError(e);
    }
  };

  const approveReq = async (m: TeamMemberRow) => {
    const role = m.requested_role ?? m.role;
    try {
      await approve.mutateAsync({
        memberId: m.member_id,
        role,
        playerIds: role === 'parent' ? m.children.map((c) => c.player_id) : [],
      });
      toast(`${m.display_name} approved as ${ROLE_LABEL[role].toLowerCase()}`);
    } catch (e) {
      onError(e);
    }
  };
  const declineReq = async (m: TeamMemberRow) => {
    try {
      await decline.mutateAsync(m.member_id);
      toast('Request declined');
    } catch (e) {
      onError(e);
    }
  };

  return (
    <Page
      title={t.name}
      sub={
        <>
          {S.emoji} {S.name} · created {fmtDate(t.created_at.slice(0, 10))}
          {t.archived_at ? ' · ' : ''}
          {t.archived_at && <Badge>Archived</Badge>}
        </>
      }
      back={{ to: '/admin', label: 'Admin' }}
    >
      <div className="toolbar">
        <Button onClick={openAsCoach}>Open as coach</Button>
      </div>
      <Section>Team</Section>
      <Group>
        <Row label="Name">
          <input
            className="inline"
            aria-label="Team name"
            defaultValue={t.name}
            maxLength={40}
            onBlur={(e) => {
              const v = e.target.value.replace(/\s+/g, ' ').trim().slice(0, 40);
              if (v && v !== t.name) rename.mutate(v, { onSuccess: () => toast('Team renamed'), onError });
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </Row>
        <Row
          label="Sport"
          detail="Admin only · lineups, formations and skill tests reset"
          value={`${S.emoji} ${S.name}`}
          chevron
          onClick={() => void pickSport()}
          disabled={changeSport.isPending}
        />
        <Row label="Owner" detail={row?.owner_email} value={row?.owner_name} />
        <Row label="Join code" value={<code>{t.join_code}</code>}>
          <Button size="sm" variant="gray" onClick={() => void resetCode()} disabled={rotate.isPending}>
            Reset
          </Button>
        </Row>
        <Row
          label="Setup"
          value={`${t.side_size} ${S.unit} · ${t.periods_count} ${S.periodName(t.periods_count).toLowerCase()}s · ${row?.players ?? 0} players`}
        />
      </Group>

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
                  </small>
                </span>
                <div className="toolbar" style={{ margin: 0, flexBasis: '100%' }}>
                  <Button size="sm" onClick={() => void approveReq(m)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="gray" onClick={() => void declineReq(m)}>
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </Group>
        </>
      )}

      <Section>Members · {active.length}</Section>
      <Group>
        {active.map((m) => (
          <Row
            key={m.member_id}
            onClick={() => void manage(m)}
            label={
              <>
                {m.display_name}
                {m.is_owner && <Badge status="live">Owner</Badge>}
              </>
            }
            detail={m.email}
            chevron
          >
            <Badge>{ROLE_LABEL[m.role]}</Badge>
          </Row>
        ))}
        <Row
          link
          label="Add member by email"
          detail="Creates an active membership for an existing account"
          onClick={() => setAdding(true)}
        />
      </Group>

      <Group style={{ marginTop: 18 }}>
        <Row
          destructive={!t.archived_at}
          link={!!t.archived_at}
          label={t.archived_at ? 'Restore team' : 'Archive team'}
          onClick={() => void toggleArchive()}
        />
      </Group>
      <Footer>
        Admin actions go through the same rules as a coach, plus sport changes and archiving. Everything here
        is recorded with your user id on the rows it touches.
      </Footer>
      <AddMemberSheet
        open={adding}
        onClose={() => setAdding(false)}
        busy={addMember.isPending}
        onAdd={(email, role) =>
          addMember.mutate(
            { email, role },
            {
              onSuccess: () => {
                setAdding(false);
                toast(`${email} added as ${ROLE_LABEL[role].toLowerCase()}`);
              },
              onError,
            },
          )
        }
      />
    </Page>
  );
}

function AddMemberSheet({
  open,
  onClose,
  busy,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  onAdd: (email: string, role: MemberRole) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('parent');
  return (
    <FormSheet open={open} onClose={onClose} title="Add member">
      <Field label="Email">
        <TextInput
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
          data-autofocus=""
        />
      </Field>
      <Field label="Role">
        <Select value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
          <option value="coach">Coach</option>
          <option value="assistant">Assistant coach</option>
          <option value="parent">Parent</option>
        </Select>
      </Field>
      <Button disabled={busy || !email.includes('@')} onClick={() => onAdd(email.trim(), role)}>
        {busy ? 'Adding…' : 'Add member'}
      </Button>
    </FormSheet>
  );
}
