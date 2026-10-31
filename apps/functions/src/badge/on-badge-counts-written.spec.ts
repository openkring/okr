import { describe, expect, it } from 'vitest';
import { badgeOnlyMessage, iosTokensOf } from './on-badge-counts-written';

describe('badgeOnlyMessage', () => {
  it('has exactly token + apns, no data, notification or android', () => {
    const m = badgeOnlyMessage('tok', 3);
    expect(Object.keys(m).sort()).toEqual(['apns', 'token']);
    expect(m).toEqual({
      token: 'tok',
      apns: { headers: { 'apns-priority': '5', 'apns-push-type': 'alert' }, payload: { aps: { badge: 3 } } },
    });
  });
  it('carries a badge of 0', () => {
    expect(badgeOnlyMessage('t', 0).apns?.payload?.aps.badge).toBe(0);
  });
});

describe('iosTokensOf', () => {
  it('keeps platform ios only; no field is dropped', () => {
    const out = iosTokensOf([
      { docId: 'a', token: 'ta', platform: 'ios' },
      { docId: 'b', token: 'tb', platform: 'android' },
      { docId: 'c', token: 'tc', platform: 'web' },
      { docId: 'd', token: 'td' },
      { docId: 'e', token: '', platform: 'ios' },
    ]);
    expect(out).toEqual([{ docId: 'a', token: 'ta', platform: 'ios' }]);
  });
});
