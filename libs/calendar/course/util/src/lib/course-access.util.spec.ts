import { describe, expect, it, vi } from 'vitest';

import { AvatarInfo, CourseFinanceModel, CourseModel, MoneyModel } from '@okr/shared-models';

import {
  CourseAccess, isCourseResponsible, isCourseTrainer, loadFinanceForEdit, mayCreateCourse, mayEditCourseAttendance, mayExportCourse, mayManageCourse,
  mayOpenCourseMenu, mayReadCourseFinance
} from './course-access.util';

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

describe('loadFinanceForEdit', () => {
  const stored = Object.assign(new CourseFinanceModel(), { accountingTenantId: 'scs', defaultRate: new MoneyModel(5000) });

  it('makes no read for somebody who may not read the amounts, and offers no finance part', async () => {
    const read = vi.fn(async () => stored);
    expect(await loadFinanceForEdit(false, read)).toEqual({ finance: undefined, unavailable: false });
    expect(read).not.toHaveBeenCalled();
  });

  it('hands over the stored document', async () => {
    const result = await loadFinanceForEdit(true, async () => stored);
    expect(result.finance).toBe(stored);
    expect(result.unavailable).toBe(false);
  });

  it('starts fresh only when the server confirmed that there is no document', async () => {
    const result = await loadFinanceForEdit(true, async () => null);
    expect(result.finance).toEqual(new CourseFinanceModel());
    expect(result.unavailable).toBe(false);
  });

  it('offers NO finance part when the read failed, so nothing blank can overwrite the real document', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failure = new Error('client is offline');
    const result = await loadFinanceForEdit(true, async () => { throw failure; });
    expect(result).toEqual({ finance: undefined, unavailable: true });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not be read'), failure);   // diagnosable
    warn.mockRestore();
  });
});

describe('mayOpenCourseMenu', () => {
  const plain = { isPrivileged: false, isTreasurer: false };

  it('opens for a group admin on an empty list: nothing to manage yet, but they may add the first course', () => {
    const groupAdmin: CourseAccess = { ...nobody, isGroupAdmin: true };
    const canAdd = mayCreateCourse(groupAdmin);
    expect(canAdd).toBe(true);
    expect(mayOpenCourseMenu(groupAdmin, canAdd, false)).toBe(true);
  });

  it('opens for privileged, the treasurer and somebody who manages a listed course', () => {
    expect(mayOpenCourseMenu({ ...plain, isPrivileged: true }, false, false)).toBe(true);
    expect(mayOpenCourseMenu({ ...plain, isTreasurer: true }, false, false)).toBe(true);
    expect(mayOpenCourseMenu(plain, false, true)).toBe(true);
  });

  it('stays closed for a plain member, and for somebody who may not add and manages nothing', () => {
    expect(mayOpenCourseMenu(plain, false, false)).toBe(false);
  });
});

describe('isCourseTrainer / mayEditCourseAttendance / mayExportCourse', () => {
  it('a trainer or responsible person is a course trainer, a member is not', () => {
    expect(isCourseTrainer(course([], ['p1']), 'p1')).toBe(true);
    expect(isCourseTrainer(course(['p2']), 'p2')).toBe(true);
    expect(isCourseTrainer(course(['p2'], ['p1']), 'p3')).toBe(false);
    expect(isCourseTrainer(course([], ['p1']), '')).toBe(false);
  });

  it('trainer, responsible, group admin, eventAdmin and privileged edit the attendance of an unlocked course', () => {
    const c = course(['pR'], ['pT']);
    expect(mayEditCourseAttendance(c, { ...nobody, personKey: 'pT' })).toBe(true);
    expect(mayEditCourseAttendance(c, { ...nobody, personKey: 'pR' })).toBe(true);
    expect(mayEditCourseAttendance(c, { ...nobody, isGroupAdmin: true })).toBe(true);
    expect(mayEditCourseAttendance(c, { ...nobody, isEventAdmin: true })).toBe(true);
    expect(mayEditCourseAttendance(c, { ...nobody, isPrivileged: true })).toBe(true);
    expect(mayEditCourseAttendance(c, nobody)).toBe(false);
    expect(mayEditCourseAttendance(c, { ...nobody, isTreasurer: true })).toBe(false);
  });

  it('nobody edits the attendance of a locked course', () => {
    const c = Object.assign(course(['pR'], ['pT']), { isLocked: true });
    expect(mayEditCourseAttendance(c, { ...nobody, personKey: 'pT' })).toBe(false);
    expect(mayEditCourseAttendance(c, { ...nobody, isPrivileged: true })).toBe(false);
  });

  it('exports: the attendance editors (locked or not) and the treasurer, never a plain member', () => {
    const locked = Object.assign(course(['pR'], ['pT']), { isLocked: true });
    expect(mayExportCourse(locked, { ...nobody, personKey: 'pT' })).toBe(true);
    expect(mayExportCourse(locked, { ...nobody, isTreasurer: true })).toBe(true);
    expect(mayExportCourse(locked, { ...nobody, isEventAdmin: true })).toBe(true);
    expect(mayExportCourse(locked, nobody)).toBe(false);
    expect(locked.isLocked).toBe(true);   // the check does not touch the course
  });
});
