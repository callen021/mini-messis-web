import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { type ActiveMembership, type Team } from '../api';
import { patchTeamCaches } from '../teamCache';

const team = { id: 't1', name: 'Strikers', side_size: 7, join_enabled: true } as Team;
const other = { id: 't2', name: 'Other', side_size: 5, join_enabled: true } as Team;
const member = (t: Team): ActiveMembership => ({
  team: t,
  membership: { id: `m-${t.id}`, team_id: t.id, user_id: 'u1', role: 'coach', status: 'active' } as never,
});

describe('patchTeamCaches (D88)', () => {
  it('patches the team query and every memberships list, and the restore puts both back', () => {
    const qc = new QueryClient();
    qc.setQueryData(['team', 't1'], team);
    qc.setQueryData(['memberships', 'u1'], [member(team), member(other)]);
    qc.setQueryData(['memberships', 'u2'], [member(team)]);
    const restore = patchTeamCaches(qc, 't1', { side_size: 9, join_enabled: false });
    expect(qc.getQueryData<Team>(['team', 't1'])).toMatchObject({ side_size: 9, join_enabled: false });
    const u1 = qc.getQueryData<ActiveMembership[]>(['memberships', 'u1']);
    expect(u1?.[0]?.team.side_size).toBe(9);
    expect(u1?.[1]?.team.side_size).toBe(5); // another team is untouched
    expect(qc.getQueryData<ActiveMembership[]>(['memberships', 'u2'])?.[0]?.team.join_enabled).toBe(false);
    restore();
    expect(qc.getQueryData<Team>(['team', 't1'])).toEqual(team);
    expect(qc.getQueryData<ActiveMembership[]>(['memberships', 'u1'])?.[0]?.team).toEqual(team);
  });

  it('is a no-op (and restore is harmless) when nothing is cached', () => {
    const qc = new QueryClient();
    const restore = patchTeamCaches(qc, 't1', { name: 'x' });
    expect(qc.getQueryData(['team', 't1'])).toBeUndefined();
    restore();
    expect(qc.getQueryData(['team', 't1'])).toBeUndefined();
  });
});
