// apps/functions/src/task/task-decisions.spec.ts
import { describe, expect, it } from 'vitest';
import { decideTaskPush } from './task-decisions';

const open = { name: 'x', state: 'planned', isArchived: false, completionDate: '', assignee: { key: 'pA' }, author: { key: 'pB' }, tenants: ['scs'] };

describe('decideTaskPush', () => {
  it('pushes on create to someone else', () => expect(decideTaskPush(undefined, open)).toBe(true));
  it('skips a self-assigned create', () => expect(decideTaskPush(undefined, { ...open, author: { key: 'pA' } })).toBe(false));
  it('pushes on re-assignment', () => expect(decideTaskPush({ ...open, assignee: { key: 'pC' } }, open)).toBe(true));
  it('skips re-assignment to the author', () => expect(decideTaskPush({ ...open, assignee: { key: 'pC' } }, { ...open, assignee: { key: 'pB' } })).toBe(false));
  it('pushes on reopen', () => expect(decideTaskPush({ ...open, completionDate: '20260930' }, open)).toBe(true));
  it('skips a plain edit', () => expect(decideTaskPush(open, { ...open, name: 'y' })).toBe(false));
  it('skips archived, done, unassigned, deleted', () => {
    expect(decideTaskPush(undefined, { ...open, isArchived: true })).toBe(false);
    expect(decideTaskPush(undefined, { ...open, state: 'done' })).toBe(false);
    expect(decideTaskPush(undefined, { ...open, assignee: undefined })).toBe(false);
    expect(decideTaskPush(open, undefined)).toBe(false);
  });
});
