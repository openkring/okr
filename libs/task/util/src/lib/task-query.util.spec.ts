import { describe, expect, it } from 'vitest';
import { TaskModel } from '@okr/shared-models';
import { buildTaskListQueries, getTaskShareKey, isActiveGroupMembership, isClosedGroup, isTaskStaff } from './task-query.util';

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

describe('isClosedGroup', () => {
  it('is closed for chatMode members', () => expect(isClosedGroup({ chatMode: 'members' })).toBe(true));
  it('is open for ask and shared', () => {
    expect(isClosedGroup({ chatMode: 'ask' })).toBe(false);
    expect(isClosedGroup({ chatMode: 'shared' })).toBe(false);
  });
  it('is open for an unknown group or a legacy doc without chatMode', () => {
    expect(isClosedGroup(undefined)).toBe(false);
    expect(isClosedGroup({} as never)).toBe(false);
  });
});

describe('isTaskStaff', () => {
  it('admits admin, privileged, eventAdmin', () => {
    expect(isTaskStaff({ admin: true })).toBe(true);
    expect(isTaskStaff({ privileged: true })).toBe(true);
    expect(isTaskStaff({ eventAdmin: true })).toBe(true);
  });
  it('refuses other roles and no roles', () => {
    expect(isTaskStaff({ treasurer: true, memberAdmin: true })).toBe(false);
    expect(isTaskStaff(undefined)).toBe(false);
  });
});

describe('isActiveGroupMembership', () => {
  const m = { isArchived: false, dateOfExit: '', orgModelType: 'group', memberModelType: 'person' } as const;
  it('is active without an exit date', () => expect(isActiveGroupMembership(m, '20261004')).toBe(true));
  it('is active until and including the exit day', () => {
    expect(isActiveGroupMembership({ ...m, dateOfExit: '20261004' }, '20261004')).toBe(true);
    expect(isActiveGroupMembership({ ...m, dateOfExit: '99991231' }, '20261004')).toBe(true);
  });
  it('is not active after the exit date', () => expect(isActiveGroupMembership({ ...m, dateOfExit: '20261003' }, '20261004')).toBe(false));
  it('is not active when archived', () => expect(isActiveGroupMembership({ ...m, isArchived: true }, '20261004')).toBe(false));
  it('counts only person memberships in a group', () => {
    expect(isActiveGroupMembership({ ...m, orgModelType: 'org' }, '20261004')).toBe(false);
    expect(isActiveGroupMembership({ ...m, memberModelType: 'org' }, '20261004')).toBe(false);
  });
});
