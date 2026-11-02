import { describe, expect, it } from 'vitest';

import { AvatarInfo, CourseModel } from '@okr/shared-models';

import { CourseAccess, isCourseResponsible, mayCreateCourse, mayManageCourse, mayReadCourseFinance } from './course-access.util';

function avatar(key: string): AvatarInfo {
  return { key, name1: key, name2: key, modelType: 'person', type: '', subType: '', label: '' };
}

function course(responsible: string[] = [], trainers: string[] = []): CourseModel {
  const c = new CourseModel('scs');
  c.responsiblePersons = responsible.map(avatar);
  c.trainers = trainers.map(avatar);
  return c;
}

const nobody: CourseAccess = { personKey: 'p9', isGroupAdmin: false, isPrivileged: false, isTreasurer: false };

describe('isCourseResponsible', () => {
  it('matches a responsible person and nobody else', () => {
    expect(isCourseResponsible(course(['p1']), 'p1')).toBe(true);
    expect(isCourseResponsible(course(['p1']), 'p2')).toBe(false);
  });
  it('does not count a plain trainer', () => {
    expect(isCourseResponsible(course([], ['p1']), 'p1')).toBe(false);
  });
  it('is false without a person key, and tolerates a legacy document without the array', () => {
    expect(isCourseResponsible(course(['p1']), undefined)).toBe(false);
    expect(isCourseResponsible(course(['p1']), '')).toBe(false);
    const legacy = course();
    (legacy as Partial<CourseModel>).responsiblePersons = undefined;
    expect(isCourseResponsible(legacy, 'p1')).toBe(false);
  });
});

describe('mayManageCourse', () => {
  it('allows responsible, group admin and privileged', () => {
    expect(mayManageCourse(course(['p9']), nobody)).toBe(true);
    expect(mayManageCourse(course(), { ...nobody, isGroupAdmin: true })).toBe(true);
    expect(mayManageCourse(course(), { ...nobody, isPrivileged: true })).toBe(true);
  });
  it('refuses a trainer, a treasurer and a plain member', () => {
    expect(mayManageCourse(course([], ['p9']), nobody)).toBe(false);
    expect(mayManageCourse(course(), { ...nobody, isTreasurer: true })).toBe(false);
    expect(mayManageCourse(course(['p1']), nobody)).toBe(false);
  });
});

describe('mayReadCourseFinance', () => {
  it('adds the treasurer to the people who manage the course', () => {
    expect(mayReadCourseFinance(course(), { ...nobody, isTreasurer: true })).toBe(true);
    expect(mayReadCourseFinance(course(['p9']), nobody)).toBe(true);
    expect(mayReadCourseFinance(course(), { ...nobody, isGroupAdmin: true })).toBe(true);
    expect(mayReadCourseFinance(course(), { ...nobody, isPrivileged: true })).toBe(true);
  });
  it('refuses a trainer who is not responsible, so no read is attempted', () => {
    expect(mayReadCourseFinance(course(['p1'], ['p9']), nobody)).toBe(false);
  });
});

describe('mayCreateCourse', () => {
  it('needs privileged or group admin; being responsible of another course is not enough', () => {
    expect(mayCreateCourse({ isGroupAdmin: true, isPrivileged: false })).toBe(true);
    expect(mayCreateCourse({ isGroupAdmin: false, isPrivileged: true })).toBe(true);
    expect(mayCreateCourse({ isGroupAdmin: false, isPrivileged: false })).toBe(false);
  });
});
