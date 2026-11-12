import { isRouteErrorResponse, useLocation, useNavigate, useRouteError } from 'react-router';
import { errorMessage } from '@/lib/errors';
import { Footer, Group, Row } from '@/components/List';
import { Page } from '@/components/Page';

/**
 * Error boundary for one tab page: the team switcher and tab bar stay, so the coach can move to
 * another tab or retry this one without losing their place.
 */
export function TabError() {
  const err = useRouteError();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const message = isRouteErrorResponse(err) ? `${err.status} ${err.statusText}` : errorMessage(err);
  return (
    <Page title="This page hit a snag" sub={message}>
      <Group>
        <Row onClick={() => void navigate(pathname, { replace: true })} label="Try again" link chevron />
        <Row onClick={() => window.location.reload()} label="Reload the app" link chevron />
        <Row to="/field" label="Go to the Field" link chevron />
      </Group>
      <Footer>Your data is safe on the server. The other tabs still work.</Footer>
    </Page>
  );
}
