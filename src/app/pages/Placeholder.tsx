import { Footer, Group, Row, Section } from '@/components/List';
import { Page } from '@/components/Page';

/** Stand-in for a screen that arrives in a later phase. */
export function Placeholder({ title, phase }: { title: string; phase: number }) {
  return (
    <Page title={title} sub={`Coming in Phase ${phase}`}>
      <Section>Status</Section>
      <Group>
        <Row label="Not built yet" detail={`This screen is scheduled for Phase ${phase} of the rebuild.`} />
      </Group>
      <Footer>
        The design system is ready; see <code>/dev/components</code> in a dev build.
      </Footer>
    </Page>
  );
}
