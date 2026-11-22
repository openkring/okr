import { describe, expect, it } from 'vitest';

import type { CalEventModel, MailPageModel } from '@okr/shared-models';

import { isReapableDraft, mailPageRefusal, upcomingEventLines } from './mail-page.logic';

function page(extra: Partial<MailPageModel> = {}): MailPageModel {
  return { tenants: ['scs'], senderUid: 'u1', createdAt: '2026-11-01T10:00:00.000Z', ...extra } as MailPageModel;
}

function ev(name: string, startDate: string, startTime = '1900', extra: Partial<CalEventModel> = {}): CalEventModel {
  return { name, startDate, startTime, isArchived: false, locations: [], ...extra } as CalEventModel;
}

describe('mailPageRefusal', () => {
  const caller = { tenantId: 'scs', uid: 'u1' };
  it('not-found when there is no page', () => expect(mailPageRefusal(undefined, caller)).toBe('not-found'));
  it('foreign for another tenant', () => expect(mailPageRefusal(page({ tenants: ['bka'] }), caller)).toBe('foreign'));
  it('foreign for another sender', () => expect(mailPageRefusal(page({ senderUid: 'u2' }), caller)).toBe('foreign'));
  it('sent once a mailing exists', () => expect(mailPageRefusal(page({ mailingKey: 'm1' }), caller)).toBe('sent'));
  it('undefined for an own draft', () => expect(mailPageRefusal(page(), caller)).toBeUndefined());
});

describe('upcomingEventLines', () => {
  it('drops past and archived events, sorts, caps and formats', () => {
    const lines = upcomingEventLines(
      [
        ev('C', '20261206', '1000'),
        ev('past', '20261101'),
        ev('arch', '20261204', '1000', { isArchived: true }),
        ev('B', '20261204', '2000', { locations: [{ label: 'Clubhaus' }] as never }),
        ev('A', '20261204', '0900'),
      ],
      '20261122',
      2,
    );
    expect(lines.map((l) => l.title)).toEqual(['A', 'B']);
    expect(lines[0]).toMatchObject({ date: '04.12.2026', time: '09:00', place: '' });
    expect(lines[1].place).toBe('Clubhaus');
  });
  it('keeps an event of today', () => {
    expect(upcomingEventLines([ev('t', '20261122')], '20261122', 5)).toHaveLength(1);
  });
});

describe('isReapableDraft', () => {
  const now = '2026-11-09T10:00:00.000Z';
  it('true at 8 days', () => expect(isReapableDraft(page(), now)).toBe(true));
  it('false at 6 days', () => expect(isReapableDraft(page({ createdAt: '2026-11-03T10:00:00.000Z' }), now)).toBe(false));
  it('false when sent', () => expect(isReapableDraft(page({ mailingKey: 'm1' }), now)).toBe(false));
});
