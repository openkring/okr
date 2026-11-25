import { describe, expect, it } from 'vitest';

import type { CalEventModel } from '@okr/shared-models';

import { MAX_MAIL_EVENTS, mailEventLimit, upcomingEventLines } from './mail-events.util';

function ev(name: string, startDate: string, startTime = '1900', extra: Partial<CalEventModel> = {}): CalEventModel {
  return { name, startDate, startTime, isArchived: false, locations: [], ...extra } as CalEventModel;
}

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

describe('mailEventLimit', () => {
  it('a mail lists at most 10', () => expect(MAX_MAIL_EVENTS).toBe(10));
  it('takes the section\'s maxEvents', () => expect(mailEventLimit({ maxEvents: 3 })).toBe(3));
  it('rounds a fraction down', () => expect(mailEventLimit({ maxEvents: 3.7 })).toBe(3));
  it('caps at MAX_MAIL_EVENTS', () => expect(mailEventLimit({ maxEvents: 50 })).toBe(MAX_MAIL_EVENTS));
  it('falls back to the model default (5) without a usable value', () => {
    expect(mailEventLimit(undefined)).toBe(5);
    expect(mailEventLimit({})).toBe(5);
    expect(mailEventLimit({ maxEvents: 0 })).toBe(5);
    expect(mailEventLimit({ maxEvents: -2 })).toBe(5);
    expect(mailEventLimit({ maxEvents: '7' })).toBe(5);
    expect(mailEventLimit({ maxEvents: Number.NaN })).toBe(5);
    expect(mailEventLimit({ maxEvents: Infinity })).toBe(5);
    expect(mailEventLimit('x')).toBe(5);
    expect(mailEventLimit(null)).toBe(5);
  });
});
