import { CategoryListModel, TaskModel } from '@okr/shared-models';
import { rankForIndex } from './rank.util';

/**
 * A single Kanban column. The board is a *view*, not an entity (spec D6): columns are derived
 * from the `task_state` category list, so their order, icon and colour are admin-editable data,
 * not code.
 */
export type TaskBoardColumn = {
  name: string;       // the CategoryItemModel.name — this is the value persisted in TaskModel.state
  icon: string;       // CategoryItemModel.icon
  color: string;      // CategoryItemModel.color; '' when the admin has not set one
  tasks: TaskModel[];
};

/**
 * Terminal / parking states. They are collapsed by default on narrow screens, because seven
 * columns do not fit on a phone (spec §7 Phase 1).
 */
export const TERMINAL_TASK_STATES: readonly string[] = ['done', 'cancelled', 'later'];

export function isTerminalTaskState(name: string): boolean {
  return TERMINAL_TASK_STATES.includes(name);
}

/** Unranked tasks sort by dueDate; a missing dueDate sorts last. */
function compareUnranked(a: TaskModel, b: TaskModel): number {
  const dueA = a.dueDate.length > 0 ? a.dueDate : '99999999';
  const dueB = b.dueDate.length > 0 ? b.dueDate : '99999999';
  if (dueA !== dueB) return dueA < dueB ? -1 : 1;
  return a.okey < b.okey ? -1 : a.okey > b.okey ? 1 : 0;
}

/**
 * Order the cards of one column. Ranked tasks (explicitly positioned by a drag) come first, in
 * rank order. Tasks that have never been ranked keep the dueDate order the query already
 * produced — that is exactly the order the spec's backfill would have frozen into ranks, so the
 * board looks right before a single rank exists in the database.
 */
export function sortTasksByRank(tasks: TaskModel[]): TaskModel[] {
  return [...tasks].sort((a, b) => {
    const rankedA = a.rank.length > 0;
    const rankedB = b.rank.length > 0;
    if (rankedA && rankedB) {
      if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
      return compareUnranked(a, b);
    }
    if (rankedA) return -1;
    if (rankedB) return 1;
    return compareUnranked(a, b);
  });
}

/**
 * Build the board: one column per `task_state` category item, in category order.
 * A task whose state is not in the category is dropped — that only happens when an admin has
 * renamed a CategoryItemModel.name, which the spec forbids (§6.1); dropping it is visible and
 * recoverable, silently inventing a column would not be.
 */
export function groupTasksByState(tasks: TaskModel[], states?: CategoryListModel): TaskBoardColumn[] {
  if (!states) return [];
  return states.items.map(item => ({
    name: item.name,
    icon: item.icon,
    color: item.color ?? '',
    tasks: sortTasksByRank(tasks.filter(task => task.state === item.name)),
  }));
}

/**
 * Give every task in a column a rank, if any of them is missing one. Mutates the tasks in place
 * and returns only those whose rank actually changed, so the caller writes the minimum number of
 * documents.
 *
 * This is the lazy, self-healing form of the spec's "backfill from the current dueDate order":
 * the column is already in dueDate order when it is unranked (see `sortTasksByRank`), so
 * freezing that order into ranks is precisely the backfill — just performed on first use rather
 * than by a one-off migration script.
 */
export function assignMissingRanks(columnTasks: TaskModel[]): TaskModel[] {
  if (columnTasks.every(task => task.rank.length > 0)) return [];
  const changed: TaskModel[] = [];
  columnTasks.forEach((task, index) => {
    const rank = rankForIndex(index);
    if (task.rank !== rank) {
      task.rank = rank;
      changed.push(task);
    }
  });
  return changed;
}
