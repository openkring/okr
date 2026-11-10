import { describe, expect, it } from 'vitest';

import {
  applicantAge, chunkKeys, CourseApplicantRow, courseHasEnded, courseInviteCountsLine, groupCourseApplicants, inviteResultMessage,
  preselectedApplicantKeys,
} from './course-invite.util';

const row = (key: string, extra: Partial<CourseApplicantRow> = {}): CourseApplicantRow => ({
  key, firstName: `F${key}`, lastName: `L${key}`, applicationAs: 'youth', age: 14, courseKey: '', courseName: '', courseState: '', lockedReason: '', ...extra,
});

describe('groupCourseApplicants (spec 1.152 §8.1)', () => {
  const rows = [
    row('a1'),
    row('a2', { applicationAs: 'adult' }),
    row('a3', { applicationAs: 'adult', courseKey: 'c1', courseState: 'registered' }),
    row('a4', { courseKey: 'c2', courseName: 'Skiff 2', courseState: 'accepted' }),
  ];
  it('puts those on the course first, then the audience, then the rest', () => {
    const groups = groupCourseApplicants(rows, 'c1', ['youth']);
    expect(groups.onCourse.map(r => r.key)).toEqual(['a3']);
    expect(groups.inAudience.map(r => r.key)).toEqual(['a1', 'a4']);
    expect(groups.others.map(r => r.key)).toEqual(['a2']);
  });
  it('a course without audience has everybody not on it under the rest', () => {
    const groups = groupCourseApplicants(rows, 'c1', undefined);
    expect(groups.inAudience).toEqual([]);
    expect(groups.others.map(r => r.key)).toEqual(['a1', 'a2', 'a4']);
  });
});

describe('preselectedApplicantKeys', () => {
  it('ticks only those registered for this very course', () => {
    expect(preselectedApplicantKeys([
      row('a1', { courseKey: 'c1', courseState: 'registered' }),
      row('a2', { courseKey: 'c1', courseState: 'invited' }),
      row('a3', { courseKey: 'c2', courseState: 'registered' }),
    ], 'c1')).toEqual(['a1']);
  });
});

describe('courseInviteCountsLine', () => {
  const labels = { places: '{max} Plätze', unlimited: 'Plätze unbeschränkt', invited: '{n} eingeladen', accepted: '{n} zugesagt' };
  it('«8 Plätze · 5 eingeladen · 2 zugesagt»', () =>
    expect(courseInviteCountsLine({ maxParticipants: 8, invited: 5, accepted: 2 }, labels)).toBe('8 Plätze · 5 eingeladen · 2 zugesagt'));
  it('0 places means unlimited', () =>
    expect(courseInviteCountsLine({ maxParticipants: 0, invited: 0, accepted: 0 }, labels)).toBe('Plätze unbeschränkt · 0 eingeladen · 0 zugesagt'));
});

describe('inviteResultMessage', () => {
  const labels = {
    invited: '{n} eingeladen.', skipped: 'Nicht eingeladen: {list}',
    reasons: {
      'no-email': 'keine E-Mail-Adresse', 'not-found': 'nicht gefunden', closed: 'abgeschlossen', 'on-other-course': 'auf einem anderen Kurs',
      'mail-failed': 'Versand fehlgeschlagen', 'write-failed': 'nicht gespeichert',
    },
  };
  const rows = [row('a1', { firstName: 'Anna', lastName: 'Muster' }), row('a2', { firstName: 'Ben', lastName: 'Beispiel' })];
  it('says how many were invited', () => expect(inviteResultMessage({ invited: 2, skipped: [] }, rows, labels)).toBe('2 eingeladen.'));
  it('names every skipped row with its reason', () =>
    expect(inviteResultMessage({ invited: 0, skipped: [{ key: 'a1', reason: 'no-email' }, { key: 'zz', reason: 'not-found' }] }, rows, labels))
      .toBe('0 eingeladen. Nicht eingeladen: Anna Muster (keine E-Mail-Adresse), zz (nicht gefunden)'));
});

describe('chunkKeys', () => {
  it('splits into slices of at most the given size', () => {
    expect(chunkKeys(['a', 'b', 'c'], 2)).toEqual([['a', 'b'], ['c']]);
    expect(chunkKeys([], 2)).toEqual([]);
  });
});

describe('courseHasEnded', () => {
  it('is over once the last day is before today', () => {
    expect(courseHasEnded({ startDate: '20261101', endDate: '20261130' }, '20261201')).toBe(true);
    expect(courseHasEnded({ startDate: '20261101', endDate: '20261130' }, '20261130')).toBe(false);
  });
  it('falls back to the start date, and a course without dates never ends', () => {
    expect(courseHasEnded({ startDate: '20261101', endDate: '' }, '20261102')).toBe(true);
    expect(courseHasEnded({}, '20261102')).toBe(false);
  });
});

describe('applicantAge', () => {
  it('shows a number only — never «null Jahre»', () => {
    expect(applicantAge({ age: 14 })).toBe(14);
    expect(applicantAge({ age: 0 })).toBe(0);
    expect(applicantAge({ age: null })).toBeUndefined();
    expect(applicantAge({} as { age: number | null })).toBeUndefined();
  });
});
