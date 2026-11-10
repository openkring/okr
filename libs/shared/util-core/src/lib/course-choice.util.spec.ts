import { describe, expect, it } from 'vitest';
import type { ApplicationModel, CourseModel } from '@okr/shared-models';
import {
  PublicCourseOption,
  courseChoiceRefusal,
  coursesForAudience,
  defaultIsAnnounced,
  holdsCoursePlace,
  isAnnouncedCourseOpen,
  toCourseOption,
} from './course-choice.util';

const TODAY = '20261110';

const app = (p: Partial<ApplicationModel> = {}): Partial<ApplicationModel> => ({
  courseKey: 'c1', courseState: 'registered', state: 'applied', isArchived: false, ...p,
});

const course = (p: Partial<CourseModel> = {}): Partial<CourseModel> => ({
  tenants: ['scs'], isArchived: false, isAnnounced: true, audience: ['youth'],
  startDate: '20261201', endDate: '20261231', maxParticipants: 0, name: 'Kurs', ...p,
});

const opt = (p: Partial<PublicCourseOption> = {}): PublicCourseOption => ({
  key: 'a', name: 'A', startDate: '20261201', endDate: '20261231', audience: ['youth'], remaining: -1, isFull: false, ...p,
});

describe('defaultIsAnnounced', () => {
  it('is true only for exactly youth', () => {
    expect(defaultIsAnnounced(['youth'])).toBe(true);
    expect(defaultIsAnnounced(['adult'])).toBe(false);
    expect(defaultIsAnnounced(['youth', 'adult'])).toBe(false);
    expect(defaultIsAnnounced([])).toBe(false);
  });
});

describe('holdsCoursePlace', () => {
  it('counts registered, invited and accepted on the key', () => {
    expect(holdsCoursePlace(app({ courseState: 'registered' }), 'c1')).toBe(true);
    expect(holdsCoursePlace(app({ courseState: 'invited' }), 'c1')).toBe(true);
    expect(holdsCoursePlace(app({ courseState: 'accepted' }), 'c1')).toBe(true);
  });
  it('ignores declined, other key, archived, denied, cancelled and raw {}', () => {
    expect(holdsCoursePlace(app({ courseState: 'declined' }), 'c1')).toBe(false);
    expect(holdsCoursePlace(app(), 'other')).toBe(false);
    expect(holdsCoursePlace(app({ isArchived: true }), 'c1')).toBe(false);
    expect(holdsCoursePlace(app({ state: 'closed.denied' }), 'c1')).toBe(false);
    expect(holdsCoursePlace(app({ state: 'closed.cancelled' }), 'c1')).toBe(false);
    expect(holdsCoursePlace({}, 'c1')).toBe(false);
  });
  it('keeps the place of an approved application that accepted', () => {
    expect(holdsCoursePlace(app({ state: 'closed.approved', courseState: 'accepted' }), 'c1')).toBe(true);
  });
});

describe('isAnnouncedCourseOpen', () => {
  it('is false for a raw document', () => {
    expect(isAnnouncedCourseOpen({}, TODAY)).toBe(false);
  });
  it('is false when ended, without audience, unannounced or archived', () => {
    expect(isAnnouncedCourseOpen(course({ endDate: '20261109' }), TODAY)).toBe(false);
    expect(isAnnouncedCourseOpen(course({ audience: [] }), TODAY)).toBe(false);
    expect(isAnnouncedCourseOpen(course({ isAnnounced: false }), TODAY)).toBe(false);
    expect(isAnnouncedCourseOpen(course({ isArchived: true }), TODAY)).toBe(false);
    expect(isAnnouncedCourseOpen(course({ endDate: '' }), TODAY)).toBe(false);
  });
  it('is true on the end date itself', () => {
    expect(isAnnouncedCourseOpen(course({ endDate: TODAY }), TODAY)).toBe(true);
  });
});

describe('toCourseOption', () => {
  it('computes remaining and isFull', () => {
    expect(toCourseOption({ okey: 'k', ...course({ maxParticipants: 8 }) }, 5)).toMatchObject({ key: 'k', remaining: 3, isFull: false });
    expect(toCourseOption({ okey: 'k', ...course({ maxParticipants: 8 }) }, 8)).toMatchObject({ remaining: 0, isFull: true });
    expect(toCourseOption({ okey: 'k', ...course({ maxParticipants: 8 }) }, 9)).toMatchObject({ remaining: 0, isFull: true });
  });
  it('treats 0 and missing as unlimited', () => {
    expect(toCourseOption({ okey: 'k', ...course({ maxParticipants: 0 }) }, 50)).toMatchObject({ remaining: -1, isFull: false });
    expect(toCourseOption({ okey: 'k' }, 1)).toMatchObject({ remaining: -1, isFull: false, audience: [], name: '' });
  });
});

describe('coursesForAudience', () => {
  it('filters by audience membership and sorts by startDate', () => {
    const list = [
      opt({ key: 'b', startDate: '20270101', audience: ['youth', 'adult'] }),
      opt({ key: 'a', startDate: '20261201', audience: ['youth'] }),
      opt({ key: 'x', audience: ['adult'] }),
    ];
    expect(coursesForAudience(list, 'youth').map(o => o.key)).toEqual(['a', 'b']);
  });
  it('returns [] for an undefined audience', () => {
    expect(coursesForAudience([opt()], undefined)).toEqual([]);
  });
});

describe('courseChoiceRefusal', () => {
  const ok = (c: Partial<CourseModel> | undefined, aud = 'youth', taken = 0) =>
    courseChoiceRefusal(c, 'scs', aud, taken, TODAY);
  it('accepts a valid course', () => {
    expect(ok(course())).toBeUndefined();
  });
  it('refuses a course outside the audience', () => {
    expect(ok(course(), 'adult')).toBe('course-unavailable');
    expect(courseChoiceRefusal(course(), 'scs', undefined, 0, TODAY)).toBe('course-unavailable');
  });
  it('refuses undefined, other tenant, archived, unannounced, ended and full', () => {
    expect(ok(undefined)).toBe('course-unavailable');
    expect(ok(course({ tenants: ['other'] }))).toBe('course-unavailable');
    expect(ok(course({ isArchived: true }))).toBe('course-unavailable');
    expect(ok(course({ isAnnounced: false }))).toBe('course-unavailable');
    expect(ok(course({ endDate: '20261109' }))).toBe('course-unavailable');
    expect(ok(course({ maxParticipants: 2 }), 'youth', 2)).toBe('course-unavailable');
    expect(ok({})).toBe('course-unavailable');
  });
  it('accepts a limited course with a place left', () => {
    expect(ok(course({ maxParticipants: 2 }), 'youth', 1)).toBeUndefined();
  });
});
