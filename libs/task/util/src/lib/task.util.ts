import { TaskModel } from '@okr/shared-models';
import { addIndexElement, isType } from '@okr/shared-util-core';

/*-------------------------- type guard --------------------------------*/

export function isTask(task: unknown, tenantId: string): task is TaskModel {
  return isType(task, new TaskModel(tenantId));
}

/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a given task based on its values.
 * @param task 
 * @returns the index string
 */
export function getTaskIndex(task: TaskModel): string {
  let index = '';
  index = addIndexElement(index, 'n', task.name);
  if (task.author) {
    index = addIndexElement(index, 'an', task.author.name1 + ' ' + task.author.name2);
    index = addIndexElement(index, 'ak', task.author.key);
  }
  if (task.assignee) {
    index = addIndexElement(index, 'asn', task.assignee.name1 + ' ' + task.assignee.name2);
    index = addIndexElement(index, 'ask', task.assignee.key);
  }
  return index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getTaskIndexInfo(): string {
  return 'n:name, an:authorname, ak:authorKey, asn:assigneeName, ask:assigneeKey';
}

/*-------------------------- related record --------------------------------*/
/**
 * The routes a task's `relatedKey` can deep-link to, keyed by its model type.
 *
 * `relatedKey` is '<modelType>.<okey>' (spec 1.35, addresses parentKey convention). Only the
 * model types with a screen the user can actually land on are listed: `person`/`group`/`user`
 * have a detail page, `meeting`/`trip` only a list (the url is the one their menu row uses).
 * Everything else — `report.<uuid>` from a Schadenmeldung above all — has NO document behind
 * it, so it gets no link rather than a dead one.
 */
const RELATED_ROUTES: Record<string, (okey: string) => string> = {
  person:  (okey) => `/person/${okey}`,
  group:   (okey) => `/group/${okey}`,
  user:    (okey) => `/user/${okey}`,
  meeting: () => '/meeting/all/meeting-context',
  trip:    () => '/trips/logbuch/c-trips',
};

/** The model type of a `relatedKey` ('meeting.abc' -> 'meeting'), or '' when it is not set. */
export function getRelatedModelType(relatedKey: string | undefined): string {
  return (relatedKey ?? '').split('.')[0] ?? '';
}

/**
 * The url a task's `relatedKey` points at, or '' when there is nothing to navigate to.
 * An empty result is the signal for the UI to hide the back-link row altogether.
 */
export function getRelatedRoute(relatedKey: string | undefined): string {
  const key = relatedKey ?? '';
  const modelType = getRelatedModelType(key);
  const okey = key.slice(modelType.length + 1);
  const route = RELATED_ROUTES[modelType];
  if (!route || !okey) return '';
  return route(okey);
}

/**
 * The icon of a related record, by model type. The names are the ones the corresponding menu
 * rows use in the feature catalogue (`libs/tenant/util/src/lib/feature-blocks.ts`) — icons live
 * in the database, so a made-up name renders blank. '' means: no icon.
 */
const RELATED_ICONS: Record<string, string> = {
  person:  'id-card',
  group:   'persons',
  user:    'people',
  meeting: 'meeting',
  trip:    'track',
};

/** The icon name for a task's `relatedKey`, or '' when its model type has none. */
export function getRelatedIcon(relatedKey: string | undefined): string {
  return RELATED_ICONS[getRelatedModelType(relatedKey)] ?? '';
}
