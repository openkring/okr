import { describe, expect, it } from 'vitest';

import { isPublicCalendar, PUBLIC_CALENDAR, setPublicCalendar } from './public-calendar.util';

describe('setPublicCalendar (spec 1.165 EV5)', () => {
  it('adds public at the end', () => {
    expect(setPublicCalendar(['reparatur'], true)).toEqual(['reparatur', 'public']);
  });

  it('adds it only once', () => {
    expect(setPublicCalendar(['reparatur', 'public'], true)).toEqual(['reparatur', 'public']);
  });

  it('removes it and keeps the other calendars in order', () => {
    expect(setPublicCalendar(['a', 'public', 'b'], false)).toEqual(['a', 'b']);
  });

  it('tolerates a missing list', () => {
    expect(setPublicCalendar(undefined, true)).toEqual(['public']);
    expect(setPublicCalendar(undefined, false)).toEqual([]);
  });

  it('does not change the input array', () => {
    const list = ['a'];
    setPublicCalendar(list, true);
    expect(list).toEqual(['a']);
  });
});

describe('isPublicCalendar', () => {
  it('reads the public calendar', () => {
    expect(isPublicCalendar(['a', PUBLIC_CALENDAR])).toBe(true);
    expect(isPublicCalendar(['a'])).toBe(false);
    expect(isPublicCalendar(undefined)).toBe(false);
  });
});
