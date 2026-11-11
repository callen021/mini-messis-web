import { Navigate } from 'react-router';
import { LoadingScreen, useIsStaff } from '@/auth/guards';
import { Button, Toolbar } from '@/components/Button';
import { Footer, Group, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { useToast } from '@/components/Toast';
import { fmtDate } from '@/games/format';
import { teamSheetCsv, teamSheetText } from './teamSheet';
import { formatPhone } from '@/lib/phone';
import { shirtSizeLabel, useTeamSheet } from '@/players/api';
import { useCurrentTeam } from '@/teams/TeamContext';

/** Staff-only Team sheet (D57): every child with birthdate, shirt size and every parent. */
export function TeamSheetPage() {
  const { teamId, team } = useCurrentTeam();
  const isStaff = useIsStaff();
  const toast = useToast();
  const sheet = useTeamSheet(teamId, isStaff);
  if (!isStaff) return <Navigate to="/team" replace />;
  if (sheet.isPending) return <LoadingScreen label="Loading the team sheet…" />;
  const rows = sheet.data ?? [];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(teamSheetText(rows));
      toast('Team sheet copied');
    } catch {
      toast('Couldn’t copy on this device');
    }
  };
  const csv = () => {
    const blob = new Blob([teamSheetCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${team.name.replace(/[^\w.-]+/g, '-')}-team-sheet.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Page
      title="Team sheet"
      sub={`${team.name} · ${rows.length} player${rows.length === 1 ? '' : 's'} · coaches only`}
      back={{ to: '/team', label: 'Team' }}
    >
      <Toolbar className="noprint">
        <Button variant="tinted" onClick={() => void copy()}>
          Copy
        </Button>
        <Button variant="gray" onClick={csv}>
          CSV
        </Button>
        <Button variant="gray" onClick={() => window.print()}>
          Print
        </Button>
      </Toolbar>
      <Section>Players and parents</Section>
      <Group className="teamsheet">
        <table>
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col">Birthdate</th>
              <th scope="col">Shirt</th>
              <th scope="col">Parents</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.player_id}>
                <td>
                  {r.first_name}
                  {r.last_name ? ` ${r.last_name}` : ''}
                  {r.jersey_number && <small>#{r.jersey_number}</small>}
                </td>
                <td>{r.birthdate ? fmtDate(r.birthdate, true) : '–'}</td>
                <td>{shirtSizeLabel(r.shirt_size) || '–'}</td>
                <td>
                  {r.contacts.length === 0 && '–'}
                  {r.contacts.map((c, i) => (
                    <div key={i}>
                      {c.name}
                      {c.relationship ? ` (${c.relationship})` : ''}
                      <small>
                        {[c.phone ? formatPhone(c.phone) : '', c.email].filter(Boolean).join(' · ') ||
                          'no phone or email'}
                        {c.share_with_team ? '' : ' · private'}
                      </small>
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Group>
      <Footer>
        Only coaches and assistant coaches can open this sheet. Copy puts a text version on the clipboard; CSV
        downloads one row per contact.
      </Footer>
    </Page>
  );
}
