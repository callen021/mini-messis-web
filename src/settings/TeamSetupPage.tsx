import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigate } from 'react-router';
import { useIsCoach, useIsStaff } from '@/auth/guards';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { Stepper } from '@/components/Stepper';
import { Switch } from '@/components/Switch';
import { useToast } from '@/components/Toast';
import { type Json } from '@/lib/database.types';
import { qk } from '@/lib/query-keys';
import { errorMessage, supabase } from '@/lib/supabase';
import { toEnginePlayers, useLiveGame } from '@/lineups/api';
import { periodsToPayload, rowsToPeriods } from '@/lineups/convert';
import { formationByName, SPORTS, periodPlural } from '@/sports/definitions';
import { fixPeriods, resizePeriods } from '@/sports/lineup';
import { type Team, usePlayers } from '@/teams/api';
import { useCurrentTeam } from '@/teams/TeamContext';

type Setup = Pick<Team, 'name' | 'side_size' | 'has_gk' | 'periods_count' | 'colors' | 'timezone'>;

/** IANA zones the browser knows, US ones first so the common picks are at the top (D50). */
function timezoneOptions(current: string): string[] {
  const all: string[] =
    typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : ['America/Chicago', 'America/New_York', 'America/Denver', 'America/Los_Angeles', 'UTC'];
  const us = all.filter((z) => z.startsWith('America/'));
  const rest = all.filter((z) => !z.startsWith('America/'));
  const list = [...us, ...rest];
  return list.includes(current) ? list : [current, ...list];
}

/**
 * Update the team row, then keep the template (and a live game) consistent with the new shape:
 * resize the period list, remap every lineup onto the new formations, and save through
 * `save_lineups`. Completed games are never touched (legacy `tidy()`).
 */
function useUpdateSetup(teamId: string) {
  const qc = useQueryClient();
  const { team, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const players = usePlayers(teamId);
  const live = useLiveGame(teamId);
  return useMutation({
    mutationFn: async (patch: Partial<Setup>) => {
      const { error } = await supabase.from('teams').update(patch).eq('id', teamId);
      if (error) throw new Error(error.message);
      const structural = 'side_size' in patch || 'has_gk' in patch || 'periods_count' in patch;
      if (!structural) return;
      const next = { ...team, ...patch };
      const forms = S.formations({ size: next.side_size, gk: next.has_gk });
      const enginePlayers = toEnginePlayers(players.data ?? []);
      const sync = async (gameId: string | null) => {
        let q = supabase.from('lineups').select('*').eq('team_id', teamId);
        q = gameId === null ? q.is('game_id', null) : q.eq('game_id', gameId);
        const { data: lineups, error: e1 } = await q.order('period_index');
        if (e1) throw new Error(e1.message);
        const ids = (lineups ?? []).map((l) => l.id);
        const { data: slots, error: e2 } = ids.length
          ? await supabase.from('lineup_slots').select('*').in('lineup_id', ids)
          : { data: [], error: null };
        if (e2) throw new Error(e2.message);
        const periods = rowsToPeriods(lineups ?? [], slots ?? []);
        const fixed = fixPeriods(
          resizePeriods(periods, next.periods_count, forms, S),
          forms,
          S,
          enginePlayers,
        );
        const { error: e3 } = await supabase.rpc('save_lineups', {
          p_team_id: teamId,
          p_game_id: gameId ?? undefined,
          p_periods: periodsToPayload(fixed, (n) => formationByName(forms, n)) as unknown as Json,
        });
        if (e3) throw new Error(e3.message);
      };
      await sync(null);
      if (live.data) await sync(live.data.id);
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: qk.team(teamId) });
      const previous = qc.getQueryData<Team>(qk.team(teamId));
      if (previous) qc.setQueryData(qk.team(teamId), { ...previous, ...patch });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.team(teamId), ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.team(teamId) });
      void qc.invalidateQueries({ queryKey: ['memberships'] });
      void qc.invalidateQueries({ queryKey: ['team', teamId, 'lineups'] });
    },
  });
}

/** Settings → Team setup: name, players on the field, goalkeeper, periods, formations read-out, jersey colors. */
export function TeamSetupPage() {
  const { teamId, team, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const isStaff = useIsStaff();
  const isCoach = useIsCoach();
  const toast = useToast();
  const update = useUpdateSetup(teamId);

  if (!isStaff) return <Navigate to="/settings" replace />;

  const onError = (e: unknown) => toast(errorMessage(e));
  const patch = (p: Partial<Setup>, msg?: string) =>
    update.mutate(p, { onError, onSuccess: () => msg && toast(msg) });
  const forms = S.formations({ size: team.side_size, gk: team.has_gk });
  const N = team.periods_count;
  const noun = S.periodName(N);
  const sizeIdx = Math.max(0, S.sizes.indexOf(team.side_size));
  const perIdx = Math.max(0, S.periodOptions.indexOf(N));
  const colors = (team.colors ?? {}) as Record<string, string>;
  const hint =
    sport === 'soccer'
      ? 'Read defense → attack (like 4-4-2): 3-2 is three defenders and two forwards, goalie not counted.'
      : sport === 'lacrosse'
        ? 'Read defense → midfield → attack: 3-3-3 is three defenders, three middies and three attackmen, goalie not counted.'
        : '';

  return (
    <Page
      title="Team setup"
      sub={`${S.emoji} ${S.name} · ${team.name}`}
      back={{ to: '/settings', label: 'Settings' }}
    >
      <Section>Team</Section>
      <Group>
        <Row label="Team name">
          <input
            className="inline"
            aria-label="Team name"
            defaultValue={team.name}
            maxLength={40}
            disabled={!isCoach}
            onBlur={(e) => {
              const v = e.target.value.replace(/\s+/g, ' ').trim().slice(0, 40);
              if (v && v !== team.name) patch({ name: v }, 'Team name saved');
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </Row>
        <Row
          label={`Players ${S.unit}`}
          detail={
            S.hasGK && team.has_gk
              ? 'including the goalkeeper'
              : sport === 'baseball'
                ? 'fielders per inning'
                : `per ${noun.toLowerCase()}`
          }
        >
          <Stepper
            label={`Players ${S.unit}`}
            value={sizeIdx}
            min={0}
            max={S.sizes.length - 1}
            display={String(team.side_size)}
            onChange={(i) => {
              const size = S.sizes[i];
              if (size !== undefined) patch({ side_size: size }, `${size} ${S.unit}`);
            }}
          />
        </Row>
        {S.hasGK && (
          <Row label="Goalkeeper" detail="one of the players above is the goalie">
            <Switch label="Goalkeeper" checked={team.has_gk} onChange={(on) => patch({ has_gk: on })} />
          </Row>
        )}
        <Row label={periodPlural(S, N, true)} detail={`${N} ${periodPlural(S, N)} per game`}>
          <Stepper
            label={periodPlural(S, N, true)}
            value={perIdx}
            min={0}
            max={S.periodOptions.length - 1}
            display={String(N)}
            onChange={(i) => {
              const n = S.periodOptions[i];
              if (n !== undefined) patch({ periods_count: n });
            }}
          />
        </Row>
        <Row label="Timezone" detail="Calendar exports use the field's local time">
          <select
            className="inline"
            aria-label="Timezone"
            value={team.timezone}
            onChange={(e) => patch({ timezone: e.target.value }, 'Timezone saved')}
          >
            {timezoneOptions(team.timezone).map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </Row>
        <Row
          label="Formations"
          detail={
            <>
              {forms.map((f) => f.name).join(' · ')}
              {hint && (
                <>
                  <br />
                  {hint}
                </>
              )}
            </>
          }
        />
      </Group>
      <Footer>
        Changing the number of players keeps assigned players where their position still exists and moves the
        rest to open spots. Each {noun.toLowerCase()} picks its own formation on the {S.field} tab. Completed
        games are never changed.
      </Footer>
      <Section>{S.name} jersey colors</Section>
      <Group>
        {S.groups.map(([g, name]) => {
          const c = colors[g] ?? S.defaultColors[g] ?? '#888888';
          return (
            <Row key={g} label={name} value={c.toUpperCase()}>
              <span className="swatch" style={{ background: c }}>
                <input
                  type="color"
                  aria-label={`${name} color`}
                  value={c}
                  onChange={(e) =>
                    patch({ colors: { ...colors, [g]: e.target.value } as unknown as NonNullable<Json> })
                  }
                />
              </span>
            </Row>
          );
        })}
      </Group>
      <Footer>
        Colors apply to the jerseys on the {S.field} tab and the chips on the Team tab for everyone on the
        team.
      </Footer>
    </Page>
  );
}
