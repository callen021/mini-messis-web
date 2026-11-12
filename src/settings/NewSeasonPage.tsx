import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { LoadingScreen, useIsCoach } from '@/auth/guards';
import { Button } from '@/components/Button';
import { Field, TextInput } from '@/components/Form';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { useActionSheet } from '@/components/Sheet';
import { Switch } from '@/components/Switch';
import { useToast } from '@/components/Toast';
import { useCurrentSeason, useStartSeason } from '@/games/api';
import { errorMessage } from '@/lib/supabase';
import { useLiveGame } from '@/lineups/api';
import { losingAccessText, parentsLosingAccess } from '@/roster/api';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { defaultSeasonName, seasonSummary } from './season';

/**
 * Settings → Start new season (D94): name and dates, then a roster review with a Returning switch
 * per player (default on). One transaction on confirm; not available while a game is live.
 */
export function NewSeasonPage() {
  const { teamId, team } = useCurrentTeam();
  const isCoach = useIsCoach();
  const navigate = useNavigate();
  const toast = useToast();
  const sheet = useActionSheet();
  const players = usePlayers(teamId);
  const live = useLiveGame(teamId);
  const current = useCurrentSeason(teamId);
  const start = useStartSeason(teamId);
  const [name, setName] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [step, setStep] = useState<'details' | 'roster'>('details');
  const [notReturning, setNotReturning] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState('');

  if (!isCoach) return <Navigate to="/settings" replace />;
  if (players.isPending || live.isPending || current.isPending) return <LoadingScreen />;

  const roster = players.data ?? [];
  const placeholder = defaultSeasonName(current.data?.name);
  const seasonName = name.trim() || placeholder;
  const toggle = (id: string, returning: boolean) =>
    setNotReturning((prev) => {
      const next = new Set(prev);
      if (returning) next.delete(id);
      else next.add(id);
      return next;
    });

  const next = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (startsOn && endsOn && endsOn < startsOn) {
      setError('The season cannot end before it starts.');
      return;
    }
    setStep('roster');
  };

  const confirm = async () => {
    const leaving = roster.filter((p) => notReturning.has(p.id));
    let losing = '';
    try {
      losing = losingAccessText(await parentsLosingAccess(leaving.map((p) => p.id)));
    } catch (err) {
      toast(errorMessage(err));
      return;
    }
    const ok = await sheet({
      title: `Start ${seasonName}?`,
      message: seasonSummary(seasonName, roster.length - leaving.length, leaving, losing),
      actions: [{ label: `Start ${seasonName}`, value: true, destructive: leaving.length > 0 }],
    });
    if (!ok) return;
    start.mutate(
      {
        name: seasonName,
        startsOn: startsOn || null,
        endsOn: endsOn || null,
        notReturning: leaving.map((p) => p.id),
      },
      {
        onSuccess: () => {
          toast(`${seasonName} is under way`);
          void navigate('/field', { replace: true });
        },
        onError: (err: unknown) => toast(errorMessage(err)),
      },
    );
  };

  if (live.data) {
    return (
      <Page title="Start new season" sub={team.name} back={{ to: '/settings', label: 'Settings' }}>
        <Group>
          <Row
            label="Finish the game in progress first"
            detail="A new season cannot start while a game is live."
            to={`/games/${live.data.id}`}
            chevron
          />
        </Group>
      </Page>
    );
  }

  return (
    <Page
      title="Start new season"
      sub={current.data ? `${team.name} · now in ${current.data.name}` : team.name}
      back={step === 'details' ? { to: '/settings', label: 'Settings' } : undefined}
    >
      {step === 'details' ? (
        <form onSubmit={next} noValidate>
          <Section>New season</Section>
          <Group>
            <div className="form">
              <Field label="Name">
                <TextInput
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={placeholder}
                  maxLength={40}
                  data-autofocus=""
                />
              </Field>
              <Field label="Starts (optional)">
                <TextInput type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
              </Field>
              <Field label="Ends (optional)">
                <TextInput type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
              </Field>
            </div>
          </Group>
          {error && (
            <p className="form-error" role="alert" style={{ margin: '12px 16px 0' }}>
              {error}
            </p>
          )}
          <Footer>
            Next: a roster review. Players marked not returning are removed; parents whose only child that was
            lose access. Returning players keep their numbers, details and contacts; parents, settings, skills
            history, the board and the invite link all carry over.
          </Footer>
          <div className="toolbar" style={{ marginTop: 18 }}>
            <Button type="submit">Next · roster review</Button>
          </div>
        </form>
      ) : (
        <>
          <Section>
            Roster review · {roster.length - notReturning.size} of {roster.length} returning
          </Section>
          <Group>
            {roster.map((p) => (
              <Row
                key={p.id}
                label={p.first_name}
                detail={p.jersey_number ? `#${p.jersey_number}` : undefined}
                className={notReturning.has(p.id) ? 'out' : undefined}
              >
                <Switch
                  label={`${p.first_name} returning`}
                  checked={!notReturning.has(p.id)}
                  onChange={(on) => toggle(p.id, on)}
                />
              </Row>
            ))}
            {roster.length === 0 && <Row label="No players on the roster" />}
          </Group>
          <Footer>
            Switch off anyone who is not coming back. Their games and stats stay in{' '}
            {current.data?.name ?? 'the past season'}.
          </Footer>
          <div className="toolbar" style={{ marginTop: 18 }}>
            <Button variant="gray" onClick={() => setStep('details')}>
              Back
            </Button>
            <Button onClick={() => void confirm()} disabled={start.isPending}>
              {start.isPending ? 'Starting…' : `Start ${seasonName}`}
            </Button>
          </div>
        </>
      )}
    </Page>
  );
}
