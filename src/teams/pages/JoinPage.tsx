import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Footer, Group } from '@/components/List';
import { Page } from '@/components/Page';
import { isCompleteCode, normalizeCode } from '@/lib/join-code';
import { useActiveMemberships } from '../api';

/**
 * /join: a code typed by hand. It opens the same screen as the coach's invite link
 * (/join/<code>, D49), so there is one joining flow whichever way the code arrived.
 */
export function JoinPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const memberships = useActiveMemberships(user?.id);
  const [code, setCode] = useState('');
  const hasTeams = (memberships.data?.length ?? 0) > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (isCompleteCode(code)) navigate(`/join/${code}`);
  };

  return (
    <Page
      title="Join a team"
      sub="Enter the 8-character code from your coach"
      back={hasTeams ? { to: '/settings', label: 'Settings' } : { to: '/welcome', label: 'Back' }}
    >
      <Group>
        <form className="form" onSubmit={submit} noValidate>
          <input
            className="input code-input"
            value={code}
            onChange={(e) => setCode(normalizeCode(e.target.value))}
            placeholder="ABCD2345"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            maxLength={8}
            aria-label="Join code"
            data-autofocus=""
          />
          <Button type="submit" disabled={!isCompleteCode(code)}>
            Find team
          </Button>
        </form>
      </Group>
      <Footer>
        The coach’s invite link skips this step. Codes never use the letters I, L, O or U, or the digits 0 and
        1, so there’s nothing to mix up.
      </Footer>
    </Page>
  );
}
