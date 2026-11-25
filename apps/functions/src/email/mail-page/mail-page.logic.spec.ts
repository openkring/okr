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
  const now = '2026-11-09T10:00:00.000Z';
  it('true at 8 days', () => expect(isReapableDraft(page(), now)).toBe(true));
  it('false at 6 days', () => expect(isReapableDraft(page({ createdAt: '2026-11-03T10:00:00.000Z' }), now)).toBe(false));
  it('false when sent', () => expect(isReapableDraft(page({ mailingKey: 'm1' }), now)).toBe(false));
});
