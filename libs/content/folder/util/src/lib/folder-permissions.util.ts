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

/**
 * May the user create/rename/delete this folder with a PLAIN CLIENT WRITE?
 *
 * Deliberately narrower than {@link canEditFolder}: it mirrors the `allow update` and
 * `allow delete` branches of `match /folders/{id}` in `firestore.rules`, which are
 * identical — contentAdmin/privileged, or the folder's owner. Group admin-ship is NOT
 * among them: rules cannot check it, because `GroupModel.admins` is a list of maps. A
 * group admin who fails this check may still rename and delete, but only through the
 * `updateGroupFolder` / `deleteGroupContent` Cloud Functions.
 *
 * Keep in sync with firestore.rules.
 */
export function canWriteFolderDirectly(folder?: FolderModel, currentUser?: UserModel): boolean {
  return hasRole('contentAdmin', currentUser) || hasRole('privileged', currentUser) || isFolderOwner(folder, currentUser);
}
