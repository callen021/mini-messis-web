import { isRouteErrorResponse, useRouteError } from 'react-router';
import { errorMessage } from '@/lib/errors';
import { Footer, Group, Row } from '@/components/List';
import { Page } from '@/components/Page';

/** Router-level error boundary. Full error boundaries with retry arrive in Phase 8. */
export function RouteError() {
  const err = useRouteError();
  const message = isRouteErrorResponse(err) ? `${err.status} ${err.statusText}` : errorMessage(err);
  return (
    <main className="app-main">
      <Page title="Something went wrong" sub={message}>
        <Group>
          <Row onClick={() => window.location.reload()} label="Reload" link chevron />
          <Row to="/field" label="Go to the Field" link chevron />
        </Group>
        <Footer>
          If this keeps happening, your data is safe on the server; reloading usually clears it.
        </Footer>
      </Page>
    </main>
  );
}
