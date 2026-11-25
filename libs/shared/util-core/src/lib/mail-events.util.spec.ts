import { describe, expect, it } from 'vitest';

import type { CalEventModel } from '@okr/shared-models';

import { mailColorOf, upcomingEventLines } from './mail-events.util';

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

describe('mailColorOf', () => {
  it('keeps a #rrggbb colour, lowercased', () => expect(mailColorOf('#014DA2')).toBe('#014da2'));
  it('falls back to dark grey for anything unsafe', () => {
    expect(mailColorOf('red;x')).toBe('#222222');
    expect(mailColorOf('#0af')).toBe('#222222');
    expect(mailColorOf(undefined)).toBe('#222222');
    expect(mailColorOf(42)).toBe('#222222');
  });
});
