import { describe, expect, it } from 'vitest';
import { SessionModel } from '@okr/shared-models';
import { getLoggedInUsers, getSessionIndex, getSessionIndexInfo, getSessionStatus, getSessionStatusColor } from './session.util';

function makeSession(partial: Partial<SessionModel>): SessionModel {
  const s = new SessionModel('t1');
  return Object.assign(s, partial);
}

// helper: build a StoreDateTime (yyyyMMddHHmmss) `minutesAgo` before the given nowMs
function sdtMinutesBefore(nowMs: number, minutesAgo: number): string {
  const d = new Date(nowMs - minutesAgo * 60_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

describe('getSessionIndex', () => {
  it('lowercases and joins userEmail, browser, os', () => {
    const s = makeSession({ userEmail: 'Alice@Example.COM', browser: 'safari', os: 'ios' });
    expect(getSessionIndex(s)).toBe('alice@example.com safari ios');
  });

  it('handles an anonymous session (empty email)', () => {
    const s = makeSession({ userEmail: '', browser: 'chrome', os: 'windows' });
    expect(getSessionIndex(s)).toBe('chrome windows');
  });
});

describe('getSessionIndexInfo', () => {
  it('returns the field layout string', () => {
    expect(getSessionIndexInfo()).toBe('e:userEmail b:browser o:os');
  });
});

describe('getSessionStatus', () => {
  const now = new Date(2026, 5, 24, 12, 0, 0).getTime();

  it('returns ended for an inactive session', () => {
    const s = makeSession({ isActive: false, lastSeenAt: sdtMinutesBefore(now, 1) });
    expect(getSessionStatus(s, now)).toBe('ended');
  });

  it('returns active when last seen within 10 minutes', () => {
    const s = makeSession({ isActive: true, lastSeenAt: sdtMinutesBefore(now, 5) });
    expect(getSessionStatus(s, now)).toBe('active');
  });

  it('returns stale when last seen between 10 and 30 minutes', () => {
    const s = makeSession({ isActive: true, lastSeenAt: sdtMinutesBefore(now, 20) });
    expect(getSessionStatus(s, now)).toBe('stale');
  });

  it('returns orphaned when last seen more than 30 minutes ago', () => {
    const s = makeSession({ isActive: true, lastSeenAt: sdtMinutesBefore(now, 45) });
    expect(getSessionStatus(s, now)).toBe('orphaned');
  });
});

describe('getLoggedInUsers', () => {
  const now = new Date(2026, 5, 24, 12, 0, 0).getTime();
  const active = (over: Partial<SessionModel>) =>
    makeSession({ isActive: true, lastSeenAt: sdtMinutesBefore(now, 2), ...over });

  it('returns the users with an active session, sorted by email', () => {
    const sessions = [
      active({ userKey: 'u2', userEmail: 'bob@x.ch', startedAt: sdtMinutesBefore(now, 30) }),
      active({ userKey: 'u1', userEmail: 'alice@x.ch', startedAt: sdtMinutesBefore(now, 60) }),
    ];
    expect(getLoggedInUsers(sessions, now).map(u => u.userEmail)).toEqual(['alice@x.ch', 'bob@x.ch']);
  });

  it('ignores anonymous sessions', () => {
    const sessions = [active({ userKey: '', userEmail: '', startedAt: sdtMinutesBefore(now, 5) })];
    expect(getLoggedInUsers(sessions, now)).toEqual([]);
  });

  it('ignores stale, orphaned and ended sessions', () => {
    const sessions = [
      makeSession({ isActive: true, userKey: 'u1', userEmail: 'stale@x.ch', lastSeenAt: sdtMinutesBefore(now, 20) }),
      makeSession({ isActive: true, userKey: 'u2', userEmail: 'orphan@x.ch', lastSeenAt: sdtMinutesBefore(now, 45) }),
      makeSession({ isActive: false, userKey: 'u3', userEmail: 'ended@x.ch', lastSeenAt: sdtMinutesBefore(now, 1) }),
    ];
    expect(getLoggedInUsers(sessions, now)).toEqual([]);
  });

  it('dedupes a user with several active sessions, keeping the most recent one', () => {
    const recent = sdtMinutesBefore(now, 10);
    const sessions = [
      active({ userKey: 'u1', userEmail: 'alice@x.ch', startedAt: sdtMinutesBefore(now, 90) }),
      active({ userKey: 'u1', userEmail: 'alice@x.ch', startedAt: recent }),
      active({ userKey: 'u1', userEmail: 'alice@x.ch', startedAt: sdtMinutesBefore(now, 50) }),
    ];
    const users = getLoggedInUsers(sessions, now);
    expect(users).toHaveLength(1);
    expect(users[0].startedAt).toBe(recent);
  });

  it('returns an empty array for an empty session list', () => {
    expect(getLoggedInUsers([], now)).toEqual([]);
  });
});

describe('getSessionStatusColor', () => {
  it('maps each status to an Ionic color', () => {
    expect(getSessionStatusColor('active')).toBe('success');
    expect(getSessionStatusColor('stale')).toBe('tertiary');
    expect(getSessionStatusColor('orphaned')).toBe('warning');
    expect(getSessionStatusColor('ended')).toBe('medium');
  });
});
