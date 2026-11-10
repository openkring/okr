import { describe, expect, it } from 'vitest';

import { countUsers, lastDayOfPreviousMonth } from './measure.logic';

const u = (roles: Record<string, boolean>, extra: Record<string, unknown> = {}) => ({ roles, ...extra });

describe('countUsers', () => {
  it('weights privileged users double (3 normal + 1 admin)', () => {
    const users = [u({ registered: true }), u({ registered: true }), u({ registered: true }), u({ admin: true })];
    expect(countUsers(users, '20261130')).toEqual({ totalUsers: 4, privilegedUsers: 1, excludedUsers: 0, weighted: 5 });
  });
  it('excludes archived and disabled users', () => {
    const users = [u({ registered: true }), u({ registered: true }, { isArchived: true }), u({ registered: true }, { disabled: true })];
    expect(countUsers(users, '20261130').totalUsers).toBe(1);
  });
  it('counts a user with two privileged roles once as privileged', () => {
    const r = countUsers([u({ admin: true, treasurer: true })], '20261130');
    expect(r).toEqual({ totalUsers: 1, privilegedUsers: 1, excludedUsers: 0, weighted: 2 });
  });
  it('excludes kiosk-only and tester+registered accounts', () => {
    const r = countUsers([u({ kiosk: true }), u({ tester: true, registered: true }), u({ registered: true })], '20261130');
    expect(r).toEqual({ totalUsers: 1, privilegedUsers: 0, excludedUsers: 2, weighted: 1 });
  });
  it('counts kiosk + admin and tester + contentAdmin as privileged (no bypass)', () => {
    const r = countUsers([u({ kiosk: true, admin: true }), u({ tester: true, contentAdmin: true })], '20261130');
    expect(r).toEqual({ totalUsers: 2, privilegedUsers: 2, excludedUsers: 0, weighted: 4 });
  });
  it('ignores false role flags', () => {
    expect(countUsers([u({ admin: false, registered: true })], '20261130').privilegedUsers).toBe(0);
  });
  it('does not count a user created after lastDay', () => {
    const users = [u({ registered: true }, { createdAt: '20261201' }), u({ registered: true }, { createdAt: '20261130' })];
    expect(countUsers(users, '20261130').totalUsers).toBe(1);
  });
});

describe('lastDayOfPreviousMonth', () => {
  it('handles month and leap boundaries', () => {
    expect(lastDayOfPreviousMonth('20261201')).toBe('20261130');
    expect(lastDayOfPreviousMonth('20260301')).toBe('20260228');
    expect(lastDayOfPreviousMonth('20260115')).toBe('20251231');
  });
});
