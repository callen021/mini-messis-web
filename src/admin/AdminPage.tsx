import { useState } from 'react';
import { Link } from 'react-router';
import { LoadingScreen } from '@/auth/guards';
import { Badge } from '@/components/Badge';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { Segmented } from '@/components/Segmented';
import { fmtDate } from '@/games/format';
import { SPORTS } from '@/sports/definitions';
import { useOptionalTeam } from '@/teams/TeamContext';
import { useAdminTeams, useAdminUsers } from './api';

type View = 'teams' | 'users';
const ROLE_LABEL = { coach: 'coach', assistant: 'assistant', parent: 'parent' } as const;

/** /admin: every team and every user on the platform. */
export function AdminPage() {
  const [view, setView] = useState<View>('teams');
  const teams = useAdminTeams();
  const users = useAdminUsers();
  const team = useOptionalTeam();

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
                <Row
                  key={t.id}
                  to={`/admin/teams/${t.id}`}
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
              );
            })}
            {teamRows.length === 0 && <Row label="No teams yet." />}
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
      <Footer>
        Platform admins see every team and can act as a coach on any of them. The admin flag itself is set
        only in the Supabase SQL editor.
      </Footer>
    </Page>
  );
}
