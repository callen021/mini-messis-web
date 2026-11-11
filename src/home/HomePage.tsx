import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { LoadingScreen, useIsStaff } from '@/auth/guards';
import { Badge } from '@/components/Badge';
import { Button, Toolbar } from '@/components/Button';
import { DirectionsIcon } from '@/components/icons';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { Segmented } from '@/components/Segmented';
import { Tile, Tiles } from '@/components/Tile';
import { useToast } from '@/components/Toast';
import { useGames, usePlayerStats } from '@/games/api';
import { directionsUrl } from '@/games/directions';
import { fmtDate, fmtTime, HOME_AWAY_LABEL, todayISO } from '@/games/format';
import { downloadScheduleIcs } from '@/games/ics';
import { usePractices } from '@/games/practices';
import { mergeSchedule } from '@/games/recurrence';
import { scheduleEvents } from '@/games/schedule-ics';
import { formatStat } from '@/games/stats';
import { countdown, timingLabel } from '@/games/timing';
import { useCurrentPlan, useFormations, useMyChildren } from '@/lineups/api';
import { toEnginePeriods } from '@/lineups/convert';
import { DetailsSection } from '@/players/DetailsSection';
import { SkillsBests } from '@/skills/SkillsBests';
import { textColor } from '@/sports/colors';
import { SPORTS, chipLabel } from '@/sports/definitions';
import { positionName } from '@/sports/positions';
import { type Player, usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { nextEvent } from './next';

/** Ticks every half minute so countdowns stay honest while the tab is open. */
function useNow(stepMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), stepMs);
    return () => window.clearInterval(t);
  }, [stepMs]);
  return now;
}

/** Parent landing tab (D53): my child, the next event, their positions, season, skills and details. */
export function HomePage() {
  const { teamId } = useCurrentTeam();
  const isStaff = useIsStaff();
  const players = usePlayers(teamId);
  const children = useMyChildren();
  const [picked, setPicked] = useState<string | null>(null);

  const mine = useMemo(() => {
    const ids = children.data ?? new Set<string>();
    return (players.data ?? []).filter((p) => ids.has(p.id));
  }, [children.data, players.data]);

  if (isStaff) return <Navigate to="/field" replace />;
  if (players.isPending || children.isPending) return <LoadingScreen label="Loading your player…" />;

  const child = mine.find((p) => p.id === picked) ?? mine[0] ?? null;
  if (!child) {
    return (
      <Page title="My player" sub="No child is linked to your account yet">
        <Group>
          <Row
            label="Ask the coach to link your child"
            detail="Once a coach confirms the link, this tab shows their next game, positions, season and skills."
          />
        </Group>
        <Footer>
          Use the coach’s invite link again to pick your child, or ask the coach to link them from Settings →
          Members.
        </Footer>
      </Page>
    );
  }

  return (
    <Page
      title={mine.length > 1 ? 'My players' : child.first_name}
      documentTitle={child.first_name}
      sub={
        mine.length > 1
          ? `${mine.map((p) => p.first_name).join(' · ')}`
          : `What’s next for ${child.first_name}`
      }
    >
      {mine.length > 1 && (
        <Segmented<string>
          wide
          label="Which child"
          value={child.id}
          onChange={setPicked}
          options={mine.map((p) => ({ value: p.id, label: p.first_name }))}
        />
      )}
      <ChildHome key={child.id} child={child} />
    </Page>
  );
}

function ChildHome({ child }: { child: Player }) {
  const { teamId, team, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const toast = useToast();
  const now = useNow();
  const games = useGames(teamId);
  const practices = usePractices(teamId);
  const plan = useCurrentPlan(teamId);
  const { formationFor } = useFormations();
  const stats = usePlayerStats(teamId, null);

  const today = todayISO();
  const schedule = useMemo(
    () => mergeSchedule(games.data ?? [], practices.data ?? [], today),
    [games.data, practices.data, today],
  );
  const next = nextEvent(schedule);
  const live = (games.data ?? []).find((g) => g.status === 'live') ?? null;
  const periods = useMemo(() => toEnginePeriods(plan.periods), [plan.periods]);
  const N = periods.length;
  const colors = (team.colors ?? {}) as Record<string, string>;
  const row = stats.data?.find((r) => r.player_id === child.id);
  const inPlan = periods.some((q) => q.slots.includes(child.id));

  const addToCalendar = () => {
    if (!next) return;
    const events = scheduleEvents([next], team.name);
    downloadScheduleIcs(team.name, events, team.timezone);
    toast('Event ready for your calendar');
  };

  /* ---------- next up ---------- */
  let nextCard: React.ReactNode;
  if (live) {
    nextCard = (
      <Group className="livecard">
        <Row
          to={`/games/${live.id}`}
          label={<b>In progress · vs {live.opponent}</b>}
          detail={`US ${live.us} – ${live.them} THEM · tap for the score and lineup`}
          chevron
        >
          <Badge status="live">Live</Badge>
        </Row>
      </Group>
    );
  } else if (!next) {
    nextCard = (
      <Group>
        <Row
          label="Nothing on the schedule yet"
          detail="The coach adds games and practices on the Schedule tab."
        />
      </Group>
    );
  } else {
    const isGame = next.kind === 'game';
    const title = isGame ? `vs ${next.game.opponent}` : 'Practice';
    const date = next.date;
    const time = next.time;
    const end = isGame ? null : next.practice.end_time;
    const location = isGame ? next.game.location : next.practice.location;
    const address = isGame ? next.game.address : next.practice.address;
    const notes = isGame ? next.game.parent_notes : next.practice.notes;
    const homeAway = isGame && next.game.home_away ? HOME_AWAY_LABEL[next.game.home_away] : '';
    const href = isGame ? `/games/${next.game.id}` : `/practices/${next.practice.id}`;
    const directions = directionsUrl(address, location);
    nextCard = (
      <Group className="homecard">
        <Row
          to={href}
          label={
            <>
              <b>{title}</b> <span className="countdown">{countdown(date, time, now)}</span>
            </>
          }
          detail={
            <>
              <b className="when">
                {fmtDate(date, true)}
                {time ? ` · ${fmtTime(time)}` : ''}
                {time && end ? ` – ${fmtTime(end)}` : ''}
              </b>
              {[location, address, homeAway].filter(Boolean).join(' · ')}
              {notes && (
                <>
                  <br />
                  {notes}
                </>
              )}
            </>
          }
          chevron
        >
          <Badge status="upcoming" className={timingLabel(date, today) === 'Upcoming' ? undefined : 'soon'}>
            {timingLabel(date, today)}
          </Badge>
        </Row>
        <Toolbar className="livebar">
          {directions && (
            <a className="btn tinted" href={directions} target="_blank" rel="noopener noreferrer">
              <DirectionsIcon style={{ width: 18, height: 18, marginRight: 6 }} />
              Directions
            </a>
          )}
          <Button variant="gray" onClick={addToCalendar}>
            Add to calendar
          </Button>
        </Toolbar>
      </Group>
    );
  }

  return (
    <>
      <Section>{live ? 'Right now' : 'Next up'}</Section>
      {nextCard}

      <Section>{live ? `${child.first_name} in this game` : `${child.first_name} in the next game`}</Section>
      <Group>
        {N === 0 || !inPlan ? (
          <Row
            label={
              N === 0 ? 'The coach hasn’t set a lineup yet' : `${child.first_name} isn’t in the lineup yet`
            }
            detail="Positions appear here as soon as the coach assigns them. The Team tab shows everyone."
          />
        ) : (
          <div className="prow stack homepos">
            <div className="qchips">
              {periods.map((q, qi) => {
                const f = formationFor(q.formation);
                const i = q.slots.indexOf(child.id);
                const pos = i < 0 ? undefined : f.positions[i];
                const col = pos ? (colors[S.group(pos.role)] ?? '#888') : undefined;
                const full = pos ? positionName(S, pos.code, pos.role) : 'Sitting out';
                return (
                  <div key={qi} className="qcell">
                    <span className="qlab">{chipLabel(S, N, qi)}</span>
                    <span
                      className={`qchip${pos ? ' on' : ' empty'}`}
                      style={col ? { background: col, color: textColor(col) } : undefined}
                      aria-label={`${S.periodName(N)} ${qi + 1}: ${full}`}
                      title={full}
                    >
                      {pos?.code ?? '–'}
                    </span>
                    <span className="qname">{pos ? full : 'out'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <Row to="/team" label="Whole team rotation" link chevron />
      </Group>

      <Section>Season</Section>
      <Tiles cols={4}>
        {S.scoring.profile.map((c, i) => (
          <Tile key={`${c.key}-${i}`} label={c.label} value={row ? formatStat(row, c.key) : '–'} />
        ))}
      </Tiles>

      <Section>Skills · personal bests</Section>
      <Group>
        <SkillsBests playerId={child.id} />
      </Group>
      <Footer>
        The line is the trend over the last sessions; PB marks a new personal best. Tap a test for every
        result.{' '}
        <Link to={`/players/${child.id}`} state={{ from: '/home', fromLabel: child.first_name }}>
          Contact card and full history
        </Link>
      </Footer>

      <Section>Details</Section>
      <DetailsSection compact playerId={child.id} playerName={child.first_name} canEdit />
    </>
  );
}
