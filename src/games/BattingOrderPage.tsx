import { LoadingScreen } from '@/auth/guards';
import { Button, Toolbar } from '@/components/Button';
import { ChevronDownIcon, ChevronUpIcon } from '@/components/icons';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useSetBattingOrder } from './api';
import { battingOrder, moveInOrder } from './batting';
import { makeNameLookup } from './names';

/** Edit the batting order with up/down arrows (legacy "Edit order" screen). */
export function BattingOrderPage() {
  const { teamId } = useCurrentTeam();
  const toast = useToast();
  const players = usePlayers(teamId);
  const setOrder = useSetBattingOrder(teamId);

  if (players.isPending) return <LoadingScreen />;
  const roster = players.data ?? [];
  const order = battingOrder(roster);
  const names = makeNameLookup(roster);
  const ids = order.map((p) => p.id);

  const save = (next: string[], msg?: string) => {
    // keep players who are out in their relative place after the active ones
    const rest = roster
      .filter((p) => !next.includes(p.id))
      .sort((a, b) => (a.batting_order ?? 999) - (b.batting_order ?? 999) || a.sort_order - b.sort_order)
      .map((p) => p.id);
    setOrder.mutate([...next, ...rest], { onError: (e) => toast(errorMessage(e)) });
    if (msg) toast(msg);
  };

  const rosterOrder = () => {
    const sorted = [...roster].sort(
      (a, b) => a.sort_order - b.sort_order || a.first_name.localeCompare(b.first_name),
    );
    save(
      sorted.filter((p) => p.is_available).map((p) => p.id),
      'Roster order restored',
    );
  };

  return (
    <Page
      title="Edit order"
      sub={`${order.length} batters · arrows move a player up or down`}
      back={{ to: '/lineup', label: 'Lineup' }}
    >
      <Toolbar className="noprint">
        <Button variant="gray" onClick={rosterOrder}>
          Roster order
        </Button>
      </Toolbar>
      <Section>Batting order</Section>
      <Group>
        {order.map((p, i) => (
          <div key={p.id} className="prow">
            <div className="num">{i + 1}</div>
            <div className="pname">{names.name(p.id)}</div>
            <div className="updown">
              <button
                type="button"
                aria-label={`Move ${names.name(p.id)} up`}
                disabled={i === 0}
                onClick={() => save(moveInOrder(ids, i, i - 1))}
              >
                <ChevronUpIcon />
              </button>
              <button
                type="button"
                aria-label={`Move ${names.name(p.id)} down`}
                disabled={i === order.length - 1}
                onClick={() => save(moveInOrder(ids, i, i + 1))}
              >
                <ChevronDownIcon />
              </button>
            </div>
          </div>
        ))}
        {order.length === 0 && <Row label="Add players on the Team tab." />}
      </Group>
      <Footer>
        Use the arrows to move players. Players added to the roster are appended to the bottom; players marked
        out are skipped. Changes are saved as you go — tap Lineup to go back.
      </Footer>
    </Page>
  );
}
