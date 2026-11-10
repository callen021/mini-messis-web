import { Navigate } from 'react-router';
import { useCurrentTeam } from '@/teams/TeamContext';

/** "/" lands parents on their child's tab and staff on the field (D53). */
export function LandingRedirect() {
  const { role } = useCurrentTeam();
  return <Navigate to={role === 'parent' ? '/home' : '/field'} replace />;
}
