// apps/functions/src/task/task-decisions.spec.ts
import { describe, expect, it } from 'vitest';
import { decideTaskPush, getArchiveCutoff, resolveTaskArchiveDays } from './task-decisions';

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
});

describe('getArchiveCutoff', () => {
  it('30 days before', () => expect(getArchiveCutoff('20260930', 30)).toBe('20260831'));
  it('crosses a year', () => expect(getArchiveCutoff('20260105', 10)).toBe('20251226'));
  it('0 means no cut-off', () => expect(getArchiveCutoff('20260930', 0)).toBe(''));
});
