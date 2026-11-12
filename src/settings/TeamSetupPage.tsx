import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { Navigate } from 'react-router';
import { useIsCoach, useIsStaff } from '@/auth/guards';
import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';
import { Segmented } from '@/components/Segmented';
import { Stepper } from '@/components/Stepper';
import { Switch } from '@/components/Switch';
import { useToast } from '@/components/Toast';
import { type Json } from '@/lib/database.types';
import { dbError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { toEnginePlayers, useLiveGame } from '@/lineups/api';
import { periodsToPayload, rowsToPeriods } from '@/lineups/convert';
import { formationByName, SPORTS, periodPlural } from '@/sports/definitions';
import { fixPeriods, resizePeriods } from '@/sports/lineup';
import { type Team, usePlayers } from '@/teams/api';
import { COALESCE_MS, SAVE_FAILED, invalidateTeamCaches, patchTeamCaches } from '@/teams/teamCache';
import { useCurrentTeam } from '@/teams/TeamContext';

type Setup = Pick<
  Team,
  | 'name'
  | 'side_size'
  | 'has_gk'
  | 'periods_count'
  | 'colors'
  | 'timezone'
  | 'time_mode'
  | 'clock_periods'
  | 'period_minutes'
>;

/** Period counts a clock-mode game may have (D65): one period up to four quarters, six for innings. */
const CLOCK_PERIOD_OPTIONS = [1, 2, 3, 4, 6] as const;

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
      if (error) throw dbError(error);
      const structural = 'side_size' in patch || 'has_gk' in patch || 'periods_count' in patch;
      if (!structural) return;
      const next = { ...team, ...patch };
      const forms = S.formations({ size: next.side_size, gk: next.has_gk });
      const enginePlayers = toEnginePlayers(players.data ?? []);
      const sync = async (gameId: string | null) => {
        let q = supabase.from('lineups').select('*').eq('team_id', teamId);
        q = gameId === null ? q.is('game_id', null) : q.eq('game_id', gameId);
        const { data: lineups, error: e1 } = await q.order('period_index');
        if (e1) throw dbError(e1);
        const ids = (lineups ?? []).map((l) => l.id);
        const { data: slots, error: e2 } = ids.length
          ? await supabase.from('lineup_slots').select('*').in('lineup_id', ids)
          : { data: [], error: null };
        if (e2) throw dbError(e2);
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
        if (e3) throw dbError(e3);
      };
      await sync(null);
      if (live.data) await sync(live.data.id);
    },
    onMutate: (patch) => ({ restore: patchTeamCaches(qc, teamId, patch) }),
    onError: (_e, _v, ctx) => ctx?.restore(),
    onSettled: () => {
      invalidateTeamCaches(qc, teamId);
      void qc.invalidateQueries({ queryKey: ['team', teamId, 'lineups'] });
    },
  });
}

/**
 * Every control on this page updates the screen at once and saves a moment later (D88): taps
 * closer together than COALESCE_MS merge into one request (a stepper tapped three times saves
 * once), the message shows right away, and a failed save puts every copy of the team back and
 * says so in plain words. Whatever is still queued is sent when the page is left.
 */
function useCoalescedSetup(teamId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const update = useUpdateSetup(teamId);
  const queued = useRef<Partial<Setup>>({});
  const restore = useRef<(() => void) | null>(null);
  const timer = useRef<number | undefined>(undefined);

  // stable across renders: useMutation hands back a new object each time, and the flush must only
  // ever run on a timer or when the page is left
  const mutate = useRef(update.mutate);
  const say = useRef(toast);
  useEffect(() => {
    mutate.current = update.mutate;
    say.current = toast;
  });

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const patch = queued.current;
    const undo = restore.current;
    queued.current = {};
    restore.current = null;
    if (Object.keys(patch).length === 0) return;
    mutate.current(patch, {
      onError: () => {
        undo?.();
        say.current(SAVE_FAILED);
      },
    });
  }, []);

  useEffect(() => flush, [flush]); // leaving the page sends what is still queued

  const patch = (p: Partial<Setup>, msg?: string) => {
    const undo = patchTeamCaches(qc, teamId, p);
    restore.current ??= undo; // the state before the first tap of this burst
    queued.current = { ...queued.current, ...p };
    if (msg) toast(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, COALESCE_MS);
  };
  return { patch, isPending: update.isPending };
}

/** Settings → Team setup: name, players on the field, goalkeeper, periods, formations read-out, jersey colors. */
export function TeamSetupPage() {
  const { teamId, team, sport } = useCurrentTeam();
  const S = SPORTS[sport];
  const isStaff = useIsStaff();
  const isCoach = useIsCoach();
  const { patch } = useCoalescedSetup(teamId);
  const live = useLiveGame(teamId);

  if (!isStaff) return <Navigate to="/settings" replace />;

  const forms = S.formations({ size: team.side_size, gk: team.has_gk });
  const clock = team.time_mode === 'clock';
  const N = clock ? team.clock_periods : team.periods_count;
  const noun = S.periodName(N);
  const sizeIdx = Math.max(0, S.sizes.indexOf(team.side_size));
  const perIdx = Math.max(0, S.periodOptions.indexOf(team.periods_count));
  const clockPerIdx = Math.max(0, CLOCK_PERIOD_OPTIONS.indexOf(team.clock_periods as 1 | 2 | 3 | 4 | 6));
  // the mode and the clock period count are locked while a game is live (the database refuses too)
  const liveLock = !!live.data;
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
        <Row
          label="Track playing time by"
          detail={
            liveLock
              ? 'Finish the game in progress to change this'
              : clock
                ? 'A game clock with substitutions; minutes played come from the clock'
                : `Lineups per ${noun.toLowerCase()}; playing time is counted in ${periodPlural(S, N)}`
          }
        >
          <Segmented<'periods' | 'clock'>
            label="Track playing time by"
            value={team.time_mode}
            onChange={(v) => {
              if (liveLock || v === team.time_mode) return;
              patch(
                { time_mode: v },
                v === 'clock' ? 'Playing time by the clock' : 'Playing time by periods',
              );
            }}
            style={{ width: 150, opacity: liveLock ? 0.5 : undefined }}
            options={[
              { value: 'periods', label: 'Periods' },
              { value: 'clock', label: 'Clock' },
            ]}
          />
        </Row>
        {clock ? (
          <>
            <Row
              label={periodPlural(S, N, true)}
              detail={liveLock ? 'Locked while a game is live' : `${N} ${periodPlural(S, N)} per game`}
            >
              <Stepper
                label={periodPlural(S, N, true)}
                value={clockPerIdx}
                min={0}
                max={CLOCK_PERIOD_OPTIONS.length - 1}
                display={String(N)}
                disabled={liveLock}
                onChange={(i) => {
                  const n = CLOCK_PERIOD_OPTIONS[i];
                  if (n !== undefined) patch({ clock_periods: n });
                }}
              />
            </Row>
            <Row
              label={`${noun} length`}
              detail={
                team.period_minutes
                  ? `The clock shows time remaining and alerts at zero; the ${noun.toLowerCase()} never ends on its own`
                  : 'Optional · minutes; leave blank for a plain count-up clock'
              }
            >
              <input
                key={team.period_minutes ?? 'off'}
                className="inline"
                type="number"
                inputMode="numeric"
                aria-label={`${noun} length in minutes`}
                placeholder="Off"
                min={1}
                max={90}
                defaultValue={team.period_minutes ?? ''}
                style={{ width: 64, textAlign: 'right' }}
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  const n =
                    raw === '' ? null : Math.min(90, Math.max(1, Math.round(Number(raw)) || 0)) || null;
                  if (n !== team.period_minutes)
                    patch(
                      { period_minutes: n },
                      n ? `${n}-minute ${noun.toLowerCase()}` : 'Period length off',
                    );
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            </Row>
          </>
        ) : (
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
        )}
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
        rest to open spots.{' '}
        {clock
          ? `In clock mode the ${S.field} tab shows one field with the starters and a bench; substitutions run on the game clock and minutes played come from it.`
          : `Each ${noun.toLowerCase()} picks its own formation on the ${S.field} tab.`}{' '}
        Completed games are never changed.
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
