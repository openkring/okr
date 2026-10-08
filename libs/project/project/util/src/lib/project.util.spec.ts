import { describe, expect, it } from 'vitest';

import { TaskModel } from '@okr/shared-models';

import { duplicateProjectTasks, getProjectKeyOfParent, getProjectParentKey, shiftStoreDate } from './project.util';

describe('project parent keys', () => {
  it('builds the tupel', () => expect(getProjectParentKey('p1')).toBe('project.p1'));
  it('keeps the backlog empty', () => expect(getProjectParentKey('')).toBe(''));
  it('reads a project tupel', () => expect(getProjectKeyOfParent('project.p1')).toBe('p1'));
  it('ignores other parents', () => expect(getProjectKeyOfParent('risk.r1')).toBe(''));
  it('coalesces legacy docs', () => expect(getProjectKeyOfParent(undefined)).toBe(''));
});

describe('shiftStoreDate', () => {
  it('shifts a full date across a year boundary', () => expect(shiftStoreDate('20261220', 14)).toBe('20270103'));
  it('keeps an empty date', () => expect(shiftStoreDate('', 365)).toBe(''));
  it('keeps a partial date unchanged', () => expect(shiftStoreDate('202612', 30)).toBe('202612'));
  it('is a no-op for 0 days', () => expect(shiftStoreDate('20260501', 0)).toBe('20260501'));
});

describe('duplicateProjectTasks', () => {
  const src = Object.assign(new TaskModel('scs'), {
    okey: 't1', name: 'Zelt mieten', state: 'done', dueDate: '20260501', completionDate: '20260430',
    parentKey: 'project.old', shareKey: 'g1', rank: 'm', relatedKey: 'x.1', relatedModelType: 'x',
    linkKey: 'y.1', linkModelType: 'y', isArchived: false,
  });
  const [copy] = duplicateProjectTasks([src], 364, 'project.new', 'initial');
  it('creates a new document', () => expect(copy.okey).toBe(''));
  it('re-parents', () => expect(copy.parentKey).toBe('project.new'));
  it('shifts the due date', () => expect(copy.dueDate).toBe('20270430'));
  it('resets completion and state', () => { expect(copy.completionDate).toBe(''); expect(copy.state).toBe('initial'); });
  it('keeps group scope, rank and assignee', () => { expect(copy.shareKey).toBe('g1'); expect(copy.rank).toBe('m'); });
  it('drops workflow links', () => { expect(copy.relatedKey).toBe(''); expect(copy.linkKey).toBe(''); });
  it('skips archived tasks', () => expect(duplicateProjectTasks([{ ...src, isArchived: true }], 0, 'project.n', 'initial')).toEqual([]));
  it('does not mutate the source', () => expect(src.state).toBe('done'));
});
