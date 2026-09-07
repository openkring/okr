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

/**
 * May the user upload a DOCUMENT into this folder with a plain client write?
 *
 * Mirrors the `allow create` branch of `match /docs/{id}` in `firestore.rules`:
 * contentAdmin/privileged unconditionally, everyone else only into a folder that has opted
 * in with `membersMayUpload`. Ownership of the folder is deliberately NOT enough — the rule
 * does not grant it, so offering the upload to a folder owner would only produce a denied
 * write.
 *
 * `membersMayUpload` is absent on every folder created before the flag existed, hence the
 * strict `=== true`: the rule compares `get('membersMayUpload', false) == true`, so an
 * undefined field means NO, and a client that treated it as "unknown, try anyway" would show
 * an upload that always fails.
 *
 * Keep in sync with firestore.rules.
 */
export function canUploadIntoFolder(folder?: FolderModel, currentUser?: UserModel): boolean {
  if (hasRole('contentAdmin', currentUser) || hasRole('privileged', currentUser)) return true;
  // The rule also demands a non-empty personKey — a user without one can never satisfy
  // `authorKey == callerPersonKey()`.
  return folder?.membersMayUpload === true && (currentUser?.personKey ?? '').length > 0;
}
