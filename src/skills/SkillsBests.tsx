import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Row } from '@/components/List';
import { useCurrentTeam } from '@/teams/TeamContext';
import { useSkillResults, useSkillTests } from './api';
import { bestOf, defaultFor, fmtResult, mainSide, type SkillResult, sortResults } from './defaults';
import { Sparkline } from './Sparkline';

/**
 * One row per shown test: name, personal best, latest, a trend sparkline. Shared by the player
 * page and the parent home (D53). RLS already limits a parent to their own children's results.
 */
export function SkillsBests({ playerId }: { playerId: string }) {
  const { teamId, sport } = useCurrentTeam();
  const navigate = useNavigate();
  const tests = useSkillTests(teamId);
  const results = useSkillResults(teamId, [playerId]);
  const shown = useMemo(() => (tests.data ?? []).filter((t) => t.is_active), [tests.data]);
  const byTest = useMemo(() => {
    const m = new Map<string, SkillResult[]>();
    for (const r of sortResults(results.data ?? [])) {
      const list = m.get(r.skill_test_id) ?? [];
      list.push(r);
      m.set(r.skill_test_id, list);
    }
    return m;
  }, [results.data]);

  if (shown.length === 0) return <div className="empty">No tests shown.</div>;
  return (
    <>
      {shown.map((t) => {
        const all = byTest.get(t.id) ?? [];
        const list = mainSide(t, all);
        const best = bestOf(t, list);
        const last = all[all.length - 1];
        const draft = defaultFor(sport, t.key)?.draft;
        let detail: string;
        if (!all.length) detail = 'No results yet';
        else if (t.has_sides) {
          const r = bestOf(
            t,
            all.filter((x) => x.side === 'right'),
          );
          const l = bestOf(
            t,
            all.filter((x) => x.side === 'left'),
          );
          detail = `Best ${fmtResult(t, r)} · ${fmtResult(t, l)} · last ${fmtShort(last?.tested_on)}`;
        } else
          detail = `Best ${fmtResult(t, best)} · latest ${fmtResult(t, last)} · ${fmtShort(last?.tested_on)}`;
        const isPb = !!best && list.length > 1 && best.id === list[list.length - 1]?.id;
        return (
          <Row
            key={t.id}
            onClick={() => void navigate(`/players/${playerId}/skills/${t.id}`)}
            label={
              <>
                {t.name}
                {draft && <span className="chip draft">DRAFT</span>}
              </>
            }
            detail={detail}
            chevron
          >
            <Sparkline test={t} results={list} />
            <span className="best">
              {fmtResult(t, best, false)}
              {isPb && <small> PB</small>}
            </span>
          </Row>
        );
      })}
    </>
  );
}

function fmtShort(s: string | undefined): string {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
