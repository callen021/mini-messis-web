import { useMemo } from 'react';
import { Footer, Group, Row, Section } from '@/components/List';
import { Stepper } from '@/components/Stepper';
import { useToast } from '@/components/Toast';
import { errorMessage } from '@/lib/supabase';
import { useLibraryOverride, useSetLibraryOverride } from './api';
import { DrillDiagram } from './DrillDiagram';
import { cleanOverrides, isOverridden, paramFeet, paramShort, paramText, stepperModel } from './params';
import { type SetupSection } from './types';

/**
 * The Coach Setup tab: the overhead diagram, the numbers under it, how to run it and what to
 * bring. Coaches and assistant coaches change the adjustable numbers for their own team with the
 * steppers; each tap saves, the diagram and labels follow, and "Reset to default" removes the
 * team's changes. The built-in content is never written.
 */
export function SetupTab({
  setup,
  teamId,
  itemId,
  canEdit,
}: {
  setup: SetupSection;
  teamId: string;
  itemId: string;
  canEdit: boolean;
}) {
  const toast = useToast();
  const stored = useLibraryOverride(teamId, itemId);
  const save = useSetLibraryOverride(teamId, itemId);
  const overrides = useMemo(() => cleanOverrides(setup.params, stored.data), [setup.params, stored.data]);
  const changed = Object.keys(overrides).length > 0;
  const write = (next: Record<string, number>, done?: string) =>
    save.mutate(next, {
      onSuccess: () => done && toast(done),
      onError: (e) => toast(errorMessage(e)),
    });

  return (
    <div className="setup">
      {setup.diagram && <DrillDiagram spec={setup.diagram} params={setup.params} overrides={overrides} />}
      {setup.params.length > 0 && (
        <>
          <Group className="setupnums">
            {setup.params.map((def) => {
              const feet = paramFeet(def, overrides);
              if (!canEdit || !def.adjustable)
                return <Row key={def.key} label={def.label} value={paramText(def, overrides)} />;
              const m = stepperModel(def, overrides);
              return (
                <Row
                  key={def.key}
                  label={def.label}
                  detail={
                    [feet, isOverridden(def, overrides) ? 'Changed for your team' : '']
                      .filter(Boolean)
                      .join(' · ') || undefined
                  }
                >
                  <Stepper
                    label={def.label}
                    value={m.value}
                    min={m.min}
                    max={m.max}
                    step={m.step}
                    display={paramShort(def, overrides)}
                    disabled={stored.isPending}
                    onChange={(v) => v !== m.value && write(m.apply(v))}
                  />
                </Row>
              );
            })}
            {canEdit && changed && (
              <Row link label="Reset to default" onClick={() => write({}, 'Back to the default setup')} />
            )}
          </Group>
          <Footer>
            {canEdit
              ? 'Changes here are for your team only.'
              : changed
                ? 'Your coach adjusted this setup for your team.'
                : 'Your coach can adjust this setup for your team.'}
          </Footer>
        </>
      )}
      {setup.goal && (
        <>
          <Section>Goal</Section>
          <div className="libnote">
            <p>{setup.goal}</p>
          </div>
        </>
      )}
      {setup.steps.length > 0 && (
        <>
          <Section>How to run it</Section>
          <ol className="libsteps">
            {setup.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </>
      )}
      {setup.equipment.length > 0 && (
        <>
          <Section>Equipment</Section>
          <ul className="libcues">
            {setup.equipment.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
