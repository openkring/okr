import { describe, expect, it } from 'vitest';
import type { ApplicationKind } from '@okr/shared-models';
import {
  filterCoursesByAudience,
  parseAudienceParam,
  resolveCoursePreselect,
  toPublicCourse,
  toPublicCourseDates,
  type PublicCourseDate,
} from './public-course.util';

describe('toPublicCourseDates', () => {
  it('drops archived, proposed and provisional; keeps definitive, cancelled and stateless', () => {
    const out = toPublicCourseDates(
      [
        { startDate: '20270401', startTime: '10:00', isArchived: true },
        { startDate: '20270402', startTime: '10:00', state: 'proposed' },
        { startDate: '20270403', startTime: '10:00', state: 'provisional' },
        { startDate: '20270404', startTime: '10:00', state: 'definitive' },
        { startDate: '20270405', startTime: '10:00', state: 'cancelled' },
        { startDate: '20270406', startTime: '10:00' },
      ],
      'Kurs',
    );
    expect(out.map((d) => d.date)).toEqual(['2027-04-04', '2027-04-05', '2027-04-06']);
  });

  it('sorts by date then time', () => {
    const out = toPublicCourseDates(
      [
        { startDate: '20270410', startTime: '10:00' },
        { startDate: '20270403', startTime: '18:00' },
        { startDate: '20270403', startTime: '10:00' },
      ],
      'Kurs',
    );
    expect(out.map((d) => `${d.date} ${d.startTime}`)).toEqual(['2027-04-03 10:00', '2027-04-03 18:00', '2027-04-10 10:00']);
  });

  it('computes endTime from duration and omits a title equal to the course name', () => {
    const [d] = toPublicCourseDates(
      [{ startDate: '20270403', startTime: '10:00', durationMinutes: 120, name: ' ruderkurs Jugendliche ' }],
      'Ruderkurs Jugendliche',
    );
    expect(d).toEqual({ date: '2027-04-03', endDate: '2027-04-03', startTime: '10:00', endTime: '12:00', isCancelled: false });
    expect('title' in d).toBe(false);
  });

  it('defaults a missing duration to 60 minutes', () => {
    const [d] = toPublicCourseDates([{ startDate: '20270403', startTime: '10:00' }], 'Kurs');
    expect(d.endTime).toBe('11:00');
  });

  it('keeps a differing name as title', () => {
    const [d] = toPublicCourseDates([{ startDate: '20270403', startTime: '10:00', name: 'Reservetermin' }], 'Kurs');
    expect(d.title).toBe('Reservetermin');
  });

  it('full-day events have empty times and an end date', () => {
    const [d] = toPublicCourseDates([{ startDate: '20270403', endDate: '20270405', fullDay: true, startTime: '10:00' }], 'Kurs');
    expect(d.startTime).toBe('');
    expect(d.endTime).toBe('');
    expect(d.endDate).toBe('2027-04-05');
  });

  it('full-day with an end date earlier than the start falls back to the start date', () => {
    const [d] = toPublicCourseDates([{ startDate: '20270405', endDate: '20270403', fullDay: true }], 'Kurs');
    expect(d.endDate).toBe('2027-04-05');
  });

  it('a non-full-day event ignores its end date', () => {
    const [d] = toPublicCourseDates([{ startDate: '20270403', endDate: '20270405', startTime: '10:00' }], 'Kurs');
    expect(d.endDate).toBe('2027-04-03');
  });

  it('sorts a full-day event with a stale startTime as if it had no time', () => {
    const out = toPublicCourseDates(
      [
        { startDate: '20270403', startTime: '09:00', name: 'timed' },
        { startDate: '20270403', fullDay: true, startTime: '18:00', name: 'fullday' },
      ],
      'Kurs',
    );
    expect(out.map((d) => d.title)).toEqual(['fullday', 'timed']);
  });

  it('empty startTime yields empty times', () => {
    const [d] = toPublicCourseDates([{ startDate: '20270403', startTime: '' }], 'Kurs');
    expect(d.startTime).toBe('');
    expect(d.endTime).toBe('');
  });

  it('marks cancelled events', () => {
    const [d] = toPublicCourseDates([{ startDate: '20270403', startTime: '10:00', state: 'cancelled' }], 'Kurs');
    expect(d.isCancelled).toBe(true);
  });

  it('exposes exactly the PublicCourseDate keys', () => {
    const [d] = toPublicCourseDates(
      [{ startDate: '20270403', startTime: '10:00', name: 'X', description: 'secret', attendees: [] } as never],
      'Kurs',
    );
    const keys: (keyof PublicCourseDate)[] = ['date', 'endDate', 'startTime', 'endTime', 'title', 'isCancelled'];
    expect(Object.keys(d).sort()).toEqual([...keys].sort());
  });
});

describe('parseAudienceParam', () => {
  it('parses, drops unknown values and duplicates', () => {
    expect(parseAudienceParam('youth,foo,youth, adult')).toEqual(['youth', 'adult']);
  });
  it('returns [] for undefined and non-strings', () => {
    expect(parseAudienceParam(undefined)).toEqual([]);
    expect(parseAudienceParam(42)).toEqual([]);
  });
});

describe('filterCoursesByAudience', () => {
  const list: { audience: ApplicationKind[] }[] = [{ audience: ['youth', 'transfer'] }, { audience: ['adult'] }];
  it('returns all for []', () => {
    expect(filterCoursesByAudience(list, [])).toEqual(list);
  });
  it('filters by overlap', () => {
    expect(filterCoursesByAudience(list, ['youth'])).toEqual([list[0]]);
  });
});

describe('toPublicCourse', () => {
  it('converts dates to ISO and keeps remaining -1', () => {
    const c = toPublicCourse(
      { key: 'k', name: 'Kurs', startDate: '20270403', endDate: '20270410', audience: ['youth'], remaining: -1, isFull: false },
      [{ startDate: '20270403', startTime: '10:00' }],
    );
    expect(c.startDate).toBe('2027-04-03');
    expect(c.endDate).toBe('2027-04-10');
    expect(c.remaining).toBe(-1);
    expect(c.dates).toHaveLength(1);
  });
});

describe('resolveCoursePreselect', () => {
  const offered = [
    { key: 'a', name: 'A', startDate: '', endDate: '', audience: ['youth'] as ApplicationKind[], remaining: 3, isFull: false },
    { key: 'full', name: 'F', startDate: '', endDate: '', audience: ['youth'] as ApplicationKind[], remaining: 0, isFull: true },
  ];

  it('drops an empty request', () => {
    expect(resolveCoursePreselect('', offered)).toBe('drop');
  });
  it('ticks an offered course with places', () => {
    expect(resolveCoursePreselect('a', offered)).toBe('tick');
  });
  it('drops an offered course that is full', () => {
    expect(resolveCoursePreselect('full', offered)).toBe('drop');
  });
  it('waits for a course not (yet) offered', () => {
    expect(resolveCoursePreselect('other', offered)).toBe('wait');
    expect(resolveCoursePreselect('a', [])).toBe('wait');
  });
});
