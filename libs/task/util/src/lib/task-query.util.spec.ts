import { describe, expect, it } from 'vitest';
import { TaskModel } from '@okr/shared-models';
import { buildTaskListQueries, getTaskShareKey } from './task-query.util';

function task(calendars: string[] | undefined, relatedKey = ''): TaskModel {
  const t = new TaskModel('scs');
  (t as unknown as { calendars?: string[] }).calendars = calendars;
  t.relatedKey = relatedKey;
  return t;
}

describe('getTaskShareKey', () => {
  it('is empty for a personal task in the tenant calendar', () => expect(getTaskShareKey(task(['scs']))).toBe(''));
  it('is empty for a legacy task without calendars', () => expect(getTaskShareKey(task(undefined))).toBe(''));
  it('is empty for an empty calendar list', () => expect(getTaskShareKey(task([]))).toBe(''));
  it('is the group key for a group calendar', () => expect(getTaskShareKey(task(['grp1']))).toBe('grp1'));
  it('skips the tenant key next to a group', () => expect(getTaskShareKey(task(['scs', 'grp1']))).toBe('grp1'));
  it('is the relatedKey for a meeting action item', () => expect(getTaskShareKey(task(['scs'], 'meeting.m1'))).toBe('meeting.m1'));
  it('prefers the meeting over a group calendar', () => expect(getTaskShareKey(task(['grp1'], 'meeting.m1'))).toBe('meeting.m1'));
  it('is empty for other related records', () => expect(getTaskShareKey(task(['scs'], 'trip.t1'))).toBe(''));
});

describe('buildTaskListQueries', () => {
  const base = { tenantId: 'scs' };
  const keys = (q: { key: string }[]) => q.map(c => c.key);

  it('my: two queries, assignee and author, open only', () => {
    const qs = buildTaskListQueries({ ...base, kind: 'my', personKey: 'p1', openOnly: true });
    expect(qs).toHaveLength(2);
    expect(qs[0]).toContainEqual({ key: 'assignee.key', operator: '==', value: 'p1' });
    expect(qs[1]).toContainEqual({ key: 'author.key', operator: '==', value: 'p1' });
    for (const q of qs) {
      expect(q).toContainEqual({ key: 'isArchived', operator: '==', value: false });
      expect(q).toContainEqual({ key: 'completionDate', operator: '==', value: '' });
      expect(keys(q)).toContain('tenants');
    }
  });

  it('my without personKey: nothing to query', () => {
    expect(buildTaskListQueries({ ...base, kind: 'my' })).toEqual([]);
  });

  it('shared: shareKey plus the tenant filter, no calendars filter', () => {
    const [q] = buildTaskListQueries({ ...base, kind: 'shared', shareKey: 'grp1' });
    expect(q).toContainEqual({ key: 'shareKey', operator: '==', value: 'grp1' });
    expect(keys(q)).toContain('tenants');
    expect(keys(q)).not.toContain('calendars');
  });

  it('shared without shareKey: nothing to query', () => {
    expect(buildTaskListQueries({ ...base, kind: 'shared' })).toEqual([]);
  });

  it('all: tenant scope only', () => {
    const qs = buildTaskListQueries({ ...base, kind: 'all' });
    expect(qs).toHaveLength(1);
    expect(keys(qs[0])).toEqual(['isArchived', 'tenants']);
  });

  it('archived flips the flag and drops openOnly', () => {
    const [q] = buildTaskListQueries({ ...base, kind: 'my', personKey: 'p1', archived: true, openOnly: true });
    expect(q).toContainEqual({ key: 'isArchived', operator: '==', value: true });
    expect(q.find(c => c.key === 'completionDate')).toBeUndefined();
  });
});
