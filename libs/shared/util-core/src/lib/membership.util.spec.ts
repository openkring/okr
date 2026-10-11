import { describe, expect, it } from 'vitest';
import { isActiveMembership, isChatOnlyMembership } from './membership.util';

const TODAY = '20260812';

describe('isActiveMembership', () => {
  it('is active when dateOfExit is empty', () => {
    expect(isActiveMembership({ dateOfExit: '' }, TODAY)).toBe(true);
  });

  it('is active for the open-end sentinel', () => {
    expect(isActiveMembership({ dateOfExit: '99991231' }, TODAY)).toBe(true);
  });

  it('is STILL ACTIVE for a future exit date (the bug this fixes)', () => {
    expect(isActiveMembership({ dateOfExit: '20261231' }, TODAY)).toBe(true);
  });

  it('is inactive on the day after the exit date', () => {
    expect(isActiveMembership({ dateOfExit: '20260811' }, TODAY)).toBe(false);
  });

  it('is inactive on the exit date itself (membership runs to end of that day)', () => {
    expect(isActiveMembership({ dateOfExit: TODAY }, TODAY)).toBe(false);
  });

  it('is inactive when archived, whatever the date', () => {
    expect(isActiveMembership({ dateOfExit: '', isArchived: true }, TODAY)).toBe(false);
    expect(isActiveMembership({ dateOfExit: '99991231', isArchived: true }, TODAY)).toBe(false);
  });

  it('is inactive for undefined', () => {
    expect(isActiveMembership(undefined, TODAY)).toBe(false);
  });

  it('treats a missing dateOfExit as never-ended', () => {
    expect(isActiveMembership({}, TODAY)).toBe(true);
  });
});

describe('isChatOnlyMembership', () => {
  const groups = new Map<string, { kind?: string }>([
    ['scs_vorstand', {}], ['scs_jugend', { kind: 'group' }], ['scs_p_abc123', { kind: 'pinboard' }], ['scs_c_xyz789', { kind: 'chat' }],
    ['scs_x_q1', { kind: 'pinboard' }],
  ]);
  const getGroup = (key: string) => groups.get(key);
  const g = (orgKey: string) => ({ orgKey, orgModelType: 'group' });

  it('keeps a membership in a regular group (kind missing or group)', () => {
    expect(isChatOnlyMembership(g('scs_vorstand'), getGroup)).toBe(false);
    expect(isChatOnlyMembership(g('scs_jugend'), getGroup)).toBe(false);
  });
  it('flags a pinboard or ad-hoc chat membership by kind', () => {
    expect(isChatOnlyMembership(g('scs_p_abc123'), getGroup)).toBe(true);
    expect(isChatOnlyMembership(g('scs_c_xyz789'), getGroup)).toBe(true);
    expect(isChatOnlyMembership(g('scs_x_q1'), getGroup)).toBe(true);
  });
  it('falls back to the key pattern for an unknown group', () => {
    expect(isChatOnlyMembership(g('kring_p_abc123'), getGroup)).toBe(true);
    expect(isChatOnlyMembership(g('kring_c_abc123'), getGroup)).toBe(true);
    expect(isChatOnlyMembership(g('kring_vorstand'), getGroup)).toBe(false);
  });
  it('the kind of a known group wins over the key pattern', () => {
    const known = (key: string) => (key === 'scs_c_old' ? { kind: 'group' } : undefined);
    expect(isChatOnlyMembership(g('scs_c_old'), known)).toBe(false);
  });
  it('never flags org memberships or missing input', () => {
    expect(isChatOnlyMembership({ orgKey: 'scs_p_abc123', orgModelType: 'org' }, getGroup)).toBe(false);
    expect(isChatOnlyMembership(undefined, getGroup)).toBe(false);
    expect(isChatOnlyMembership({ orgModelType: 'group' }, getGroup)).toBe(false);
  });
});
