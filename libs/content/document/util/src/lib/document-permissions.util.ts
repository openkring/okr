import { DocumentModel, FolderModel, UserModel } from '@okr/shared-models';
import { hasRole } from '@okr/shared-util-core';

// Same role set as canManageFolders in @okr/content-folder-util — kept local to avoid a
// document/util → folder/util dependency for three lines.
function canManageDocuments(currentUser?: UserModel, isGroupAdmin = false): boolean {
  return hasRole('contentAdmin', currentUser) || hasRole('privileged', currentUser) || isGroupAdmin;
}

/** The document's author (uploader). Legacy docs without authorKey never match. */
export function isDocumentAuthor(doc?: DocumentModel, currentUser?: UserModel): boolean {
  const authorKey = doc?.authorKey ?? '';
  return authorKey.length > 0 && authorKey === currentUser?.personKey;
}

/** May the user add files to the given folder? Members only into membersMayUpload folders. */
export function canUploadToFolder(folder?: FolderModel, currentUser?: UserModel, isGroupAdmin = false): boolean {
  if (canManageDocuments(currentUser, isGroupAdmin)) return true;
  return folder?.membersMayUpload === true && hasRole('registered', currentUser);
}

/** May the user edit the metadata / upload a new version of the given document? */
export function canEditDocument(doc?: DocumentModel, folder?: FolderModel, currentUser?: UserModel, isGroupAdmin = false): boolean {
  if (canManageDocuments(currentUser, isGroupAdmin)) return true;
  return folder?.membersMayUpload === true && isDocumentAuthor(doc, currentUser);
}

/**
 * May the user delete the given document? Deliberately narrower than edit:
 * admin and group-admin (moderation), or the author on their own upload.
 */
export function canDeleteDocument(doc?: DocumentModel, folder?: FolderModel, currentUser?: UserModel, isGroupAdmin = false): boolean {
  if (hasRole('admin', currentUser) || isGroupAdmin) return true;
  return folder?.membersMayUpload === true && isDocumentAuthor(doc, currentUser);
}

/**
 * May the user delete this document with a PLAIN CLIENT WRITE?
 *
 * Mirrors the `allow delete` branch of `match /docs/{id}` in `firestore.rules`: admin, the
 * author, or the owner of the document's FIRST folder (`folderKeys[0]` — the rules read
 * exactly that entry). Group admin-ship is not among them and cannot be, because rules
 * cannot scan `GroupModel.admins` (a list of maps); a group admin who fails this check
 * deletes through the `deleteGroupContent` Cloud Function instead.
 *
 * Keep in sync with firestore.rules.
 */
export function canDeleteDocumentDirectly(doc?: DocumentModel, folder?: FolderModel, currentUser?: UserModel): boolean {
  if (hasRole('admin', currentUser)) return true;
  if (isDocumentAuthor(doc, currentUser)) return true;
  const primaryFolderKey = doc?.folderKeys?.[0] ?? '';
  const ownerKey = folder?.ownerKey ?? '';
  return primaryFolderKey !== '' && primaryFolderKey === folder?.okey
    && ownerKey !== '' && ownerKey === currentUser?.personKey;
}
