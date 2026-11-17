import { describe, expect, it } from 'vitest';

import { timetableConfigOf } from './timetable-config.util';

describe('timetableConfigOf', () => {
  it('fills every new field on a legacy doc', () => {
    expect(timetableConfigOf({ destinationKey: 'd', sourceKey: '' })).toEqual({
      destinationKey: 'd',
      sourceKey: '',
      favoriteDefaultOrg: true,
      favoriteHomeAddress: true,
      favoriteLocationKeys: [],
      anchor: 'departAt',
      allowAddToCalendar: true
    });
  });

  it('keeps explicit false and arriveBy', () => {
    const c = timetableConfigOf({ favoriteHomeAddress: false, anchor: 'arriveBy', allowAddToCalendar: false });
    expect([c.favoriteHomeAddress, c.anchor, c.allowAddToCalendar]).toEqual([false, 'arriveBy', false]);
  });

  it('drops an unknown anchor and a non-array key list', () => {
    const c = timetableConfigOf({ anchor: 'x' as never, favoriteLocationKeys: 'a' as never });
    expect([c.anchor, c.favoriteLocationKeys]).toEqual(['departAt', []]);
  });

  it('accepts undefined', () => {
    expect(timetableConfigOf(undefined).destinationKey).toBe('');
  });
});
