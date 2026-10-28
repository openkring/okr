import type { ActionSheetAction, ActionSheetEntry } from '@okr/shared-util-angular';

/**
 * The two-level ActionSheet shared by every resource list (resource/all, rboat/all, locker, key) and
 * every ownership list (privateBoats, scsBoats, lockers, keys, all):
 *
 *   «<resource type>…»  → … anzeigen | … ändern | … archivieren | … löschen
 *   «Nutzer/in anzeigen»
 *   «Nutzung…»          → … hinzufügen | … anzeigen | … ändern | … beenden | … archivieren | … löschen
 *
 * registered = read only, resourceAdmin = write (ändern, hinzufügen, beenden),
 * admin = archivieren (isArchived) and löschen (physical delete).
 */
export const RESOURCE_ACTION = {
  resourceView:     'resource.view',
  resourceEdit:     'resource.edit',
  resourceArchive:  'resource.archive',
  resourceDelete:   'resource.delete',
  resourceLock:     'resource.lock',
  resourceUnlock:   'resource.unlock',
  ownerView:        'owner.view',
  ownershipAdd:     'ownership.add',
  ownershipView:    'ownership.view',
  ownershipEdit:    'ownership.edit',
  ownershipEnd:     'ownership.end',
  ownershipArchive: 'ownership.archive',
  ownershipDelete:  'ownership.delete',
} as const;

export type ResourceAction = typeof RESOURCE_ACTION[keyof typeof RESOURCE_ACTION];

export interface ResourceActionPermissions {
  canRead: boolean;     // registered
  canWrite: boolean;    // resourceAdmin
  isAdmin: boolean;     // admin
  canLock?: boolean;    // privileged or resourceAdmin: may lock / unlock a rowing boat
}

export interface ResourceActionTarget {
  hasResource: boolean;   // the row points to a resource
  hasOwnership: boolean;  // there is a Nutzung to show (the row's own, or the resource's current one)
  isOngoing: boolean;     // that Nutzung has not ended yet
  isLockable?: boolean;   // the resource can be locked (rowing boats only)
  isLocked?: boolean;     // it is locked right now (an active lock reservation)
}

/** Translated labels; verbs alone (e.g. 'anzeigen'), they are combined with the group noun. */
export interface ResourceActionLabels {
  resource: string;       // label of the resource type category item, e.g. 'Ruderboot'
  resourceIcon?: string;
  ownership: string;      // 'Nutzung'
  ownerView: string;      // 'Nutzer/in anzeigen'
  add: string;
  view: string;
  edit: string;
  end: string;
  archive: string;
  delete: string;
  lock?: string;          // 'sperren'
  unlock?: string;        // 'Sperrung aufheben'
}

export function getResourceActionEntries(perm: ResourceActionPermissions, target: ResourceActionTarget, labels: ResourceActionLabels): ActionSheetEntry[] {
  if (!perm.canRead) return [];
  const entries: ActionSheetEntry[] = [];

  if (target.hasResource) {
    const actions: ActionSheetAction[] = [{ action: RESOURCE_ACTION.resourceView, text: labels.view, icon: 'eye-on' }];
    if (perm.canWrite) actions.push({ action: RESOURCE_ACTION.resourceEdit, text: labels.edit, icon: 'edit' });
    // a locked boat offers only the way back, an unlocked one only the lock
    if (perm.canLock && target.isLockable) {
      actions.push(target.isLocked ?
        { action: RESOURCE_ACTION.resourceUnlock, text: labels.unlock ?? '', icon: 'lock-open' } :
        { action: RESOURCE_ACTION.resourceLock, text: labels.lock ?? '', icon: 'lock-closed' });
    }
    if (perm.isAdmin) {
      actions.push({ action: RESOURCE_ACTION.resourceArchive, text: labels.archive, icon: 'archive' });
      actions.push({ action: RESOURCE_ACTION.resourceDelete, text: labels.delete, icon: 'trash' });
    }
    entries.push({ text: labels.resource, icon: labels.resourceIcon, actions });
  }

  if (target.hasOwnership) {
    entries.push({ action: RESOURCE_ACTION.ownerView, text: labels.ownerView, icon: 'person' });
  }

  const ownershipActions: ActionSheetAction[] = [];
  if (perm.canWrite && target.hasResource) ownershipActions.push({ action: RESOURCE_ACTION.ownershipAdd, text: labels.add, icon: 'add' });
  if (target.hasOwnership) {
    ownershipActions.push({ action: RESOURCE_ACTION.ownershipView, text: labels.view, icon: 'eye-on' });
    if (perm.canWrite) {
      ownershipActions.push({ action: RESOURCE_ACTION.ownershipEdit, text: labels.edit, icon: 'edit' });
      if (target.isOngoing) ownershipActions.push({ action: RESOURCE_ACTION.ownershipEnd, text: labels.end, icon: 'stop-circle' });
    }
    if (perm.isAdmin) {
      ownershipActions.push({ action: RESOURCE_ACTION.ownershipArchive, text: labels.archive, icon: 'archive' });
      ownershipActions.push({ action: RESOURCE_ACTION.ownershipDelete, text: labels.delete, icon: 'trash' });
    }
  }
  entries.push({ text: labels.ownership, icon: 'link', actions: ownershipActions });

  return entries;
}
