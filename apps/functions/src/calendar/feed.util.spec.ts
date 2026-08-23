import { describe, expect, it } from 'vitest';
import { computeWindow, filterMyFeed, isPersonalEvent, resolveListId, toPartstat } from './feed.util';

describe('computeWindow', () => {
  it('spans 3 months back and 12 months forward', () => {
    expect(computeWindow('20260823')).toEqual({ from: '20260523', to: '20270823' });
  });

  it('handles a year boundary', () => {
    expect(computeWindow('20260115')).toEqual({ from: '20251015', to: '20270115' });
  });
});

describe('isPersonalEvent', () => {
  it('is true exactly when the event belongs to no calendar', () => {
    expect(isPersonalEvent({ okey: 'a', calendars: [] })).toBe(true);
    expect(isPersonalEvent({ okey: 'a' })).toBe(true);
    expect(isPersonalEvent({ okey: 'a', calendars: ['scs'] })).toBe(false);
  });
});

describe('filterMyFeed', () => {
  const p = { allowedCalendarKeys: ['scs', 'g1'], personKey: 'p1', invitedEventKeys: ['e3'] };

  it('keeps events of calendars the user belongs to', () => {
    const out = filterMyFeed([{ okey: 'e1', calendars: ['scs'] }], p);
    expect(out.map(e => e.okey)).toEqual(['e1']);
  });

  it('drops events of calendars the user does not belong to', () => {
    expect(filterMyFeed([{ okey: 'e2', calendars: ['srv'] }], p)).toEqual([]);
  });

  it('keeps a personal event where the user is organiser', () => {
    const out = filterMyFeed([{ okey: 'e4', calendars: [], responsiblePersons: [{ key: 'p1' }] }], p);
    expect(out.map(e => e.okey)).toEqual(['e4']);
  });

  it('keeps a personal event where the user is invited', () => {
    expect(filterMyFeed([{ okey: 'e3', calendars: [] }], p).map(e => e.okey)).toEqual(['e3']);
  });

  it('drops a foreign personal event', () => {
    expect(filterMyFeed([{ okey: 'e5', calendars: [], responsiblePersons: [{ key: 'p9' }] }], p)).toEqual([]);
  });
});

describe('resolveListId', () => {
  it('is always my for the personal feed', () => {
    expect(resolveListId({ okey: 'e1', calendars: ['scs'] }, 'my', [])).toBe('my');
  });

  it('is the requested calendar for a calendar feed', () => {
    expect(resolveListId({ okey: 'e1', calendars: ['scs'] }, 'calendar', ['scs'])).toBe('scs');
  });

  it('picks the event own calendar when several were requested', () => {
    expect(resolveListId({ okey: 'e1', calendars: ['srv'] }, 'calendar', ['scs', 'srv'])).toBe('srv');
  });
});

describe('toPartstat', () => {
  it('maps every InvitationState', () => {
    expect(toPartstat('accepted')).toBe('ACCEPTED');
    expect(toPartstat('declined')).toBe('DECLINED');
    expect(toPartstat('maybe')).toBe('TENTATIVE');
    expect(toPartstat('pending')).toBe('NEEDS-ACTION');
  });

  it('is undefined when there is no invitation', () => {
    expect(toPartstat(undefined)).toBeUndefined();
  });
});
