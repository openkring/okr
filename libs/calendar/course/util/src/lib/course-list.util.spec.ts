import { describe, expect, it } from 'vitest';

import { AvatarInfo, CourseModel } from '@okr/shared-models';

import { buildCourseListRows, CourseListCsvLabels, formatCoursePeriod } from './course-list.util';

const labels: CourseListCsvLabels = { name: 'Kurs', period: 'Zeitraum', responsible: 'Verantwortliche', trainers: 'Trainer', status: 'Status', locked: 'eingefroren', reported: 'gemeldet' };

function avatar(name1: string, name2: string): AvatarInfo {
  return { key: name1, name1, name2, modelType: 'person', type: '', subType: '', label: '' };
}

function course(over: Partial<CourseModel> = {}): CourseModel {
  return Object.assign(new CourseModel('scs'), { name: 'Herbstkurs', startDate: '20261015', endDate: '20261220' }, over);
}

describe('formatCoursePeriod', () => {
  it('shows a range as two view dates', () => {
    expect(formatCoursePeriod(course())).toBe('15.10.2026 - 20.12.2026');
  });
  it('shows a one-day course once', () => {
    expect(formatCoursePeriod(course({ endDate: '20261015' }))).toBe('15.10.2026');
  });
  it('tolerates a missing end date', () => {
    expect(formatCoursePeriod(course({ endDate: '' }))).toBe('15.10.2026');
  });
});

describe('buildCourseListRows', () => {
  it('writes the header first and one row per course', () => {
    const rows = buildCourseListRows([course({ responsiblePersons: [avatar('Anna', 'Muster')], trainers: [avatar('Beat', 'Beispiel'), avatar('Cleo', 'Test')] })], labels);
    expect(rows[0]).toEqual(['Kurs', 'Zeitraum', 'Verantwortliche', 'Trainer', 'Status']);
    expect(rows[1]).toEqual(['Herbstkurs', '15.10.2026 - 20.12.2026', 'Anna Muster', 'Beat Beispiel, Cleo Test', '']);
  });

  it('names the status words of a frozen and a reported course', () => {
    const rows = buildCourseListRows([course({ isLocked: true }), course({ isLocked: true, reportedAt: '20261221100000' })], labels);
    expect(rows[1][4]).toBe('eingefroren');
    expect(rows[2][4]).toBe('eingefroren, gemeldet');
  });

  it('neutralises a name that starts like a formula', () => {
    expect(buildCourseListRows([course({ name: '=HYPERLINK("x")' })], labels)[1][0]).toBe(`'=HYPERLINK("x")`);
  });

  it('returns only the header for no courses', () => {
    expect(buildCourseListRows([], labels)).toHaveLength(1);
  });
});
