import { describe, expect, it } from 'vitest';
import { AvatarInfo, TaskModel, UserModel } from '@okr/shared-models';

import { canChangeTask, canCreateTask, canDeleteTask, getCompletionPatch, getRestorePatch, getTaskExpenseKey, isTaskCompleted, opensExpense } from './task-permission.util';

function user(personKey: string, roles: Record<string, boolean> = { registered: true }): UserModel {
  const u = new UserModel('test');
  u.personKey = personKey;
  u.roles = roles as UserModel['roles'];
  return u;
}

function task(authorKey?: string, assigneeKey?: string): TaskModel {
  const t = new TaskModel('test');
  if (authorKey) t.author = { key: authorKey } as AvatarInfo;
  if (assigneeKey) t.assignee = { key: assigneeKey } as AvatarInfo;
  return t;
}

describe('task permissions', () => {
  describe('canCreateTask', () => {
    it('allows a registered member', () => expect(canCreateTask(user('p1'))).toBe(true));
    it('allows a group admin without tenant role', () => expect(canCreateTask(user('p1', {}), true)).toBe(true));
    it('denies an anonymous caller', () => expect(canCreateTask(undefined)).toBe(false));
  });

  describe('canChangeTask', () => {
    it('allows the author', () => expect(canChangeTask(task('p1', 'p2'), user('p1'))).toBe(true));
    it('allows the assignee', () => expect(canChangeTask(task('p2', 'p1'), user('p1'))).toBe(true));
    it('denies an unrelated member', () => expect(canChangeTask(task('p2', 'p3'), user('p1'))).toBe(false));
    it('allows privileged', () => expect(canChangeTask(task('p2'), user('p1', { registered: true, privileged: true }))).toBe(true));
    it('denies a group admin without author/assignee/privileged', () => expect(canChangeTask(task('p2'), user('p1'))).toBe(false));
    it('denies a member without a task', () => expect(canChangeTask(undefined, user('p1'))).toBe(false));
    it('denies a user without personKey', () => expect(canChangeTask(task(''), user(''))).toBe(false));
  });

  describe('canDeleteTask', () => {
    it('allows the author', () => expect(canDeleteTask(task('p1', 'p2'), user('p1'))).toBe(true));
    it('denies the assignee', () => expect(canDeleteTask(task('p2', 'p1'), user('p1'))).toBe(false));
    it('allows privileged', () => expect(canDeleteTask(task('p2'), user('p1', { registered: true, privileged: true }))).toBe(true));
    it('denies a group admin without author/privileged', () => expect(canDeleteTask(task('p2'), user('p1'))).toBe(false));
  });
});

describe('task completion', () => {
  it('completes an open task today', () => {
    expect(getCompletionPatch(task(), '20260930')).toEqual({ state: 'done', completionDate: '20260930' });
  });

  it('reopens a completed task', () => {
    const t = task();
    t.completionDate = '20260901';
    expect(getCompletionPatch(t, '20260930')).toEqual({ state: 'planned', completionDate: '' });
  });

  it('treats a legacy doc without completionDate as open', () => {
    const t = task();
    (t as unknown as { completionDate?: string }).completionDate = undefined;
    expect(isTaskCompleted(t)).toBe(false);
  });
});

describe('task restore', () => {
  it('reopens a completed task', () => {
    const t = task();
    t.isArchived = true;
    t.completionDate = '20260801';
    expect(getRestorePatch(t)).toEqual({ isArchived: false, state: 'planned', completionDate: '' });
  });

  it('only unarchives an open task', () => {
    const t = task();
    t.isArchived = true;
    expect(getRestorePatch(t)).toEqual({ isArchived: false });
  });
});

describe('task of an expense', () => {
  const task = (over: Partial<TaskModel>): TaskModel => Object.assign(new TaskModel('t'), over);
  const user = (roles: Record<string, boolean>): UserModel => Object.assign(new UserModel('t'), { roles });

  it('reads the expense key from linkKey, else relatedKey', () => {
    expect(getTaskExpenseKey(task({ relatedKey: 'expense.e1' }))).toBe('e1');
    expect(getTaskExpenseKey(task({ linkKey: 'expense.e2', relatedKey: 'expense.e1' }))).toBe('e2');
    expect(getTaskExpenseKey(task({ relatedKey: 'trip.t1' }))).toBe('');
  });
  it('coalesces a legacy task without either field', () => {
    const legacy = task({}) as unknown as Record<string, unknown>;
    delete legacy['linkKey']; delete legacy['relatedKey'];
    expect(getTaskExpenseKey(legacy as unknown as TaskModel)).toBe('');
  });
  it('opens the expense only for a treasurer or admin', () => {
    const t = task({ relatedKey: 'expense.e1' });
    expect(opensExpense(t, user({ treasurer: true }))).toBe(true);
    expect(opensExpense(t, user({ admin: true }))).toBe(true);
    expect(opensExpense(t, user({ registered: true }))).toBe(false);
    expect(opensExpense(task({ relatedKey: 'trip.t1' }), user({ treasurer: true }))).toBe(false);
  });
});
