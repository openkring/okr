import { describe, expect, it } from 'vitest';

import type { PublicCourseDate } from '@okr/shared-util-core';

import { formatCourseDateLine, isPastCourseDate, todayIso } from './course-section.util';

const base: PublicCourseDate = { date: '2027-04-03', endDate: '2027-04-03', startTime: '', endTime: '', isCancelled: false };

describe('formatCourseDateLine', () => {
  it('timed date (de)', () => {
    expect(formatCourseDateLine({ ...base, startTime: '10:00', endTime: '12:00' }, 'de')).toBe('Sa, 03.04.2027, 10:00 – 12:00 Uhr');
  });
  it('timed date with a title', () => {
    expect(formatCourseDateLine({ ...base, startTime: '10:00', endTime: '12:00', title: 'Reservetermin' }, 'de'))
      .toBe('Sa, 03.04.2027, 10:00 – 12:00 Uhr · Reservetermin');
  });
  it('full day', () => {
    expect(formatCourseDateLine(base, 'de')).toBe('Sa, 03.04.2027');
  });
  it('multi-day full day', () => {
    expect(formatCourseDateLine({ ...base, endDate: '2027-04-05' }, 'de')).toBe('Sa, 03.04. – Mo, 05.04.2027');
  });
  it('only de gets the Uhr suffix', () => {
    const line = formatCourseDateLine({ ...base, startTime: '10:00', endTime: '12:00' }, 'en');
    expect(line).toContain('10:00 – 12:00');
    expect(line).not.toContain('Uhr');
  });
});

describe('isPastCourseDate', () => {
  it('yesterday is past, today is not', () => {
    expect(isPastCourseDate(base, '2027-04-04')).toBe(true);
    expect(isPastCourseDate(base, '2027-04-03')).toBe(false);
  });
  it('multi-day ending today or later is not past', () => {
    const d = { ...base, endDate: '2027-04-05' };
    expect(isPastCourseDate(d, '2027-04-05')).toBe(false);
    expect(isPastCourseDate(d, '2027-04-06')).toBe(true);
  });
});

describe('todayIso', () => {
  it('zero-pads month and day', () => {
    expect(todayIso(new Date(2027, 0, 5, 23, 59))).toBe('2027-01-05');
  });
});
