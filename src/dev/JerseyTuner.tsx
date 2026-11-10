import { useState } from 'react';
import { Button, Footer, Group, Row, Section } from '@/components';
import { SPORTS } from '@/sports/definitions';
import { type SportKey } from '@/sports/types';
import {
  ROW_COUNTS,
  type RowCount,
  TUNER_MAX,
  TUNER_MIN,
  TUNER_STEP,
  type TunerTable,
  clampWidth,
  currentRule,
  newRule,
  tableFrom,
  tunerSnippet,
} from './tunerModel';

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="range"
      aria-label={label}
      min={TUNER_MIN}
      max={TUNER_MAX}
      step={TUNER_STEP}
      value={value}
      onChange={(e) => onChange(clampWidth(Number(e.target.value)))}
      style={{ width: 150, accentColor: 'var(--tint)' }}
    />
  );
}

const pct = (v: number) => `${v % 1 === 0 ? v : v.toFixed(1)}%`;

/**
 * Dev-only: live jersey-size controls for the field comparison page. One slider moves every row
 * count at once; the table sets a width per widest-row density; the snippet is what the chosen
 * numbers look like as constants.
 */
export function JerseyTuner({
  sport,
  table,
  onChange,
  inUse,
  onCopied,
}: {
  sport: SportKey;
  table: TunerTable;
  onChange: (next: TunerTable) => void;
  /** Widest-row count of each card currently on the page. */
  inUse: number[];
  onCopied: () => void;
}) {
  const rows = table[sport];
  const values = ROW_COUNTS.map((n) => rows[n]);
  const first = values[0] ?? newRule(1);
  const uniform = values.every((v) => v === first);
  const [master, setMaster] = useState<number>(rows[4]);
  const snippet = tunerSnippet(table);

  const setRow = (n: RowCount, v: number) => onChange({ ...table, [sport]: { ...rows, [n]: v } });
  const setAll = (v: number) => {
    setMaster(v);
    onChange({ ...table, [sport]: tableFrom(() => v) });
  };
  const reset = (rule: (n: number) => number) => onChange({ ...table, [sport]: tableFrom(rule) });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      onCopied();
    } catch {
      /* clipboard blocked: the snippet is selectable below */
    }
  };

  return (
    <>
      <Section>Jersey tuner · {SPORTS[sport].name}</Section>
      <Group>
        <Row
          label="All rows"
          detail={uniform ? 'Every row density uses this width' : 'Rows differ · drag to set them all'}
          value={uniform ? pct(first) : 'mixed'}
        >
          <Slider label="Jersey width, all rows" value={uniform ? first : master} onChange={setAll} />
        </Row>
        {ROW_COUNTS.map((n) => {
          const cards = inUse.filter((r) => Math.min(5, Math.max(1, r)) === n).length;
          return (
            <Row
              key={n}
              label={`${n} in a row`}
              detail={cards ? `${cards} card${cards === 1 ? '' : 's'} on this page` : 'not on this page'}
              value={pct(rows[n])}
            >
              <Slider label={`Jersey width, ${n} in a row`} value={rows[n]} onChange={(v) => setRow(n, v)} />
            </Row>
          );
        })}
        <Row label="Reset">
          <div className="toolbar" style={{ margin: 0 }}>
            <Button size="sm" variant="gray" onClick={() => reset(newRule)}>
              New default
            </Button>
            <Button size="sm" variant="gray" onClick={() => reset(currentRule)}>
              Current rule
            </Button>
          </div>
        </Row>
      </Group>
      <Footer>
        Width is a percent of the field in the top-down view and of the stage in 3D, replacing the
        formation&apos;s w and the per-sport 3D factor. New default: min(28, 100/maxRow − 3). Current rule:
        min(24, 100/(maxRow + 1) − 2). Values persist in this browser only.
      </Footer>
      <Section>Snippet · all sports</Section>
      <Group>
        <pre
          style={{
            margin: 0,
            padding: 12,
            fontSize: 11,
            lineHeight: 1.45,
            overflowX: 'auto',
            userSelect: 'all',
          }}
        >
          {snippet}
        </pre>
        <Row label="Copy to clipboard" link onClick={() => void copy()} />
      </Group>
    </>
  );
}
