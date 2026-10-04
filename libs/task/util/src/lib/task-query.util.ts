import { DbQuery, GroupModel, MembershipModel, TaskModel } from '@okr/shared-models';
import { getArchiveInclusiveQuery } from '@okr/shared-util-core';

/*-------------------------- visibility --------------------------------*/
/**
 * Who besides author/assignee/staff may read this task (spec 1.72 §4)? '' = nobody (private).
 * A meeting action item → its relatedKey ('meeting.<okey>'); a task in a group calendar → the
 * group key (first calendar that is not one of the task's tenants). Stored denormalised as
 * `shareKey`: Firestore rules only admit a list query that filters on the field the rule checks,
 * and a query may carry just one array filter (tenants), so `calendars` cannot serve.
 */
export function getTaskShareKey(task: Pick<TaskModel, 'calendars' | 'tenants' | 'relatedKey'>): string {
  const relatedKey = task.relatedKey ?? '';
  if (relatedKey.startsWith('meeting.')) return relatedKey;
  const tenants = task.tenants ?? [];
  return (task.calendars ?? []).find(c => !tenants.includes(c)) ?? '';
}

/*-------------------------- queries --------------------------------*/
export type TaskListScope = {
  kind: 'my' | 'all' | 'shared';
  tenantId: string;
  personKey?: string;   // 'my'
  shareKey?: string;    // 'shared': a group key or 'meeting.<okey>'
  archived?: boolean;   // true = the archived view (spec §10)
  openOnly?: boolean;   // only not-yet-completed tasks; ignored for the archived view
};

/**
 * The Firestore queries a task list needs. Each one is provable against the rules of spec 1.72
 * §3.1: 'my' filters on the caller's own personKey, 'shared' on shareKey, 'all' is for staff only
 * (the menu row is privileged). Several queries → the caller merges them by okey.
 */
export function buildTaskListQueries(scope: TaskListScope): DbQuery[][] {
  const archived = scope.archived ?? false;
  const base = (): DbQuery[] => {
    const q: DbQuery[] = [{ key: 'isArchived', operator: '==', value: archived }, ...getArchiveInclusiveQuery(scope.tenantId)];
    if (scope.openOnly && !archived) q.push({ key: 'completionDate', operator: '==', value: '' });
    return q;
  };
  switch (scope.kind) {
    case 'my':
      if (!scope.personKey) return [];
      return [
        [...base(), { key: 'assignee.key', operator: '==', value: scope.personKey }],
        [...base(), { key: 'author.key', operator: '==', value: scope.personKey }],
      ];
    case 'shared':
      if (!scope.shareKey) return [];
      return [[...base(), { key: 'shareKey', operator: '==', value: scope.shareKey }]];
    case 'all':
      return [base()];
  }
}

/*-------------------------- closed groups (spec 1.75) --------------------------------*/
/** A group whose chat admits members only also keeps its tasks to its members. */
export function isClosedGroup(group: Pick<GroupModel, 'chatMode'> | undefined): boolean {
  return group?.chatMode === 'members';
}

/** Mirrors taskStaff() in firestore.rules: admin, privileged or eventAdmin. */
export function isTaskStaff(roles: Record<string, boolean> | undefined): boolean {
  return roles?.['admin'] === true || roles?.['privileged'] === true || roles?.['eventAdmin'] === true;
}

/** A person's membership in a group that is not archived and not yet exited (today = StoreDate). */
export function isActiveGroupMembership(
  m: Pick<MembershipModel, 'isArchived' | 'dateOfExit' | 'orgModelType' | 'memberModelType'>,
  today: string,
): boolean {
  if (m.isArchived || m.orgModelType !== 'group' || m.memberModelType !== 'person') return false;
  const exit = m.dateOfExit ?? '';
  return exit === '' || exit >= today;
}
