import { describe, expect, it } from 'vitest';

import type { MailPageModel } from '@okr/shared-models';

import { isReapableDraft, mailPageRefusal } from './mail-page.logic';

function page(extra: Partial<MailPageModel> = {}): MailPageModel {
  return { tenants: ['scs'], senderUid: 'u1', createdAt: '2026-11-01T10:00:00.000Z', ...extra } as MailPageModel;
}

describe('mailPageRefusal', () => {
  const caller = { tenantId: 'scs', uid: 'u1' };
  it('not-found when there is no page', () => expect(mailPageRefusal(undefined, caller)).toBe('not-found'));
  it('foreign for another tenant', () => expect(mailPageRefusal(page({ tenants: ['bka'] }), caller)).toBe('foreign'));
  it('foreign for another sender', () => expect(mailPageRefusal(page({ senderUid: 'u2' }), caller)).toBe('foreign'));
  it('sent once a mailing exists', () => expect(mailPageRefusal(page({ mailingKey: 'm1' }), caller)).toBe('sent'));
  it('undefined for an own draft', () => expect(mailPageRefusal(page(), caller)).toBeUndefined());
});

describe('isReapableDraft', () => {
  const now = '2026-11-30T10:00:00.000Z';
  const daysAgo = (d: number) => new Date(Date.parse(now) - d * 86_400_000).toISOString();
  it('true at 31 days', () => expect(isReapableDraft(page({ createdAt: daysAgo(31) }), now)).toBe(true));
  it('false at 29 days', () => expect(isReapableDraft(page({ createdAt: daysAgo(29) }), now)).toBe(false));
  it('false at 8 days (the old window)', () => expect(isReapableDraft(page({ createdAt: daysAgo(8) }), now)).toBe(false));
  it('counts from changedAt when later than createdAt', () => {
    expect(isReapableDraft(page({ createdAt: daysAgo(60), changedAt: daysAgo(5) }), now)).toBe(false);
    expect(isReapableDraft(page({ createdAt: daysAgo(60), changedAt: daysAgo(31) }), now)).toBe(true);
  });
  it('ignores a changedAt far in the future: createdAt counts', () => {
    expect(isReapableDraft(page({ createdAt: daysAgo(31), changedAt: '2100-01-01T00:00:00.000Z' }), now)).toBe(true);
    expect(isReapableDraft(page({ createdAt: daysAgo(10), changedAt: '2100-01-01T00:00:00.000Z' }), now)).toBe(false);
  });
  it('counts a changedAt from a clock slightly ahead (within 24 hours)', () => {
    const ahead = new Date(Date.parse(now) + 5 * 60_000).toISOString();
    expect(isReapableDraft(page({ createdAt: daysAgo(31), changedAt: ahead }), now)).toBe(false);
  });
  it('falls back to createdAt when changedAt is malformed', () => {
    expect(isReapableDraft(page({ createdAt: daysAgo(31), changedAt: 'nonsense' }), now)).toBe(true);
    expect(isReapableDraft(page({ createdAt: daysAgo(5), changedAt: 'nonsense' }), now)).toBe(false);
  });
  it('false when createdAt is malformed and changedAt is missing', () => expect(isReapableDraft(page({ createdAt: 'x' }), now)).toBe(false));
  it('false when sent, however old', () => expect(isReapableDraft(page({ createdAt: daysAgo(90), mailingKey: 'm1' }), now)).toBe(false));
  it('honours an explicit days argument', () => expect(isReapableDraft(page({ createdAt: daysAgo(8) }), now, 7)).toBe(true));
});
