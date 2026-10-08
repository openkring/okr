import { DbQuery, GroupModel, MembershipModel, TaskModel } from '@okr/shared-models';
import { getArchiveInclusiveQuery } from '@okr/shared-util-core';

/*-------------------------- visibility --------------------------------*/
/**
 * The reader scope written with the task (spec 4.106 §4, 3.14 Phase 2). A meeting action item is
 * always scoped to its meeting; otherwise the explicitly chosen group key is kept as is — `calendars[]`
 * is no longer read (it used to carry the group id; scripts/migrate-task-calendars.mjs strips it).
 */
export function getTaskShareKey(task: Pick<TaskModel, 'shareKey' | 'relatedKey'>): string {
  const relatedKey = task.relatedKey ?? '';
  if (relatedKey.startsWith('meeting.')) return relatedKey;
  return task.shareKey ?? '';
}

/** The scope a task created from a list gets: private on the tenant-wide lists, else the group. */
export function getDefaultShareKey(listName: string): string {
  return listName === '' || listName === 'all' || listName === 'my' || isProjectList(listName) ? '' : listName;
}

/** A list named 'project.<okey>' shows the tasks of one project (spec 3.14). */
function isProjectList(listName: string): boolean {
  return listName.startsWith('project.');
}

/** The parent a task created from a list gets: the project of a project list, else the backlog (''). */
export function getDefaultParentKey(listName: string): string {
  return isProjectList(listName) ? listName : '';
}

/*-------------------------- queries --------------------------------*/
export type TaskListScope = {
  kind: 'my' | 'all' | 'shared' | 'parent';
  tenantId: string;
  personKey?: string;   // 'my'
  parentKey?: string;   // 'parent': 'project.<okey>'
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
    case 'parent':
      if (!scope.parentKey) return [];
      return [[...base(), { key: 'parentKey', operator: '==', value: scope.parentKey }]];
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

export type TaskListSource = 'direct' | 'callable' | 'wait';

/**
 * Where a task list is read from (spec 1.75). A group list waits until the groups are loaded:
 * before that a closed group is indistinguishable from an open one, and querying it directly
 * would be refused (and trigger App Check re-attestation). Meeting keys never name a group.
 */
export function getTaskListSource(
  kind: TaskListScope['kind'],
  shareKey: string,
  group: Pick<GroupModel, 'chatMode'> | undefined,
  groupsLoaded: boolean,
): TaskListSource {
  if (kind !== 'shared' || shareKey.startsWith('meeting.')) return 'direct';
  if (isClosedGroup(group)) return 'callable';
  return groupsLoaded ? 'direct' : 'wait';
}
