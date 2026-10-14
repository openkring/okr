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
}

export interface ResourceActionTarget {
  hasResource: boolean;   // the row points to a resource
  hasOwnership: boolean;  // there is a Nutzung to show (the row's own, or the resource's current one)
  isOngoing: boolean;     // that Nutzung has not ended yet
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
}

export function getResourceActionEntries(perm: ResourceActionPermissions, target: ResourceActionTarget, labels: ResourceActionLabels): ActionSheetEntry[] {
  if (!perm.canRead) return [];
  const entries: ActionSheetEntry[] = [];

  if (target.hasResource) {
    const actions: ActionSheetAction[] = [{ action: RESOURCE_ACTION.resourceView, text: labels.view, icon: 'eye-on' }];
    if (perm.canWrite) actions.push({ action: RESOURCE_ACTION.resourceEdit, text: labels.edit, icon: 'edit' });
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
