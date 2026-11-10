import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Footer, Group, Page, Row, Segmented, Select, Stepper, Switch, Tabbar } from '@/components';
import { OpenPill } from '@/components/Badge';
import { FieldIcon, GamesIcon, StatsIcon, TeamIcon } from '@/components/icons';
import { useToast } from '@/components/Toast';
import { useUIStore } from '@/lib/ui-store';
import { FieldStage } from '@/lineups/FieldStage';
import { Jersey, JerseyDefs } from '@/lineups/Jersey';
import { ALL_SPORTS, SPORTS, defaultFormation, shortPeriod } from '@/sports/definitions';
import { type FieldView } from '@/sports/field';
import { autoFillAll, counts, emptyPeriod, samplePlan } from '@/sports/lineup';
import { type EnginePlayer, type SportKey } from '@/sports/types';

const TABS = [
  { to: '/dev/field', label: 'Field', icon: <FieldIcon /> },
  { to: '/team', label: 'Team', icon: <TeamIcon /> },
  { to: '/games', label: 'Games', icon: <GamesIcon /> },
  { to: '/stats', label: 'Stats', icon: <StatsIcon /> },
];

type Fill = 'sample' | 'auto' | 'empty';

/**
 * Dev-only: every sport × size × formation × view, rendered through the real FieldStage/Jersey
 * components, to compare side by side with legacy/index.html.
 */
export default function FieldPage() {
  const toast = useToast();
  const setSportTint = useUIStore((s) => s.setSport);
  const fieldView = useUIStore((s) => s.fieldView);
  const setFieldView = useUIStore((s) => s.setFieldView);

  const [sport, setSport] = useState<SportKey>('soccer');
  const S = SPORTS[sport];
  const [size, setSize] = useState(S.defaultSize);
  const [gk, setGk] = useState(S.hasGK);
  const [fill, setFill] = useState<Fill>('sample');
  const [showAll, setShowAll] = useState(true);
  const [depthScale, setDepthScale] = useState(false);
  const [pickedName, setPickedName] = useState<string>('');

  const changeSport = (k: SportKey) => {
    setSport(k);
    setSportTint(k);
    setSize(SPORTS[k].defaultSize);
    setGk(SPORTS[k].hasGK);
    setPickedName('');
  };

  const sizeIdx = Math.max(0, S.sizes.indexOf(size));
  const forms = useMemo(() => S.formations({ size, gk: S.hasGK && gk }), [S, size, gk]);
  const players: EnginePlayer[] = useMemo(
    () => S.sample.map((name, i) => ({ id: `p${i}`, name, active: true })),
    [S],
  );
  const numbers = useMemo(() => Object.fromEntries(players.map((p, i) => [p.id, String(i + 1)])), [players]);
  const shown = showAll
    ? forms
    : [
        pickedName ? (forms.find((f) => f.name === pickedName) ?? forms[0]) : defaultFormation(forms, S),
      ].filter((f): f is NonNullable<typeof f> => !!f);

  // One plan per formation so Auto-fill can be judged per card.
  const plans = useMemo(
    () =>
      shown.map((f) => {
        if (fill === 'empty') return emptyPeriod(f);
        if (fill === 'sample')
          return (
            samplePlan(
              1,
              f,
              players.map((p) => p.id),
            )[0] ?? emptyPeriod(f)
          );
        const { periods } = autoFillAll([emptyPeriod(f)], forms, S, players);
        return periods[0] ?? emptyPeriod(f);
      }),
    [shown, fill, players, forms, S],
  );

  const colors = S.defaultColors;

  return (
    <>
      <JerseyDefs />
      <Tabbar tabs={TABS} />
      <main className="app-main">
        <Page
          title={`${S.emoji} ${S.name} ${S.field.toLowerCase()}`}
          sub={`Dev-only · ${forms.length} formation${forms.length === 1 ? '' : 's'} for ${size} ${S.unit}${S.hasGK ? (gk ? ' incl. goalie' : ', no goalie') : ''} · compare with legacy/index.html`}
        >
          <Group>
            <Row
              label="Sport"
              detail={
                ALL_SPORTS.includes(sport) && sport === 'football'
                  ? 'Built but disabled in the app'
                  : undefined
              }
            >
              <Select
                value={sport}
                onChange={(e) => changeSport(e.target.value as SportKey)}
                aria-label="Sport"
                style={{ width: 160 }}
              >
                {ALL_SPORTS.map((k) => (
                  <option key={k} value={k}>
                    {SPORTS[k].emoji} {SPORTS[k].name}
                  </option>
                ))}
              </Select>
            </Row>
            <Row label={`Players ${S.unit}`} detail={S.hasGK && gk ? 'including the goalkeeper' : undefined}>
              <Stepper
                label={`Players ${S.unit}`}
                value={sizeIdx}
                min={0}
                max={S.sizes.length - 1}
                display={String(size)}
                onChange={(i) => {
                  const next = S.sizes[i];
                  if (next !== undefined) {
                    setSize(next);
                    setPickedName('');
                  }
                }}
              />
            </Row>
            {S.hasGK && (
              <Row label="Goalkeeper">
                <Switch label="Goalkeeper" checked={gk} onChange={setGk} />
              </Row>
            )}
            <Row label="View">
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
            <Row label="Jerseys">
              <Segmented<Fill>
                label="Jersey fill"
                value={fill}
                onChange={setFill}
                style={{ width: 200 }}
                options={[
                  { value: 'sample', label: 'Sample' },
                  { value: 'auto', label: 'Auto-fill' },
                  { value: 'empty', label: 'Open' },
                ]}
              />
            </Row>
            <Row label="Depth-scaled jerseys" detail="Legacy 3D look: jerseys shrink toward the far end">
              <Switch label="Depth-scaled jerseys" checked={depthScale} onChange={setDepthScale} />
            </Row>
            <Row label="Show every formation" detail={showAll ? undefined : 'Pick one below'}>
              <Switch label="Show every formation" checked={showAll} onChange={setShowAll} />
            </Row>
            {!showAll && (
              <Row label="Formation">
                <Select
                  value={shown[0]?.name ?? ''}
                  onChange={(e) => setPickedName(e.target.value)}
                  aria-label="Formation"
                  style={{ width: 160 }}
                >
                  {forms.map((f) => (
                    <option key={f.name}>{f.name}</option>
                  ))}
                </Select>
              </Row>
            )}
          </Group>
          <Footer>
            Jersey tap only toasts here. Open the legacy file in another tab with the same sport, size and
            formation to compare placement; switch on depth-scaled jerseys to match its 3D sizing, off for the
            current constant size. <Link to="/dev/components">Components gallery →</Link>
          </Footer>

          <div className="quarters" style={{ marginTop: 18 }}>
            {shown.map((f, idx) => {
              const q = plans[idx] ?? emptyPeriod(f);
              const c = counts([q], players);
              const openN = q.slots.filter((s) => !s).length;
              return (
                <article key={f.name} className="qcard">
                  <div className="qhead">
                    <div className="qleft">
                      <h2>{shortPeriod(S, S.defaultPeriods, idx % S.defaultPeriods)}</h2>
                      <OpenPill open={openN} />
                    </div>
                    <div className="qright">
                      <div className="sel">
                        <select
                          aria-label={`Formation (${f.name})`}
                          value={f.name}
                          onChange={() => undefined}
                        >
                          <option>{f.name}</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <FieldStage
                    sport={sport}
                    view={fieldView}
                    formation={f}
                    depthScale={depthScale}
                    renderSlot={(i) => {
                      const pos = f.positions[i];
                      if (!pos) return null;
                      const pid = q.slots[i] ?? '';
                      const player = players.find((p) => p.id === pid);
                      const color = colors[S.group(pos.role)] ?? '#888';
                      return (
                        <Jersey
                          id={`${idx}-${i}`}
                          color={color}
                          kind={S.jersey}
                          name={player?.name ?? ''}
                          number={player ? numbers[player.id] : undefined}
                          code={pos.code}
                          auto={q.auto.includes(i)}
                          label={`${S.label(pos.role)}: ${player?.name ?? 'open'}`}
                          onClick={() =>
                            toast(
                              `${pos.code} · ${S.label(pos.role)} · ${player ? `${player.name} has ${c[player.id]} so far` : 'open'}`,
                            )
                          }
                        />
                      );
                    }}
                  />
                  <div className="bench">
                    {openN > 0 && <span className="opencount">{openN} open</span>}
                    <strong>Sitting out · {players.length - (f.positions.length - openN)}</strong>
                    <div className="names">
                      {players
                        .filter((p) => !q.slots.includes(p.id))
                        .map((p) => p.name)
                        .join(' · ') || `Everyone is ${S.unit}`}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <div style={{ height: 24 }} />
        </Page>
      </main>
    </>
  );
}
