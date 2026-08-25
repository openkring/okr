import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';

import { DocumentCollection, FolderCollection } from '@okr/shared-models';
import { getDeletePatch } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import {
  assertCallerIsGroupAdmin, db, folderHasContent, isInsideGroupFolder, REGION, requireString,
} from './group-content.util';

const CF_NAME = 'deleteGroupContent';

export type GroupContentTarget = 'folder' | 'document';

export interface DeleteGroupContentRequest {
  tenantId: string;
  groupKey: string;
  target: GroupContentTarget;
  okey: string;
}

export interface DeleteGroupContentResult {
  /** 'archived' → isArchived was set; 'detached' → the tenant was removed from `tenants`. */
  action: 'archived' | 'detached';
}

/**
 * Delete (= archive, or detach from the tenant) a folder or a document that lives inside
 * a group's files segment, on behalf of a GROUP ADMIN.
 *
 * Why a Cloud Function: `firestore.rules` can only grant folder/document deletion to a
 * content manager, the folder owner, or the document's author — it cannot check group
 * admin-ship, because `GroupModel.admins` is an `AvatarInfo[]` (a list of maps) and rules
 * have no way to scan a list of maps for a field value. Everything a group admin may
 * delete beyond those rule branches therefore goes through here, where the Admin SDK can
 * read the group doc and compare `admins[].key` against the caller's personKey.
 *
 * Deletion semantics are identical to the client path (`FirestoreService.deleteModel`):
 * `getDeletePatch` detaches the tenant when the doc is shared and only archives when this
 * was the last tenant. Nothing is ever hard-deleted, and Storage files are left in place —
 * exactly like `DocumentService.delete`.
 */
export const deleteGroupContent = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<DeleteGroupContentRequest>): Promise<DeleteGroupContentResult> => {
    checkAppCheckToken(request, CF_NAME);
    checkAuthentication(request, CF_NAME);

    const data0 = request.data ?? ({} as DeleteGroupContentRequest);
    const tenantId = requireString(data0.tenantId, 'tenantId', CF_NAME);
    const groupKey = requireString(data0.groupKey, 'groupKey', CF_NAME);
    const okey = requireString(data0.okey, 'okey of the item to delete', CF_NAME);
    const target = data0.target;
    if (target !== 'folder' && target !== 'document') {
      throw new HttpsError('invalid-argument', `${CF_NAME}: target must be 'folder' or 'document'.`);
    }

    // `checkAuthentication` throws when request.auth is missing, but TypeScript cannot
    // narrow through it — fail loudly rather than coalescing to '' and hitting a raw
    // Firestore INVALID_ARGUMENT on doc('').
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', `${CF_NAME} requires an authenticated caller.`);

    const firestore = db();
    const personKey = await assertCallerIsGroupAdmin(firestore, uid, tenantId, groupKey,
      'Nur Gruppen-Administratoren dürfen Dateien und Ordner dieser Gruppe löschen.');

    // --- target ------------------------------------------------------------------
    const collection = target === 'folder' ? FolderCollection : DocumentCollection;
    const ref = firestore.collection(collection).doc(okey);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', `${collection}/${okey} does not exist.`);
    const data = snap.data() ?? {};
    const tenants = (data['tenants'] ?? []) as string[];
    if (!tenants.includes(tenantId)) {
      throw new HttpsError('permission-denied', 'The item belongs to a different tenant.');
    }

    // --- containment: the item must live inside THIS group's folder tree ----------
    if (target === 'folder') {
      // The group's root folder is the segment itself — deleting it would strand every
      // document inside it and break the files tab, so it is never a valid target.
      if (okey === groupKey) {
        throw new HttpsError('failed-precondition', 'Der Stammordner der Gruppe kann nicht gelöscht werden.');
      }
      const parentKey = ((data['parents'] ?? []) as string[])[0];
      if (!parentKey || !(await isInsideGroupFolder(firestore, parentKey, groupKey, tenantId))) {
        throw new HttpsError('permission-denied', 'Der Ordner gehört nicht zu dieser Gruppe.');
      }
      if (await folderHasContent(firestore, okey)) {
        throw new HttpsError('failed-precondition', 'Der Ordner ist nicht leer.');
      }
    } else {
      const folderKey = ((data['folderKeys'] ?? []) as string[])[0];
      if (!folderKey || !(await isInsideGroupFolder(firestore, folderKey, groupKey, tenantId))) {
        throw new HttpsError('permission-denied', 'Die Datei gehört nicht zu dieser Gruppe.');
      }
    }

    // --- delete = detach or archive (identical to FirestoreService.deleteModel) ---
    const patch = getDeletePatch(tenants, tenantId);
    await ref.update({ ...patch });
    const action = 'isArchived' in patch ? 'archived' : 'detached';

    logger.info(`${CF_NAME}: ${action} ${collection}/${okey} in group ${groupKey} (tenant=${tenantId}, by=${personKey})`);
    return { action };
  },
);
