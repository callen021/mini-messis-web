import { Group, Row } from '@/components/List';
import { Page } from '@/components/Page';

export function NotFound() {
  return (
    <main className="app-main">
      <Page title="Not found" sub="That page doesn't exist.">
        <Group>
          <Row to="/field" label="Go to the Field" link chevron />
        </Group>
      </Page>
    </main>
  );
}
