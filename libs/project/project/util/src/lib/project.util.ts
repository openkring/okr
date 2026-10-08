import { ProjectModel, ProjectModelName, TaskModel } from '@okr/shared-models';
import { addDuration, addIndexElement, DateFormat, isType, parseDate } from '@okr/shared-util-core';

export function isProject(x: unknown, tenantId: string): x is ProjectModel {
  return isType(x, new ProjectModel(tenantId));
}

export function getProjectIndex(p: ProjectModel): string {
  let index = '';
  index = addIndexElement(index, 'n', p.name);
  index = addIndexElement(index, 'sd', p.startDate);
  index = addIndexElement(index, 'pm', p.projectManager?.key ?? '');
  return index;
}

export function getProjectIndexInfo(): string {
  return 'n:name sd:startDate pm:projectManagerKey';
}

/** The task parent tupel 'project.<okey>'; '' (backlog) for an empty key. */
export function getProjectParentKey(projectKey: string): string {
  return projectKey ? `${ProjectModelName}.${projectKey}` : '';
}

/** The project okey of a task's `parentKey`; '' for the backlog, other parent types and legacy docs (undefined). */
export function getProjectKeyOfParent(parentKey: string | undefined): string {
  if (!parentKey) return '';
  // not getModelAndKey: it dies on anything that is not a clean 'type.key' tupel
  const parts = parentKey.split('.');
  return parts.length === 2 && parts[0] === ProjectModelName ? parts[1] : '';
}

/** Moves a full StoreDate by `days`; empty or partial dates (yyyy, yyyymm) are returned unchanged. */
export function shiftStoreDate(date: string | undefined, days: number): string {
  const d = date ?? '';
  if (days === 0 || !/^\d{8}$/.test(d)) return d;
  // an invalid calendar date ('20260230', '00000000') must not abort a whole duplicate: addDuration die()s on it
  if (!parseDate(d, DateFormat.StoreDate, true)) return d;
  return addDuration(d, { days });
}

/** Copies for "duplicate project" (spec 3.14 D9): new docs, re-parented, dates shifted, progress reset. */
export function duplicateProjectTasks(tasks: TaskModel[], deltaDays: number, newParentKey: string, firstState: string): TaskModel[] {
  return tasks
    .filter(t => !t.isArchived)
    .map(t => ({
      ...structuredClone(t),
      okey: '',
      parentKey: newParentKey,
      dueDate: shiftStoreDate(t.dueDate, deltaDays),
      completionDate: '',
      state: firstState,
      relatedKey: '',
      relatedModelType: '',
      linkKey: '',
      linkModelType: '',
    }));
}
