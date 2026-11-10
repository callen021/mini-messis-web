import { useIsPlatformAdmin } from '@/admin/useIsPlatformAdmin';
import { useAuth } from '@/auth/AuthProvider';
import { STAFF_ROLES, RoleGate } from '@/auth/guards';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { Segmented } from '@/components/Segmented';
import { useActionSheet } from '@/components/Sheet';
import { type FieldView, type Theme, useUIStore } from '@/lib/ui-store';
import { SPORTS } from '@/sports/definitions';
import { useSkillTests } from '@/skills/api';
import { DataSection } from './DataSection';
import { signOut } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';

export function SettingsPage() {
  const { team, role } = useCurrentTeam();
  const { user } = useAuth();
  const isAdmin = useIsPlatformAdmin() === true;
  const sheet = useActionSheet();
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const fieldView = useUIStore((s) => s.fieldView);
  const setFieldView = useUIStore((s) => s.setFieldView);
  const S = SPORTS[team.sport];
  const tests = useSkillTests(team.id);
  const shownTests = (tests.data ?? []).filter((t) => t.is_active).length;
  const hiddenTests = (tests.data ?? []).length - shownTests;
  const skillsSummary = tests.data
    ? `${shownTests} shown${hiddenTests ? ` · ${hiddenTests} hidden` : ''}`
    : 'Tests on player pages and the Stats tab';

  const confirmSignOut = async () => {
    const ok = await sheet({
      title: 'Sign out?',
      actions: [{ label: 'Sign out', value: true, destructive: true }],
    });
    if (ok) await signOut();
  };

  return (
    <Page title="Settings" sub="Team, members, appearance and your account">
      <Section>{team.name}</Section>
      <Group>
        <Row
          icon={S.emoji}
          label={S.name}
          detail={`${team.side_size} ${S.unit}${team.has_gk ? ' incl. goalie' : ''} · ${team.periods_count} ${S.periodName(team.periods_count).toLowerCase()}s`}
        />
        <RoleGate allow={STAFF_ROLES}>
          <Row
            to="/settings/members"
            label="Members & join code"
            detail={role === 'coach' ? 'Approve requests, roles, rotate the code' : 'See who is on the team'}
            chevron
          />
        </RoleGate>
        <RoleGate allow={STAFF_ROLES}>
          <Row
            to="/settings/team"
            label="Team setup"
            detail={`Players ${S.unit}, ${S.periodName(team.periods_count).toLowerCase()}s, jersey colors`}
            chevron
          />
        </RoleGate>
        <RoleGate allow={STAFF_ROLES}>
          <Row to="/settings/skills" label="Skills tests" detail={skillsSummary} chevron />
        </RoleGate>
      </Group>
      <Section>Appearance</Section>
      <Group>
        <Row label="Theme">
          <Segmented<Theme>
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'auto', label: 'Auto' },
            ]}
          />
        </Row>
        <Row label="Field view" detail="3D stands the jerseys up; top-down is a flat diagram">
          <Segmented<FieldView>
            label="Field view"
            value={fieldView}
            onChange={setFieldView}
            style={{ width: 150 }}
            options={[
              { value: 'persp', label: '3D' },
              { value: 'flat', label: 'Top-down' },
            ]}
          />
        </Row>
      </Group>
      <Section>Account</Section>
      <Group>
        <Row to="/profile" label="Profile" detail={user?.email ?? ''} chevron />
        <Row to="/join" label="Join another team" link chevron />
        <Row onClick={confirmSignOut} label="Sign out" destructive />
      </Group>
      {isAdmin && (
        <>
          <Section>Platform</Section>
          <Group>
            <Row to="/admin" label="Admin console" detail="Every team and user" chevron />
            <Row to="/create-team" label="Create a new team" detail="Platform admins only" link chevron />
          </Group>
        </>
      )}
      <DataSection />
      <Section>Install</Section>
      <Group>
        <div
          className="row"
          style={{
            display: 'block',
            fontSize: 15,
            color: 'var(--text2)',
            lineHeight: 1.4,
            padding: '12px 16px',
          }}
        >
          In Safari, tap Share → <b style={{ color: 'var(--text)', fontWeight: 600 }}>Add to Home Screen</b>{' '}
          to run Mini-Messi&apos;s full screen like a native app.
        </div>
      </Group>
      <Footer>Your theme and field view are saved to your account and follow you between devices.</Footer>
    </Page>
  );
}
