import { describe, expect, it } from 'vitest';

import { AvatarInfo, CourseModel } from '@okr/shared-models';

import { CourseAccess } from './course-access.util';
import { COURSE_I18N_KEYS } from './course-i18n';
import {
  COURSE_HELP_SECTIONS, courseHelpRoleFor, courseListHelpRole, courseTaskHelpRole, isCourseLinkKey, pickCourseHelpRole, strongestCourseHelpRole
} from './course-help.util';

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

describe('pickCourseHelpRole', () => {
  it('a manager gets the responsible help, even as trainer and treasurer', () => {
    expect(pickCourseHelpRole({ manages: true, trains: true, isTreasurer: true })).toBe('responsible');
  });
  it('a trainer gets the trainer help, even as treasurer', () => {
    expect(pickCourseHelpRole({ manages: false, trains: true, isTreasurer: true })).toBe('trainer');
  });
  it('the treasurer gets the treasurer help', () => {
    expect(pickCourseHelpRole({ manages: false, trains: false, isTreasurer: true })).toBe('treasurer');
  });
  it('everybody else is a participant', () => {
    expect(pickCourseHelpRole({ manages: false, trains: false, isTreasurer: false })).toBe('participant');
  });
});

describe('courseHelpRoleFor', () => {
  it('responsible person, group admin and privileged get the responsible help', () => {
    expect(courseHelpRoleFor(course(['p9']), nobody)).toBe('responsible');
    expect(courseHelpRoleFor(course(), { ...nobody, isGroupAdmin: true })).toBe('responsible');
    expect(courseHelpRoleFor(course(), { ...nobody, isPrivileged: true })).toBe('responsible');
  });
  it('a trainer of the course gets the trainer help', () => {
    expect(courseHelpRoleFor(course(['p1'], ['p9']), nobody)).toBe('trainer');
  });
  it('the treasurer gets the treasurer help, a plain member the participant help', () => {
    expect(courseHelpRoleFor(course(['p1'], ['p2']), { ...nobody, isTreasurer: true })).toBe('treasurer');
    expect(courseHelpRoleFor(course(['p1'], ['p2']), nobody)).toBe('participant');
  });
});

describe('strongestCourseHelpRole', () => {
  it('orders responsible > trainer > treasurer > participant', () => {
    expect(strongestCourseHelpRole(['participant', 'treasurer', 'trainer'])).toBe('trainer');
    expect(strongestCourseHelpRole(['participant', 'treasurer'])).toBe('treasurer');
    expect(strongestCourseHelpRole(['participant', 'responsible', 'trainer'])).toBe('responsible');
  });
  it('falls back to participant for an empty list', () => {
    expect(strongestCourseHelpRole([])).toBe('participant');
  });
});

describe('courseListHelpRole', () => {
  const accessFor = (c: CourseModel): CourseAccess => ({ ...nobody, isGroupAdmin: c.groupKey === 'g-admin' });

  it('takes the strongest role over the listed courses', () => {
    const adminCourse = course(); adminCourse.groupKey = 'g-admin';
    expect(courseListHelpRole([course(), course([], ['p9']), adminCourse], accessFor, nobody)).toBe('responsible');
    expect(courseListHelpRole([course(), course([], ['p9'])], accessFor, nobody)).toBe('trainer');
  });
  it('an empty list falls back to the rights that need no course', () => {
    expect(courseListHelpRole([], accessFor, { ...nobody, isGroupAdmin: true })).toBe('responsible');
    expect(courseListHelpRole([], accessFor, { ...nobody, isPrivileged: true })).toBe('responsible');
    expect(courseListHelpRole([], accessFor, { ...nobody, isTreasurer: true })).toBe('treasurer');
    expect(courseListHelpRole([], accessFor, nobody)).toBe('participant');
  });
  it('a treasurer who trains in one course gets the trainer help', () => {
    expect(courseListHelpRole([course([], ['p9'])], accessFor, { ...nobody, isTreasurer: true })).toBe('trainer');
  });
});

describe('course tasks', () => {
  it('recognises the course link key', () => {
    expect(isCourseLinkKey('course.k1')).toBe(true);
    expect(isCourseLinkKey('expense.k1')).toBe(false);
    expect(isCourseLinkKey('')).toBe(false);
    expect(isCourseLinkKey(undefined)).toBe(false);
  });
  it('the end task is for the responsible person, the review task for the treasurer', () => {
    expect(courseTaskHelpRole({ okey: 'course-k1-end' })).toBe('responsible');
    expect(courseTaskHelpRole({ okey: 'Zx81abc' })).toBe('treasurer');
    expect(courseTaskHelpRole({})).toBe('treasurer');
  });
});

describe('COURSE_HELP_SECTIONS', () => {
  it('has sections for every role, and every key is a known i18n key', () => {
    for (const sections of Object.values(COURSE_HELP_SECTIONS)) {
      expect(sections.length).toBeGreaterThan(0);
      for (const section of sections) {
        expect(COURSE_I18N_KEYS).toHaveProperty(section.title);
        expect(COURSE_I18N_KEYS).toHaveProperty(section.text);
      }
    }
  });
  it('each role has its label and intro key', () => {
    for (const role of Object.keys(COURSE_HELP_SECTIONS)) {
      expect(COURSE_I18N_KEYS).toHaveProperty(`help_${role}_role`);
      expect(COURSE_I18N_KEYS).toHaveProperty(`help_${role}_intro`);
    }
  });
});
