import { useState } from 'react';
import { useNavigate } from 'react-router';
import { LoadingScreen, useIsStaff } from '@/auth/guards';
import { Tag } from '@/components/Badge';
import { Button, Toolbar } from '@/components/Button';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { useActionSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/supabase';
import { useCurrentPlan } from '@/lineups/api';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useAddPlateAppearance, usePlateAppearances, useScoreEvents, useSetLastBatter } from './api';
import { batterPointers, battingOrder, paResultLabel } from './batting';
import { makeNameLookup } from './names';
import { PlateAppearanceSheet } from './PlateAppearanceSheet';

/** Baseball batting order (legacy Lineup tab): locked list, tap when batted, optional result entry. */
export function LineupPage() {
  const { teamId, team } = useCurrentTeam();
  const isStaff = useIsStaff();
  const toast = useToast();
  const sheet = useActionSheet();
  const navigate = useNavigate();
  const players = usePlayers(teamId);
  const plan = useCurrentPlan(teamId);
  const setLast = useSetLastBatter(teamId);
  const [batted, setBatted] = useState<string | null>(null);

  if (players.isPending || plan.isPending) return <LoadingScreen />;
  const roster = players.data ?? [];
  const order = battingOrder(roster);
  const names = makeNameLookup(roster);
  const { lastIdx, nextIdx } = batterPointers(order, team.last_batter_player_id);
  const firstInning = plan.periods[0]?.slots ?? [];
  const nextName = nextIdx >= 0 ? names.name(order[nextIdx]?.id) : '';

  const sub = !order.length
    ? 'Everyone bats · add players on the Team tab'
    : lastIdx < 0
      ? `Up next: ${nextName}${isStaff ? ' · tap a player when they’ve batted' : ''}`
      : `Last batter: ${names.name(team.last_batter_player_id)} · Up next: ${nextName}`;

  const onBatted = (id: string, i: number) => {
    setLast.mutate(id, { onError: (e) => toast(errorMessage(e)) });
    const nxt = order[(i + 1) % order.length];
    toast(`${names.name(id)} batted · ${names.name(nxt?.id)} is up`);
    if (plan.liveGame) setBatted(id);
  };

  const reset = async () => {
    if (!team.last_batter_player_id) {
      toast('Order already starts at the top');
      return;
    }
    const ok = await sheet({
      title: 'New game?',
      message: 'Clears the last-batter marker so the order starts from the top.',
      actions: [{ label: 'Start from the top', value: true }],
    });
    if (ok) {
      setLast.mutate(null, { onError: (e) => toast(errorMessage(e)) });
      toast('Batting order reset');
    }
  };

  return (
    <Page title="Batting order" sub={sub}>
      {isStaff && (
        <Toolbar className="noprint">
          <Button variant="tinted" onClick={() => void navigate('/lineup/order')}>
            Edit order
          </Button>
          <Button variant="gray" onClick={() => void reset()}>
            New game
          </Button>
        </Toolbar>
      )}
      <Section>Order</Section>
      <Group>
        {order.map((p, i) => (
          <div
            key={p.id}
            className={cn(
              'prow',
              firstInning.includes(p.id) && 'onfield',
              i === lastIdx && 'last',
              i === nextIdx && 'next',
            )}
          >
            <div className="num">{i + 1}</div>
            {isStaff ? (
              <button
                type="button"
                className="pname bat"
                title="Tap when this player has batted"
                onClick={() => onBatted(p.id, i)}
              >
                {names.name(p.id)}
                {i === lastIdx ? <Tag>LAST</Tag> : i === nextIdx ? <Tag up>UP NEXT</Tag> : null}
              </button>
            ) : (
              <div className="pname bat">
                {names.name(p.id)}
                {i === lastIdx ? <Tag>LAST</Tag> : i === nextIdx ? <Tag up>UP NEXT</Tag> : null}
              </div>
            )}
          </div>
        ))}
        {order.length === 0 && <Row label="Add players on the Team tab." />}
      </Group>
      <Footer>
        {isStaff
          ? 'Tap a player when they’ve batted — the next inning picks up from the following batter instead of starting over. The order is locked here so a stray tap can’t rearrange it during the game; use Edit order to change it. A dot after a name means they’re in the field for the first inning.'
          : 'The order updates live while the coach runs the game. A dot after a name means they’re in the field for the first inning.'}
      </Footer>
      {isStaff && plan.liveGame && (
        <BattedSheet
          gameId={plan.liveGame.id}
          batterId={batted}
          onClose={() => setBatted(null)}
          inningCount={plan.periods.length}
        />
      )}
    </Page>
  );
}

/** Optional result entry after the "batted" tap; hooks scoped to the live game. */
function BattedSheet({
  gameId,
  batterId,
  onClose,
  inningCount,
}: {
  gameId: string;
  batterId: string | null;
  onClose: () => void;
  inningCount: number;
}) {
  const { teamId } = useCurrentTeam();
  const toast = useToast();
  const players = usePlayers(teamId);
  const pas = usePlateAppearances(gameId);
  const events = useScoreEvents(gameId);
  const add = useAddPlateAppearance(teamId, gameId);
  const roster = players.data ?? [];
  const names = makeNameLookup(roster);
  const inning = Math.max(
    1,
    ...(pas.data ?? []).map((p) => p.inning),
    ...(events.data ?? []).map((e) => e.period_index + 1),
  );
  return (
    <PlateAppearanceSheet
      open={!!batterId}
      onClose={onClose}
      batterId={batterId}
      players={roster.filter((p) => p.is_available)}
      names={names}
      inning={inning}
      inningCount={inningCount}
      onSave={(v) => {
        add.mutate(v, { onError: (e) => toast(errorMessage(e)) });
        if (v.result !== 'none') toast(`${names.name(v.player_id)} · ${paResultLabel(v.result)}`);
      }}
    />
  );
}
