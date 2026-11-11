import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useIsCoach, useIsStaff } from '@/auth/guards';
import { downloadJson, exportTeamBackup, useArchiveTeam, useImportBackup } from '@/backup/api';
import { examplePayload, isLegacyBackup, legacySports, normalizeLegacyBackup } from '@/backup/legacy';
import { ExportIcon, ImportIcon } from '@/components/icons';
import { Footer, Group, Row, Section } from '@/components/List';
import { useActionSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { todayISO } from '@/games/format';
import { errorMessage } from '@/lib/supabase';
import { useFormations } from '@/lineups/api';
import { defaultFormation, SPORTS, periodPlural } from '@/sports/definitions';
import { samplePlan } from '@/sports/lineup';
import { useCurrentTeam } from '@/teams/TeamContext';

/** Settings → Data: export, legacy import, example team, delete team. */
export function DataSection() {
  const { teamId, team, sport, isOwner } = useCurrentTeam();
  const S = SPORTS[sport];
  const isStaff = useIsStaff();
  const isCoach = useIsCoach();
  const toast = useToast();
  const sheet = useActionSheet();
  const navigate = useNavigate();
  const { forms } = useFormations();
  const importBackup = useImportBackup(teamId);
  const archive = useArchiveTeam(teamId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  if (!isStaff) return null;

  const exportNow = async () => {
    setBusy(true);
    try {
      const data = await exportTeamBackup(teamId);
      downloadJson(data, `${team.name}-backup-${todayISO()}.json`.replace(/[^\w.-]+/g, '-'));
      toast('Backup exported');
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file: File) => {
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      await sheet({
        title: 'Unable to import',
        message: 'That file is not valid JSON.',
        actions: [],
        cancel: 'OK',
      });
      return;
    }
    if (!isLegacyBackup(raw)) {
      await sheet({
        title: 'Unable to import',
        message: 'That file is not a Mini-Messi’s backup from the old app.',
        actions: [],
        cancel: 'OK',
      });
      return;
    }
    const sports = legacySports(raw);
    if (!sports.includes(sport)) {
      await sheet({
        title: 'Nothing to import',
        message: `This backup has no ${S.name.toLowerCase()} data (it has ${sports.map((s) => SPORTS[s].name.toLowerCase()).join(', ') || 'nothing'}). Switch to a team of that sport to import it.`,
        actions: [],
        cancel: 'OK',
      });
      return;
    }
    const { payload, summary } = normalizeLegacyBackup(raw, sport, true);
    const ok = await sheet({
      title: `Import ${S.name.toLowerCase()} data into ${team.name}?`,
      message: `${summary.players} players, ${summary.template} ${periodPlural(S, summary.template)} of lineups, ${summary.games} games with ${summary.events} ${S.scoring.unitPlural.toLowerCase()}. This replaces the players, lineups and games currently on this team.`,
      actions: [{ label: 'Import and replace', value: true, destructive: true }],
    });
    if (!ok) return;
    importBackup.mutate(payload, {
      onSuccess: (r) => toast(`Imported ${r.players} players and ${r.games} games`),
      onError: (e) => toast(errorMessage(e)),
    });
  };

  const loadExample = async () => {
    const ok = await sheet({
      title: `Load example ${S.name.toLowerCase()} team`,
      message: `This replaces the roster, lineups and games on ${team.name} with a sample team. Other teams are untouched.`,
      actions: [{ label: 'Load example', value: true, destructive: true }],
    });
    if (!ok) return;
    const f = defaultFormation(forms, S);
    const ids = S.sample.map((_, i) => `p${i}`);
    const plan = samplePlan(team.periods_count, f, ids);
    importBackup.mutate(examplePayload(sport, plan, forms), {
      onSuccess: () => toast('Example team loaded'),
      onError: (e) => toast(errorMessage(e)),
    });
  };

  const deleteTeam = async () => {
    const ok = await sheet({
      title: `Delete ${team.name}?`,
      message:
        'Every member loses access to this team, its games, stats and skills history. Export a backup first if you might want the data back.',
      actions: [{ label: 'Delete team', value: true, destructive: true }],
    });
    if (!ok) return;
    const ok2 = await sheet({
      title: 'Really delete the team?',
      message: 'This cannot be undone from the app.',
      actions: [{ label: 'Yes, delete it', value: true, destructive: true }],
    });
    if (!ok2) return;
    archive.mutate(undefined, {
      onSuccess: () => {
        toast('Team deleted');
        void navigate('/welcome', { replace: true });
      },
      onError: (e) => toast(errorMessage(e)),
    });
  };

  return (
    <>
      <Section>Data</Section>
      <Group>
        <Row
          icon={<ExportIcon />}
          iconColor="var(--blue)"
          label="Export backup"
          detail="Everything on this team as a JSON file"
          link
          onClick={() => void exportNow()}
          disabled={busy}
        />
        <Row
          icon={<ImportIcon />}
          iconColor="var(--orange)"
          label="Import legacy backup"
          detail={`Load ${S.name.toLowerCase()} data from the old app’s backup file`}
          link
          onClick={() => fileRef.current?.click()}
          disabled={importBackup.isPending}
        />
        {isCoach && (
          <Row
            icon={S.emoji}
            label="Load example team"
            detail="Sample roster and lineups for trying things out"
            link
            onClick={() => void loadExample()}
            disabled={importBackup.isPending}
          />
        )}
      </Group>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void importFile(f);
        }}
      />
      {isOwner && (
        <Group style={{ marginTop: 12 }}>
          <Row
            label="Delete team"
            destructive
            onClick={() => void deleteTeam()}
            disabled={archive.isPending}
          />
        </Group>
      )}
      <Footer>
        Backups never include the join code. The legacy import keeps the old app’s validation rules.
      </Footer>
    </>
  );
}
