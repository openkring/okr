// apps/functions/src/task/task-decisions.spec.ts
import { describe, expect, it } from 'vitest';
import { assigneesToRecompute, decideDiaryTransition, decideTaskPush, getArchiveCutoff, resolveTaskArchiveDays } from './task-decisions';

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

describe('resolveTaskArchiveDays', () => {
  it('defaults a missing field to 30', () => expect(resolveTaskArchiveDays(undefined)).toBe(30));
  it('keeps 0 (never)', () => expect(resolveTaskArchiveDays(0)).toBe(0));
  it('rejects garbage', () => expect(resolveTaskArchiveDays('x')).toBe(30));
  it('floors fractions', () => expect(resolveTaskArchiveDays(7.9)).toBe(7));
  it('caps an oversized value at the validated maximum', () => expect(resolveTaskArchiveDays(1e9)).toBe(3650));
});

describe('getArchiveCutoff', () => {
  it('30 days before', () => expect(getArchiveCutoff('20260930', 30)).toBe('20260831'));
  it('crosses a year', () => expect(getArchiveCutoff('20260105', 10)).toBe('20251226'));
  it('0 means no cut-off', () => expect(getArchiveCutoff('20260930', 0)).toBe(''));
});

describe('decideDiaryTransition', () => {
  const base = { name: 'x', completionDate: '', isArchived: false, assignee: { key: 'pA' } };
  it('complete', () => expect(decideDiaryTransition(base, { ...base, completionDate: '20260930' })).toBe('complete'));
  it('complete on create as done', () => expect(decideDiaryTransition(undefined, { ...base, completionDate: '20260930' })).toBe('complete'));
  it('reopen', () => expect(decideDiaryTransition({ ...base, completionDate: '20260930' }, base)).toBe('reopen'));
  it('ignores archiving a completed task', () => {
    const done = { ...base, completionDate: '20260930' };
    expect(decideDiaryTransition(done, { ...done, isArchived: true })).toBe('none');
  });
  it('ignores a plain edit', () => expect(decideDiaryTransition(base, { ...base, name: 'y' })).toBe('none'));
  it('needs an assignee', () => expect(decideDiaryTransition(base, { ...base, completionDate: '20260930', assignee: undefined })).toBe('none'));
  it('ignores a delete', () => expect(decideDiaryTransition({ ...base, completionDate: '20260930' }, undefined)).toBe('none'));
});

describe('assigneesToRecompute (1.127 B1)', () => {
  const open = { assignee: { key: 'A' }, completionDate: '', isArchived: false, tenants: ['scs'], name: 'x' };

  it('returns the new assignee on create', () => expect(assigneesToRecompute(undefined, open)).toEqual(['A']));
  it('returns the old assignee on delete', () => expect(assigneesToRecompute(open, undefined)).toEqual(['A']));
  it('returns both on a reassignment', () => {
    expect(assigneesToRecompute(open, { ...open, assignee: { key: 'B' } })).toEqual(['A', 'B']);
  });
  it('returns the assignee on complete, reopen and archive', () => {
    const done = { ...open, completionDate: '20261031' };
    expect(assigneesToRecompute(open, done)).toEqual(['A']);
    expect(assigneesToRecompute(done, open)).toEqual(['A']);
    expect(assigneesToRecompute(open, { ...open, isArchived: true })).toEqual(['A']);
  });
  it('returns nothing for an unrelated field change', () => {
    expect(assigneesToRecompute(open, { ...open, name: 'renamed', dueDate: '20261101' })).toEqual([]);
  });
  it('returns nothing when the task is not counted on either side', () => {
    const done = { ...open, completionDate: '20261031' };
    expect(assigneesToRecompute(done, { ...done, isArchived: true })).toEqual([]);
  });
  it('drops empty assignees', () => {
    expect(assigneesToRecompute({ ...open, assignee: undefined }, open)).toEqual(['A']);
    expect(assigneesToRecompute(undefined, { ...open, assignee: { key: '' } })).toEqual([]);
  });
});
