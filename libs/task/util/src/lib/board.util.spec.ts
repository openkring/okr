import { describe, expect, it } from 'vitest';
import { CategoryItemModel, CategoryListModel, TaskModel } from '@okr/shared-models';
import { assignMissingRanks, groupTasksByState, isTerminalTaskState, sortTasksByRank } from './board.util';

const TENANT = 'scs';

function makeTask(okey: string, state: string, rank = '', dueDate = ''): TaskModel {
  const task = new TaskModel(TENANT);
  task.okey = okey;
  task.state = state;
  task.rank = rank;
  task.dueDate = dueDate;
  return task;
}

/**
 * A task as read from Firestore *before* the `rank` field existed: `collectionData` returns a raw
 * plain object, so the TaskModel field initializer (`rank = ''`) never runs and the property is
 * simply absent (undefined). Regression guard for the board.util crash on legacy documents.
 */
function makeLegacyTask(okey: string, state: string, dueDate = ''): TaskModel {
  const task = makeTask(okey, state, '', dueDate);
  delete (task as { rank?: string }).rank;
  return task;
}

function makeStates(): CategoryListModel {
  const category = new CategoryListModel(TENANT);
  category.name = 'task_state';
  category.items = [
    new CategoryItemModel('initial', 'circle'),
    new CategoryItemModel('doing', 'play-circle'),
    new CategoryItemModel('done', 'checkbox-circle'),
  ];
  return category;
}

describe('isTerminalTaskState', () => {
  it('recognises the terminal / parking states', () => {
    expect(isTerminalTaskState('done')).toBe(true);
    expect(isTerminalTaskState('cancelled')).toBe(true);
    expect(isTerminalTaskState('later')).toBe(true);
    expect(isTerminalTaskState('doing')).toBe(false);
    expect(isTerminalTaskState('initial')).toBe(false);
  });
});

describe('sortTasksByRank', () => {
  it('sorts ranked tasks by rank', () => {
    const tasks = [makeTask('c', 'doing', 'c'), makeTask('a', 'doing', 'a'), makeTask('b', 'doing', 'b')];
    expect(sortTasksByRank(tasks).map(t => t.okey)).toEqual(['a', 'b', 'c']);
  });

  it('falls back to dueDate for unranked tasks', () => {
    const tasks = [makeTask('late', 'doing', '', '20260301'), makeTask('early', 'doing', '', '20260101')];
    expect(sortTasksByRank(tasks).map(t => t.okey)).toEqual(['early', 'late']);
  });

  it('puts unranked tasks without a dueDate last', () => {
    const tasks = [makeTask('none', 'doing', '', ''), makeTask('dated', 'doing', '', '20260101')];
    expect(sortTasksByRank(tasks).map(t => t.okey)).toEqual(['dated', 'none']);
  });

  it('puts ranked tasks before unranked ones', () => {
    const tasks = [makeTask('unranked', 'doing', '', '20260101'), makeTask('ranked', 'doing', 'V')];
    expect(sortTasksByRank(tasks).map(t => t.okey)).toEqual(['ranked', 'unranked']);
  });

  it('does not mutate its input', () => {
    const tasks = [makeTask('b', 'doing', 'b'), makeTask('a', 'doing', 'a')];
    sortTasksByRank(tasks);
    expect(tasks.map(t => t.okey)).toEqual(['b', 'a']);
  });

  it('treats a legacy task with no rank field as unranked instead of crashing', () => {
    const tasks = [makeLegacyTask('late', 'doing', '20260301'), makeLegacyTask('early', 'doing', '20260101')];
    expect(sortTasksByRank(tasks).map(t => t.okey)).toEqual(['early', 'late']);
  });

  it('sorts ranked tasks ahead of legacy unranked ones', () => {
    const tasks = [makeLegacyTask('legacy', 'doing', '20260101'), makeTask('ranked', 'doing', 'V')];
    expect(sortTasksByRank(tasks).map(t => t.okey)).toEqual(['ranked', 'legacy']);
  });
});

describe('groupTasksByState', () => {
  it('produces one column per category item, in category order', () => {
    const columns = groupTasksByState([], makeStates());
    expect(columns.map(c => c.name)).toEqual(['initial', 'doing', 'done']);
  });

  it('carries the icon from the category item', () => {
    const columns = groupTasksByState([], makeStates());
    expect(columns[2].icon).toBe('checkbox-circle');
  });

  it('places each task in its state column, sorted by rank', () => {
    const tasks = [makeTask('t2', 'doing', 'b'), makeTask('t1', 'doing', 'a'), makeTask('t3', 'done', 'a')];
    const columns = groupTasksByState(tasks, makeStates());
    expect(columns[0].tasks).toEqual([]);
    expect(columns[1].tasks.map(t => t.okey)).toEqual(['t1', 't2']);
    expect(columns[2].tasks.map(t => t.okey)).toEqual(['t3']);
  });

  it('drops tasks whose state is not in the category (a renamed item)', () => {
    const columns = groupTasksByState([makeTask('orphan', 'inProgress', 'a')], makeStates());
    expect(columns.flatMap(c => c.tasks)).toEqual([]);
  });

  it('returns no columns when the category is missing', () => {
    expect(groupTasksByState([makeTask('t1', 'doing')], undefined)).toEqual([]);
  });
});

describe('assignMissingRanks', () => {
  it('ranks every task in a fully unranked column and reports them all as changed', () => {
    const tasks = [makeTask('a', 'doing'), makeTask('b', 'doing'), makeTask('c', 'doing')];
    const changed = assignMissingRanks(tasks);
    expect(changed).toHaveLength(3);
    expect(tasks[0].rank < tasks[1].rank).toBe(true);
    expect(tasks[1].rank < tasks[2].rank).toBe(true);
  });

  it('is a no-op on an already fully ranked column', () => {
    const tasks = [makeTask('a', 'doing', 'a'), makeTask('b', 'doing', 'b')];
    expect(assignMissingRanks(tasks)).toEqual([]);
    expect(tasks.map(t => t.rank)).toEqual(['a', 'b']);
  });

  it('rewrites a partially ranked column so the ranks stay monotonic', () => {
    const tasks = [makeTask('a', 'doing', 'zzz'), makeTask('b', 'doing', '')];
    const changed = assignMissingRanks(tasks);
    expect(changed.length).toBeGreaterThan(0);
    expect(tasks[0].rank < tasks[1].rank).toBe(true);
  });

  it('handles an empty column', () => {
    expect(assignMissingRanks([])).toEqual([]);
  });

  it('backfills legacy tasks that have no rank field at all', () => {
    const tasks = [makeLegacyTask('a', 'doing'), makeLegacyTask('b', 'doing')];
    const changed = assignMissingRanks(tasks);
    expect(changed).toHaveLength(2);
    expect(tasks[0].rank < tasks[1].rank).toBe(true);
  });
});
