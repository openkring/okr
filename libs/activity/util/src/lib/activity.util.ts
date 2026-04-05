import { ActivityModel } from '@bk2/shared-models';
import { RoleName } from '@bk2/shared-models';
import { addIndexElement, isType } from '@bk2/shared-util-core';

/*-------------------------- type guard --------------------------------*/

export function isActivity(obj: unknown, tenantId: string): obj is ActivityModel {
  return isType(obj, new ActivityModel(tenantId));
}

/*-------------------------- search index --------------------------------*/

/**
 * Build the search index for an activity.
 * Format: t:<timestamp> c:<scope> a:<action> p:<author-name>
 */
export function getActivityIndex(activity: ActivityModel): string {
  let index = '';
  index = addIndexElement(index, 't', activity.timestamp);
  index = addIndexElement(index, 'c', activity.scope);
  index = addIndexElement(index, 'a', activity.action);
  if (activity.author) {
    index = addIndexElement(index, 'p', `${activity.author.name1} ${activity.author.name2}`.trim());
  }
  return index;
}

export function getActivityIndexInfo(): string {
  return 't:timestamp, c:scope, a:action, p:authorName';
}

/*-------------------------- roleNeeded --------------------------------*/

/**
 * Activities that are visible to 'registered' users (not admin-only).
 * All other scope+action combinations default to 'admin'.
 */
const REGISTERED_ACTIVITIES: Array<{ scope: string; action: string }> = [
  { scope: 'membership', action: 'create' },   // entry
  { scope: 'membership', action: 'delete' },   // exit
  { scope: 'membership', action: 'update' },   // category change
  { scope: 'person',     action: 'create' },   // birth
  { scope: 'person',     action: 'delete' },   // death
  { scope: 'org',        action: 'create' },   // foundation
  { scope: 'org',        action: 'delete' },   // liquidation
];

/**
 * Returns the minimum RoleName required to see a given activity.
 */
export function getActivityRoleNeeded(scope: string, action: string): RoleName {
  const isRegistered = REGISTERED_ACTIVITIES.some(r => r.scope === scope && r.action === action);
  return isRegistered ? 'registered' : 'admin';
}
