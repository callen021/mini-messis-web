import { useMemo } from 'react';
import { LoadingScreen } from '@/auth/guards';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { useToast } from '@/components/Toast';
import { useCurrentSeason, useGames } from '@/games/api';
import { fmtDate, fmtTime, todayISO } from '@/games/format';
import { usePractices } from '@/games/practices';
import { mergeSchedule } from '@/games/recurrence';
import { AllergySummary } from '@/players/AllergySummary';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useSnackCap } from './api';
import { type SnackSlot, familyLabel, claimsByPlayer, snackWanted } from './snacks';
import { useSnackFamily } from './useSnackFamily';

/**
 * Snack signup (D115): the team's allergy summary, then every upcoming eligible event with Open
 * or the family's name. One tap claims an open one, one tap releases your own; coaches assign or
 * clear any slot.
 */
export function SnackSignupPage() {
  const { teamId, team } = useCurrentTeam();
  const toast = useToast();
  const games = useGames(teamId);
  const practices = usePractices(teamId);
  const season = useCurrentSeason(teamId);
  const f = useSnackFamily();
  const cap = useSnackCap(teamId, !f.isStaff);
  const mode = team.snack_signup;
  const today = todayISO();
  const items = useMemo(
    () =>
      mergeSchedule(games.data ?? [], practices.data ?? [], today).filter(
        (i) => snackWanted(mode, i.kind) && (i.kind === 'game' || i.practice.status !== 'cancelled'),
      ),
    [games.data, practices.data, today, mode],
  );
  const claims = useMemo(() => {
    const sid = season.data?.id;
    const slots: SnackSlot[] = [
      ...(games.data ?? []).filter((g) => g.season_id === sid && snackWanted(mode, 'game')),
      ...(practices.data ?? []).filter(
        (p) => p.season_id === sid && p.status !== 'cancelled' && snackWanted(mode, 'practice'),
      ),
    ];
    return claimsByPlayer(slots);
  }, [games.data, practices.data, season.data?.id, mode]);

  if (games.isPending || practices.isPending) return <LoadingScreen />;

  const back = { to: f.isStaff ? '/games' : '/home', label: f.isStaff ? 'Schedule' : 'Home' };
  if (mode === 'off')
    return (
      <Page title="Snack signup" back={back}>
        <p className="sub">Snack signup is off for this team.</p>
      </Page>
    );

  const myClaims = f.mine.reduce((n, p) => n + (claims.get(p.id) ?? 0), 0);
  const onTap = (slot: SnackSlot, event: { kind: 'game' | 'practice'; id: string }) => {
    if (f.isStaff) return void f.assign(event, slot);
    if (!slot.snack_player_id) return void f.claim(event);
    if (f.isMine(slot)) return void f.release(event);
    const who = f.nameOf(slot.snack_player_id);
    toast(who ? `${familyLabel(who)} has this one` : 'Another family has this one');
  };

  return (
    <Page
      title="Snack signup"
      sub={mode === 'both' ? 'One family per game or practice' : 'One family per game'}
      back={back}
    >
      <AllergySummary teamId={teamId} />
      <Section>Coming up</Section>
      <Group>
        {items.map((i) => {
          const slot: SnackSlot = i.kind === 'game' ? i.game : i.practice;
          const event = { kind: i.kind, id: i.kind === 'game' ? i.game.id : i.practice.id } as const;
          const who = slot.snack_player_id ? f.nameOf(slot.snack_player_id) : undefined;
          const mine = f.isMine(slot);
          const state = !slot.snack_player_id ? 'open' : mine ? 'mine' : 'taken';
          const text = state === 'open' ? 'Open' : who ? familyLabel(who) : 'Taken';
          return (
            <Row
              key={event.id}
              className="snackrow"
              label={i.kind === 'game' ? `vs ${i.game.opponent}` : 'Practice'}
              detail={`${fmtDate(i.date, true)}${i.time ? ` · ${fmtTime(i.time)}` : ''}${
                slot.snack_flagged && f.isStaff ? ' · the family can’t make it' : ''
              }`}
              onClick={() => onTap(slot, event)}
              disabled={f.busy}
              aria-label={`${i.kind === 'game' ? `vs ${i.game.opponent}` : 'Practice'}, ${fmtDate(i.date, true)}: snacks ${text}${mine ? ' (yours)' : ''}`}
            >
              <span className={`val ${state}`}>
                {text}
                {mine ? ' · you' : ''}
              </span>
            </Row>
          );
        })}
        {items.length === 0 && <Row label="Nothing coming up that needs snacks" />}
      </Group>
      <Footer>
        {f.isStaff
          ? 'Tap an event to assign a family or clear it. Parents sign up themselves, up to their share of the season; you can always override.'
          : `Tap an open event to bring the snacks, tap your own to release it.${
              cap.data ? ` Your family: ${myClaims} of ${cap.data} this season.` : ''
            }`}
      </Footer>
    </Page>
  );
}
