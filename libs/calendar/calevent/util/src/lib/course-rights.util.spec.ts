import { CalEventModel, CourseModel } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';

import { courseKeysOf, courseSeriesPatch, courseOfKey, eventsOfLockedCourses, isCourseTrainerFor, lockedCoursesOf } from './course-rights.util';

function course(okey: string, patch: Partial<CourseModel> = {}): CourseModel {
  return Object.assign(new CourseModel('scs'), { okey, trainerKeys: [], ...patch });
}

function event(courseKey: string, okey = 'e1'): CalEventModel {
  return Object.assign(new CalEventModel('scs'), { okey, courseKey });
}

const COURSES = [
  course('c1', { trainerKeys: ['p-trainer', 'p-resp'] }),
  course('c2', { trainerKeys: ['p-other'] }),
];

describe('isCourseTrainerFor', () => {
  it('is true for a trainer of the course the event belongs to', () => {
    expect(isCourseTrainerFor(event('c1'), COURSES, 'p-trainer')).toBe(true);
  });

  it('counts a responsible person, whom trainerKeys mirrors', () => {
    expect(isCourseTrainerFor(event('c1'), COURSES, 'p-resp')).toBe(true);
  });

  it('is false for an event without a courseKey', () => {
    expect(isCourseTrainerFor(event(''), COURSES, 'p-trainer')).toBe(false);
  });

  it('is false for an event of a course the person does not train', () => {
    expect(isCourseTrainerFor(event('c2'), COURSES, 'p-trainer')).toBe(false);
  });

  it('is false for a courseKey that names no course of the list', () => {
    expect(isCourseTrainerFor(event('gone'), COURSES, 'p-trainer')).toBe(false);
  });

  it('is false without a person key', () => {
    expect(isCourseTrainerFor(event('c1'), COURSES, '')).toBe(false);
  });

  it('is false for a new event without a preset courseKey', () => {
    expect(isCourseTrainerFor(undefined, COURSES, 'p-trainer')).toBe(false);
    expect(isCourseTrainerFor({ courseKey: '' }, COURSES, 'p-trainer')).toBe(false);
  });

  it('accepts the preset courseKey of a new event', () => {
    expect(isCourseTrainerFor({ courseKey: 'c1' }, COURSES, 'p-trainer')).toBe(true);
    expect(isCourseTrainerFor({ courseKey: 'c2' }, COURSES, 'p-trainer')).toBe(false);
  });

  it('survives a legacy event without courseKey and a course without trainerKeys', () => {
    const legacy = event('c1');
    delete (legacy as { courseKey?: string }).courseKey;
    expect(isCourseTrainerFor(legacy, COURSES, 'p-trainer')).toBe(false);
    const noKeys = [course('c1')];
    delete (noKeys[0] as { trainerKeys?: string[] }).trainerKeys;
    expect(isCourseTrainerFor(event('c1'), noKeys, 'p-trainer')).toBe(false);
  });
});

describe('courseOfKey', () => {
  it('finds the course, and nothing for an empty key', () => {
    expect(courseOfKey('c2', COURSES)?.okey).toBe('c2');
    expect(courseOfKey('', COURSES)).toBeUndefined();
    expect(courseOfKey(undefined, COURSES)).toBeUndefined();
  });
});

describe('courseKeysOf', () => {
  it('lists each course once and skips events without one', () => {
    expect(courseKeysOf([event('c1', 'a'), event('', 'b'), event('c1', 'c'), event('c2', 'd')])).toEqual(['c1', 'c2']);
  });
});

describe('lockedCoursesOf / eventsOfLockedCourses', () => {
  const courses = [course('c1', { isLocked: true }), course('c2', { isLocked: false }), course('c3')];

  it('returns only the locked courses', () => {
    expect(lockedCoursesOf(courses).map(c => c.okey)).toEqual(['c1']);
  });

  it('ignores holes in the list (a course that could not be read)', () => {
    expect(lockedCoursesOf([undefined, courses[0]]).map(c => c.okey)).toEqual(['c1']);
  });

  it('picks the events that belong to a locked course', () => {
    const events = [event('c1', 'a'), event('c2', 'b'), event('', 'c'), event('c1', 'd')];
    expect(eventsOfLockedCourses(events, courses).map(e => e.okey)).toEqual(['a', 'd']);
  });

  it('is empty when no course is locked', () => {
    expect(eventsOfLockedCourses([event('c2')], courses)).toEqual([]);
  });
});

describe('courseSeriesPatch', () => {
  const running = course('c1', { name: 'Anfängerkurs', startDate: '20260301', endDate: '20260630' });

  it('presets key, name, a weekly rhythm and the course period', () => {
    expect(courseSeriesPatch(running, '20260101')).toEqual({
      courseKey: 'c1', name: 'Anfängerkurs', periodicity: 'weekly', startDate: '20260301', repeatUntilDate: '20260630',
    });
  });

  it('starts today when the course is already running', () => {
    expect(courseSeriesPatch(running, '20260415')).toMatchObject({ startDate: '20260415', repeatUntilDate: '20260630' });
  });

  it('leaves the end to the form when the course is over', () => {
    const patch = courseSeriesPatch(running, '20261001');
    expect(patch.startDate).toBe('20261001');
    expect(patch).not.toHaveProperty('repeatUntilDate');
  });

  it('allows a one-day period', () => {
    expect(courseSeriesPatch(course('c1', { startDate: '20260415', endDate: '20260415' }), '20260415')).toMatchObject({ repeatUntilDate: '20260415' });
  });

  it('copes with a course without dates', () => {
    const patch = courseSeriesPatch(course('c1', { startDate: '', endDate: '' }), '20260415');
    expect(patch).toMatchObject({ courseKey: 'c1', startDate: '20260415' });
    expect(patch).not.toHaveProperty('repeatUntilDate');
  });
});
