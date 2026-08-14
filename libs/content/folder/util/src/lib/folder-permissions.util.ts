import { FolderModel, UserModel } from '@okr/shared-models';
import { hasRole } from '@okr/shared-util-core';

/**
 * Roles that may create/edit/delete folders (and documents) in the docs-list:
 * contentAdmin, privileged, admin — plus group-admins within their group view.
 */
export function canManageFolders(currentUser?: UserModel, isGroupAdmin = false): boolean {
  return hasRole('contentAdmin', currentUser) || hasRole('privileged', currentUser) || isGroupAdmin;
}

/** The folder's owner (creator) may edit/delete it even without a global role. */
export function isFolderOwner(folder?: FolderModel, currentUser?: UserModel): boolean {
  const ownerKey = folder?.ownerKey ?? ''; // legacy folders have no ownerKey
  return ownerKey.length > 0 && ownerKey === currentUser?.personKey;
}

/** May the user rename/edit or delete the given folder? */
export function canEditFolder(folder?: FolderModel, currentUser?: UserModel, isGroupAdmin = false): boolean {
  return canManageFolders(currentUser, isGroupAdmin) || isFolderOwner(folder, currentUser);
}
