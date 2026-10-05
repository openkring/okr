import { describe, expect, it } from 'vitest';

import { ActivityModel, SessionModel } from '@okr/shared-models';

import { getDailyActivityStats, isAuthError, isLoginSuccess } from './activity-stats.util';

function auth(action: string, timestamp: string, payload: string): ActivityModel {
  const a = new ActivityModel('t');
  a.scope = 'auth';
  a.action = action;
  a.timestamp = timestamp;
  a.payload = payload;
  return a;
}

function session(userKey: string, startedAt: string, lastSeenAt: string, endedAt = ''): SessionModel {
  const s = new SessionModel('t');
  s.userKey = userKey;
  s.startedAt = startedAt;
  s.lastSeenAt = lastSeenAt;
  s.endedAt = endedAt;
  s.isActive = !endedAt;
  return s;
}

describe('isLoginSuccess / isAuthError', () => {
  it('classifies the payload markers written by AuthService', () => {
    expect(isLoginSuccess(auth('login', '20261005100000', 'a@b.ch: SUCCESS'))).toBe(true);
    expect(isLoginSuccess(auth('login', '20261005100000', 'LoginWithToken: SUCCESS'))).toBe(true);
    expect(isLoginSuccess(auth('login', '20261005100000', 'a@b.ch: SUCCESS (after password set)'))).toBe(true);
    expect(isLoginSuccess(auth('pwdreset', '20261005100000', 'a@b.ch: SUCCESS'))).toBe(false);
    expect(isLoginSuccess(auth('logout', '20261005100000', 'on url: a@b.ch'))).toBe(false);

    expect(isAuthError(auth('login', '20261005100000', 'a@b.ch: ERROR (wrong-password): x'))).toBe(true);
    expect(isAuthError(auth('pwdreset', '20261005100000', 'a@b.ch: ERROR: x'))).toBe(true);
    expect(isAuthError(auth('login', '20261005100000', 'a@b.ch: SUCCESS'))).toBe(false);
  });

  it('ignores non-auth scopes', () => {
    const a = auth('login', '20261005100000', 'x: SUCCESS');
    a.scope = 'person';
    expect(isLoginSuccess(a)).toBe(false);
    expect(isAuthError(a)).toBe(false);
  });
});

describe('getDailyActivityStats', () => {
  it('returns one row per day, oldest first, ending on the given day', () => {
    const rows = getDailyActivityStats([], [], '20261005', 3);
    expect(rows.map(r => r.day)).toEqual(['20261003', '20261004', '20261005']);
    expect(rows.every(r => r.users === 0 && r.logins === 0 && r.errors === 0 && r.usageMinutes === 0)).toBe(true);
  });

  it('counts logins and errors per day and drops days outside the range', () => {
    const rows = getDailyActivityStats([
      auth('login', '20261005080000', 'a: SUCCESS'),
      auth('login', '20261005090000', 'b: SUCCESS'),
      auth('login', '20261004090000', 'c: ERROR (x): y'),
      auth('pwdreset', '20261004100000', 'c: ERROR: y'),
      auth('login', '20260901090000', 'old: SUCCESS'),
    ], [], '20261005', 2);
    expect(rows).toEqual([
      { day: '20261004', users: 0, logins: 0, errors: 2, usageMinutes: 0 },
      { day: '20261005', users: 0, logins: 2, errors: 0, usageMinutes: 0 },
    ]);
  });

  it('counts distinct signed-in users and ignores anonymous sessions', () => {
    const rows = getDailyActivityStats([], [
      session('u1', '20261005080000', '20261005083000', '20261005083000'),
      session('u1', '20261005150000', '20261005151000', '20261005151000'),
      session('u2', '20261005100000', '20261005101000'),
      session('', '20261005100000', '20261005110000'),
    ], '20261005', 1);
    expect(rows[0].users).toBe(2);
    expect(rows[0].usageMinutes).toBe(30 + 10 + 10);
  });

  it('uses the last heartbeat for a session that never ended', () => {
    const rows = getDailyActivityStats([], [
      session('u1', '20261005080000', '20261005082000'),
    ], '20261005', 1);
    expect(rows[0].usageMinutes).toBe(20);
  });

  it('splits a session across midnight and counts the user on both days', () => {
    const rows = getDailyActivityStats([], [
      session('u1', '20261004233000', '20261005003000', '20261005003000'),
    ], '20261005', 2);
    expect(rows).toEqual([
      { day: '20261004', users: 1, logins: 0, errors: 0, usageMinutes: 30 },
      { day: '20261005', users: 1, logins: 0, errors: 0, usageMinutes: 30 },
    ]);
  });

  it('does not double-count overlapping sessions of the same user (several tabs)', () => {
    const rows = getDailyActivityStats([], [
      session('u1', '20261005080000', '20261005090000', '20261005090000'),
      session('u1', '20261005083000', '20261005093000', '20261005093000'),
    ], '20261005', 1);
    expect(rows[0].usageMinutes).toBe(90);
  });

  it('does not count a session ending exactly at midnight on the next day', () => {
    const rows = getDailyActivityStats([], [
      session('u1', '20261004230000', '20261005000000', '20261005000000'),
    ], '20261005', 2);
    expect(rows.map(r => r.users)).toEqual([1, 0]);
  });

  it('counts a zero-length session (no heartbeat yet) as present', () => {
    const rows = getDailyActivityStats([], [session('u1', '20261005100000', '')], '20261005', 1);
    expect(rows[0].users).toBe(1);
    expect(rows[0].usageMinutes).toBe(0);
  });

  it('ignores sessions with an unparsable start', () => {
    const rows = getDailyActivityStats([], [session('u1', '', '')], '20261005', 1);
    expect(rows[0]).toEqual({ day: '20261005', users: 0, logins: 0, errors: 0, usageMinutes: 0 });
  });
});
