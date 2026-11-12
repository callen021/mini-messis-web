import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { LoadingScreen } from '@/auth/guards';
import { Badge } from '@/components/Badge';
import { CopyIcon } from '@/components/icons';
import { Footer, Group, Row, Section } from '@/components/List';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { Page } from '@/components/Page';
import { Segmented } from '@/components/Segmented';
import { fmtDate } from '@/games/format';
import { SPORTS } from '@/sports/definitions';
import { useOptionalTeam } from '@/teams/TeamContext';
import { useAdminTeams, useAdminUsers, useDuplicateTeam } from './api';
import { DuplicateTeamSheet } from './DuplicateTeamSheet';

type View = 'teams' | 'users';
const ROLE_LABEL = { coach: 'coach', assistant: 'assistant', parent: 'parent' } as const;

/** /admin: every team and every user on the platform. */
export function AdminPage() {
  const [view, setView] = useState<View>('teams');
  const teams = useAdminTeams();
  const users = useAdminUsers();
  const team = useOptionalTeam();
  const toast = useToast();
  const navigate = useNavigate();
  const duplicate = useDuplicateTeam();
  const [copying, setCopying] = useState<{ id: string; name: string } | null>(null);

  if (teams.isPending || users.isPending) return <LoadingScreen />;
  const teamRows = teams.data ?? [];
  const userRows = users.data ?? [];

  return (
    <Page
      title="Admin"
      sub={`${teamRows.filter((t) => !t.archived_at).length} teams · ${userRows.length} users`}
      back={team ? { to: '/settings', label: 'Settings' } : { to: '/welcome', label: 'Back' }}
    >
      <Segmented<View>
        wide
        label="Admin view"
        value={view}
        onChange={setView}
        options={[
          { value: 'teams', label: 'Teams' },
          { value: 'users', label: 'Users' },
        ]}
      />
      {view === 'teams' ? (
        <>
          <Section>Teams</Section>
          <Group>
            {teamRows.map((t) => {
              const S = SPORTS[t.sport];
              const members = t.coaches + t.assistants + t.parents;
              return (
                <div key={t.id} className="rowwrap">
                  <Row
                    to={`/admin/teams/${t.id}`}
                    className="hasdir"
                    icon={S.emoji}
                    label={t.name}
                    detail={`${t.owner_name} · ${members} member${members === 1 ? '' : 's'} (${t.coaches}c · ${t.assistants}a · ${t.parents}p)${t.pending ? ` · ${t.pending} pending` : ''} · ${t.players} players · created ${fmtDate(t.created_at.slice(0, 10))}`}
                    chevron
                  >
                    {t.archived_at ? (
                      <Badge>Archived</Badge>
                    ) : t.pending ? (
                      <Badge status="upcoming">{t.pending} pending</Badge>
                    ) : null}
                  </Row>
                  <button
                    type="button"
                    className="dirbtn"
                    aria-label={`Duplicate ${t.name}`}
                    title="Duplicate team"
                    onClick={() => setCopying({ id: t.id, name: t.name })}
                  >
                    <CopyIcon />
                  </button>
                </div>
              );
            })}
            {teamRows.length === 0 && <Row label="No teams yet." />}
          </Group>
          <Group style={{ marginTop: 12 }}>
            <Row
              to="/create-team"
              label="Create a team"
              detail="Only platform admins can create teams"
              link
              chevron
            />
          </Group>
        </>
      ) : (
        <>
          <Section>Users</Section>
          <Group>
            {userRows.map((u) => (
              <Row
                key={u.user_id}
                label={
                  <>
                    {u.display_name}
                    {u.is_platform_admin && <Badge status="live">Admin</Badge>}
                  </>
                }
                detail={
                  <>
                    {u.email} · joined {fmtDate(u.created_at.slice(0, 10))}
                    {u.teams.length > 0 && (
                      <>
                        <br />
                        {u.teams.map((t, i) => (
                          <span key={t.team_id}>
                            {i > 0 && ', '}
                            <Link to={`/admin/teams/${t.team_id}`}>{t.name}</Link> ({ROLE_LABEL[t.role]}
                            {t.status === 'pending' ? ', pending' : ''})
                          </span>
                        ))}
                      </>
                    )}
                    {u.teams.length === 0 && (
                      <>
                        <br />
                        No teams
                      </>
                    )}
                  </>
                }
              />
            ))}
            {userRows.length === 0 && <Row label="No users." />}
          </Group>
        </>
      )}
      <DuplicateTeamSheet
        source={copying}
        busy={duplicate.isPending}
        onClose={() => setCopying(null)}
        onSubmit={(name) => {
          const src = copying;
          if (!src) return;
          duplicate.mutate(
            { sourceId: src.id, name },
            {
              onSuccess: (id) => {
                setCopying(null);
                toast(`${name} created from ${src.name}`);
                void navigate(`/admin/teams/${id}`);
              },
              onError: (e) => toast(errorMessage(e)),
            },
          );
        }}
      />
      <Footer>
        Platform admins see every team and can act as a coach on any of them. The copy button on a team row
        duplicates it under a new name (D81). The admin flag itself is set only in the Supabase SQL editor.
      </Footer>
    </Page>
  );
}
