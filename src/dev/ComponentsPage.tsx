import { useState } from 'react';
import {
  Badge,
  Button,
  ChartIcon,
  CheckIcon,
  ExportIcon,
  Field,
  FieldGroup,
  FieldIcon,
  Footer,
  FormSheet,
  GamesIcon,
  Group,
  OpenPill,
  Page,
  PeriodTag,
  Pill,
  PlusIcon,
  Row,
  Scoreline,
  Section,
  Segmented,
  Select,
  StatsIcon,
  Stepper,
  Switch,
  Tabbar,
  type TabbarPosition,
  Tag,
  TeamIcon,
  TextInput,
  Tile,
  Tiles,
  Toolbar,
  TrashIcon,
  useActionSheet,
  useToast,
} from '@/components';
import { ChevronDownIcon, ChevronUpIcon } from '@/components/icons';
import { type FieldView, type Theme, useUIStore } from '@/lib/ui-store';
import { ENABLED_SPORTS, type SportKey } from '@/sports/types';

const SPORT_LABEL: Record<SportKey, string> = {
  soccer: '⚽ Soccer',
  baseball: '⚾ Baseball',
  basketball: '🏀 Basketball',
  lacrosse: '🥍 Lacrosse',
  football: '🏈 Football',
};

const TABS = [
  { to: '/dev/components', label: 'Field', icon: <FieldIcon /> },
  { to: '/team', label: 'Team', icon: <TeamIcon /> },
  { to: '/games', label: 'Schedule', icon: <GamesIcon /> },
  { to: '/stats', label: 'Stats', icon: <StatsIcon /> },
];

const PLAYERS = [
  { name: 'Nolan', num: '1', periods: ['ST', 'MID', '', 'ST'], total: 3 },
  { name: 'Teddy', num: '2', periods: ['GK', 'GK', 'GK', ''], total: 3, auto: [2] },
  { name: 'Jack', num: '3', periods: ['DEF', '', 'DEF', 'DEF'], total: 3 },
  { name: 'Weston', num: '4', periods: ['', 'DEF', 'MID', ''], total: 2 },
];
const GROUP_COLOR: Record<string, string> = { ST: '#7b3fe4', MID: '#7b3fe4', DEF: '#7b3fe4', GK: '#14b8a6' };

/** Dev-only gallery of every design-system piece, with live theme/sport switches. */
export default function ComponentsPage() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const sport = useUIStore((s) => s.sport);
  const setSport = useUIStore((s) => s.setSport);
  const fieldView = useUIStore((s) => s.fieldView);
  const setFieldView = useUIStore((s) => s.setFieldView);

  const toast = useToast();
  const sheet = useActionSheet();

  const [tabPos, setTabPos] = useState<TabbarPosition>('bottom');
  const [gk, setGk] = useState(true);
  const [active, setActive] = useState(true);
  const [size, setSize] = useState(7);
  const [periods, setPeriods] = useState(4);
  const [segment, setSegment] = useState<'rotation' | 'roster'>('rotation');
  const [sheetResult, setSheetResult] = useState('—');
  const [formOpen, setFormOpen] = useState(false);
  const [opponent, setOpponent] = useState('');
  const [period, setPeriod] = useState<'1' | '2' | '3' | '4'>('1');

  const askRemove = async () => {
    const v = await sheet({
      title: 'Nolan',
      message:
        'This player is on the field in at least one quarter. Those jerseys will become unassigned. Remove from the roster?',
      actions: [{ label: 'Remove player', value: 'remove', destructive: true }],
    });
    setSheetResult(v ?? 'cancelled');
    if (v) toast('Player removed');
  };
  const askInfo = async () => {
    const v = await sheet({
      title: 'Unable to import',
      message: 'That file is not a valid Mini-Messi’s backup.',
      actions: [{ label: 'OK', value: 'ok' }],
      cancel: null,
    });
    setSheetResult(v ?? 'cancelled');
  };

  return (
    <>
      <Tabbar tabs={TABS} position={tabPos} />
      <main className="app-main" data-tabbar={tabPos}>
        <Page title="Components" sub="Dev-only gallery · every piece of the design system">
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
            <Row label="Sport tint" detail="Changes --tint across the page">
              <Select
                value={sport}
                onChange={(e) => setSport(e.target.value as SportKey)}
                aria-label="Sport tint"
                style={{ width: 150 }}
              >
                {ENABLED_SPORTS.map((s) => (
                  <option key={s} value={s}>
                    {SPORT_LABEL[s]}
                  </option>
                ))}
              </Select>
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
            <Row label="Tab bar position" detail="Bottom is the default; top matches the legacy app">
              <Segmented<TabbarPosition>
                label="Tab bar position"
                value={tabPos}
                onChange={setTabPos}
                style={{ width: 150 }}
                options={[
                  { value: 'top', label: 'Top' },
                  { value: 'bottom', label: 'Bottom' },
                ]}
              />
            </Row>
          </Group>

          <Section>Typography</Section>
          <Group>
            <Row label="Large title" detail="34px / 700 · .large" value="Aa" />
            <Row label="Body" detail="17px / 1.35 system font" />
            <Row label="Secondary" detail="15px --text2 · .sub" />
            <Row label="Section header" detail="13px uppercase --text2 · .section" />
            <Row label="Pill">
              <Pill>7v7 · GK</Pill>
            </Row>
          </Group>

          <Section>Buttons</Section>
          <Toolbar>
            <Button onClick={() => toast('Auto-fill · 6 jerseys filled across 4 quarters')}>Primary</Button>
            <Button variant="tinted" onClick={() => toast('Tinted')}>
              Tinted
            </Button>
            <Button variant="gray" onClick={() => toast('Gray')}>
              Gray
            </Button>
          </Toolbar>
          <Toolbar>
            <Button size="sm" variant="tinted">
              Auto-fill
            </Button>
            <Button size="sm" variant="gray">
              Redo
            </Button>
            <Button disabled>Disabled</Button>
          </Toolbar>

          <Section>Rows</Section>
          <Group>
            <Row label="Plain row" value="Value" />
            <Row
              label="With detail"
              detail="Secondary line under the label"
              chevron
              onClick={() => toast('Tapped')}
            />
            <Row
              icon={<ExportIcon />}
              iconColor="var(--blue)"
              label="Export backup"
              detail="Rosters, lineups, games"
              chevron
              link
              onClick={() => toast('Export')}
            />
            <Row
              icon={<ChartIcon />}
              iconColor="var(--tint)"
              label="Load example team"
              chevron
              link
              onClick={() => toast('Example')}
            />
            <Row
              icon={<PlusIcon />}
              iconColor="var(--tint)"
              label="Add player"
              link
              onClick={() => toast('Add')}
            />
            <Row
              icon={<TrashIcon />}
              iconColor="var(--red)"
              label="Delete team"
              destructive
              onClick={askRemove}
            />
            <Row
              icon="⚽"
              label="Soccer"
              detail="14 players · 7 on the field · 4 quarters"
              onClick={() => setSport('soccer')}
            >
              {sport === 'soccer' && (
                <span className="check" aria-label="Selected">
                  <CheckIcon />
                </span>
              )}
            </Row>
            <Row to="/field" label="Router link row" chevron />
            <Row label="Disabled" onClick={() => undefined} disabled />
          </Group>
          <Footer>
            Rows render as a button when given onClick, a link when given to, otherwise a div. Dividers are
            drawn by CSS.
          </Footer>

          <Section>Controls</Section>
          <Group>
            <Row label="Goalkeeper" detail="one of the players above is the goalie">
              <Switch label="Goalkeeper" checked={gk} onChange={setGk} />
            </Row>
            <Row label="Switch · md (roster)">
              <Switch label="Active" size="md" checked={active} onChange={setActive} />
            </Row>
            <Row label="Switch · sm (rotation)">
              <Switch label="Playing today" size="sm" checked={active} onChange={setActive} />
            </Row>
            <Row label="Switch · disabled">
              <Switch label="Disabled" checked disabled onChange={() => undefined} />
            </Row>
            <Row label="Players on the field" detail="including the goalkeeper">
              <Stepper label="Players on the field" value={size} min={3} max={11} onChange={setSize} />
            </Row>
            <Row label="Quarters" detail={`${periods} quarters per game`}>
              <Stepper label="Quarters" value={periods} min={2} max={4} onChange={setPeriods} />
            </Row>
          </Group>

          <Section>Segmented</Section>
          <Segmented<'rotation' | 'roster'>
            wide
            label="Team view"
            value={segment}
            onChange={setSegment}
            options={[
              { value: 'rotation', label: 'Rotation' },
              { value: 'roster', label: 'Roster' },
            ]}
          />
          <Footer style={{ marginTop: 8 }}>
            Arrow keys move the selection; Tab lands on the selected segment. Showing: {segment}.
          </Footer>

          <Section>Tiles</Section>
          <Tiles>
            <Tile label="Played" value={6} />
            <Tile label="W-L-D" value="4-1-1" />
            <Tile label="Goals for" value={17} />
            <Tile label="Against" value={9} />
            <Tile label="Diff" value="+8" />
            <Tile label="Avg" value="2.8" />
          </Tiles>

          <Section>Badges, tags, scores</Section>
          <Group>
            <Row label="Status badges">
              <Badge status="live">In progress</Badge>
              <Badge status="upcoming">Upcoming</Badge>
              <Badge status="done">Win</Badge>
              <Badge>Draw</Badge>
            </Row>
            <Row label="Open pills">
              <OpenPill open={2} />
              <OpenPill open={0} />
            </Row>
            <Row label="Tags">
              <Tag>LAST</Tag>
              <Tag up>UP NEXT</Tag>
              <span>
                <PeriodTag>Q2</PeriodTag>Nolan
              </span>
            </Row>
            <Row label="Scoreline">
              <Scoreline us={3} them={1} />
            </Row>
            <Row label="Score button">
              <button type="button" className="score live" aria-label="Score 3 to 1. Add a goal">
                <small>US</small>
                <b>3</b>
                <i aria-hidden="true">–</i>
                <b>1</b>
                <small>THEM</small>
              </button>
              <button type="button" className="score" aria-label="Start a game and record goals">
                <small>US</small>
                <b>0</b>
                <i aria-hidden="true">–</i>
                <b>0</b>
                <small>THEM</small>
              </button>
            </Row>
          </Group>
          <Scoreline us={3} them={1} big />

          <Section>Player rows (rotation grid)</Section>
          <Group>
            {PLAYERS.map((p) => (
              <div key={p.name} className="prow">
                <Switch label={`${p.name} is playing today`} size="sm" checked onChange={() => undefined} />
                <div className="pname">
                  {p.name}
                  <small>#{p.num}</small>
                </div>
                <div className="qchips">
                  {p.periods.map((code, i) => (
                    <div key={i} className="qcell">
                      <span className="qlab">Q{i + 1}</span>
                      <button
                        type="button"
                        className={`qchip ${code ? 'on' : 'empty'}${p.auto?.includes(i) ? ' auto' : ''}`}
                        style={code ? { background: GROUP_COLOR[code], color: '#fff' } : undefined}
                        aria-label={`${p.name}, Quarter ${i + 1}: ${code || 'sitting out'}`}
                      >
                        {code || '–'}
                      </button>
                    </div>
                  ))}
                </div>
                <div className={`total ${p.total >= 4 ? 'warn' : p.total < 2 ? 'low' : 'good'}`}>
                  {p.total}
                </div>
              </div>
            ))}
            <div className="prow out">
              <Switch label="Milo is out" size="sm" checked={false} onChange={() => undefined} />
              <div className="pname">
                Milo<small>#9</small>
              </div>
            </div>
          </Group>
          <Section>Balance</Section>
          <Group>
            <div className="balance">
              <p>
                Range <b>2–3</b> quarters · average <b>2.8</b>
              </p>
              <div className="meter">
                <i style={{ width: '67%' }} />
              </div>
              <p>Playing time is reasonably balanced.</p>
            </div>
          </Group>

          <Section>Roster & batting rows</Section>
          <Group>
            <div className="prow">
              <input
                className="numin"
                defaultValue="7"
                placeholder="#"
                inputMode="numeric"
                maxLength={3}
                aria-label="Jersey number"
              />
              <input
                className="name"
                defaultValue="Quincy"
                placeholder="Player name"
                aria-label="Player name"
              />
              <Switch label="Active" size="md" checked onChange={() => undefined} />
              <button type="button" className="rm" aria-label="Remove player" onClick={askRemove} />
            </div>
            <div className="prow next">
              <div className="num">1</div>
              <button type="button" className="bat">
                Mason <Tag up>UP NEXT</Tag>
              </button>
              <div className="updown">
                <button type="button" aria-label="Move up" disabled>
                  <ChevronUpIcon />
                </button>
                <button type="button" aria-label="Move down">
                  <ChevronDownIcon />
                </button>
              </div>
            </div>
            <div className="prow last onfield">
              <div className="num">2</div>
              <button type="button" className="bat">
                Owen <Tag>LAST</Tag>
              </button>
            </div>
          </Group>

          <Section>Sheets & toast</Section>
          <Group>
            <Row label="Action sheet (destructive)" chevron onClick={askRemove} />
            <Row label="Info sheet (OK only)" chevron onClick={askInfo} />
            <Row label="Form sheet" chevron onClick={() => setFormOpen(true)} />
            <Row label="Toast" chevron onClick={() => toast('Goal! Q2 · Nolan')} />
            <Row label="Last sheet result" value={sheetResult} />
          </Group>
          <Footer>Sheets trap focus, close on Escape or backdrop tap, and return focus to the opener.</Footer>

          <Section>Inline inputs</Section>
          <Group>
            <Row label="Opponent">
              <input className="inline" defaultValue="Mini Tyler's" aria-label="Opponent" />
            </Row>
            <Row label="Date">
              <input className="inline" type="date" defaultValue="2026-11-09" aria-label="Date" />
            </Row>
            <Row label="Jersey color">
              <span className="val">#7B3FE4</span>
              <span className="swatch" style={{ background: '#7b3fe4' }}>
                <input type="color" defaultValue="#7b3fe4" aria-label="Strikers jersey color" />
              </span>
            </Row>
          </Group>

          <Section>Field pieces (CSS only, engine arrives in Phase 2)</Section>
          <Group>
            <div className="qhead">
              <div className="qleft">
                <h2>Q1</h2>
                <OpenPill open={1} />
              </div>
              <div className="qright">
                <div className="sel">
                  <select aria-label="Formation for Quarter 1" defaultValue="3-3">
                    <option>2-3-1</option>
                    <option>3-3</option>
                    <option>3-2-1</option>
                  </select>
                </div>
                <button type="button" className="score live" aria-label="Score 3 to 1">
                  <small>US</small>
                  <b>3</b>
                  <i aria-hidden="true">–</i>
                  <b>1</b>
                  <small>THEM</small>
                </button>
              </div>
            </div>
            <div className="bench">
              <span className="opencount">1 open</span>
              <strong>Sitting out · 3</strong>
              <div className="names">Sam · Milo · Quincy · Out: Hal</div>
              <Button size="sm" variant="tinted">
                Auto-fill
              </Button>
            </div>
          </Group>

          <div style={{ height: 40 }} />
        </Page>
      </main>

      <FormSheet open={formOpen} onClose={() => setFormOpen(false)} title="New game">
        <Field label="Opponent">
          <TextInput
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="Opponent"
            maxLength={40}
            data-autofocus=""
          />
        </Field>
        <Field label="Date">
          <TextInput type="date" defaultValue="2026-11-09" />
        </Field>
        <FieldGroup label="Quarter">
          <Segmented<'1' | '2' | '3' | '4'>
            label="Quarter"
            value={period}
            onChange={setPeriod}
            options={[
              { value: '1', label: 'Q1' },
              { value: '2', label: 'Q2' },
              { value: '3', label: 'Q3' },
              { value: '4', label: 'Q4' },
            ]}
          />
        </FieldGroup>
        <Field label="Scorer">
          <Select defaultValue="">
            <option value="">Unknown / not recorded</option>
            <option value="1">#1 Nolan</option>
            <option value="2">#2 Teddy</option>
          </Select>
        </Field>
        <Button
          onClick={() => {
            setFormOpen(false);
            toast(`Game on · vs ${opponent || 'Opponent'}`);
          }}
        >
          Start game now
        </Button>
        <Button variant="gray" onClick={() => setFormOpen(false)}>
          Save for later
        </Button>
      </FormSheet>
    </>
  );
}
