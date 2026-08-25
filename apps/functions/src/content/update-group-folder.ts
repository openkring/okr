import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { FolderCollection, FolderModel } from '@okr/shared-models';
import { getFolderIndex } from '@okr/content-folder-util';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { assertCallerIsGroupAdmin, db, isInsideGroupFolder, REGION, requireString } from './group-content.util';

const CF_NAME = 'updateGroupFolder';

/**
 * The only fields a group admin may change through this callable — exactly the inputs of
 * `FolderEditModal`/`folder.form.ts`. Everything else (`parents`, `ownerKey`, `tenants`,
 * `okey`, `isArchived`, `index`) is structural and is never taken from the request: a
 * writable `parents` would let an admin graft a foreign folder into their group and then
 * moderate it, and a writable `ownerKey` would hand over the rules-level owner grant.
 */
export interface UpdateGroupFolderRequest {
  tenantId: string;
  groupKey: string;
  okey: string;
  name: string;
  title?: string;
  description?: string;
  tags?: string;
  membersMayUpload?: boolean;
}

export interface UpdateGroupFolderResult {
  okey: string;
}

/** Trim, reject a non-string, and enforce the same max length as `folderValidations`. */
function optionalText(value: unknown, name: string): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${CF_NAME}: ${name} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > SHORT_NAME_LENGTH) {
    throw new HttpsError('invalid-argument', `${CF_NAME}: ${name} is longer than ${SHORT_NAME_LENGTH} characters.`);
  }
  return trimmed;
}

/**
 * Rename a folder / toggle `membersMayUpload` inside a group's files segment, on behalf of
 * a GROUP ADMIN — the update twin of `deleteGroupContent`, and it exists for the same
 * reason: `match /folders/{id}`'s `allow update` branch knows content managers and the
 * folder's owner, and `firestore.rules` cannot check group admin-ship because
 * `GroupModel.admins` is a list of maps.
 *
 * Unlike the delete path this DOES accept the group's own root folder (`okey == groupKey`)
 * — renaming it or opening it for member uploads is a normal thing for a group admin to
 * want, and it strands nothing.
 *
 * `index` is recomputed server-side with the same `getFolderIndex` the client uses, so a
 * folder renamed here stays findable by the search filter.
 */
export const updateGroupFolder = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<UpdateGroupFolderRequest>): Promise<UpdateGroupFolderResult> => {
    checkAppCheckToken(request, CF_NAME);
    checkAuthentication(request, CF_NAME);

    const data0 = request.data ?? ({} as UpdateGroupFolderRequest);
    const tenantId = requireString(data0.tenantId, 'tenantId', CF_NAME);
    const groupKey = requireString(data0.groupKey, 'groupKey', CF_NAME);
    const okey = requireString(data0.okey, 'okey of the folder to update', CF_NAME);

    const name = optionalText(requireString(data0.name, 'folder name', CF_NAME), 'name');
    if (name === '') throw new HttpsError('invalid-argument', `${CF_NAME} requires a folder name.`);
    const title = optionalText(data0.title, 'title');
    const description = optionalText(data0.description, 'description');
    const tags = optionalText(data0.tags, 'tags');
    if (data0.membersMayUpload !== undefined && typeof data0.membersMayUpload !== 'boolean') {
      throw new HttpsError('invalid-argument', `${CF_NAME}: membersMayUpload must be a boolean.`);
    }
    const membersMayUpload = data0.membersMayUpload === true;

    // See the identical note in deleteGroupContent: checkAuthentication throws, but TS
    // cannot narrow through it, and doc('') would fail with a confusing internal error.
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', `${CF_NAME} requires an authenticated caller.`);

    const firestore = db();
    const personKey = await assertCallerIsGroupAdmin(firestore, uid, tenantId, groupKey,
      'Nur Gruppen-Administratoren dürfen Ordner dieser Gruppe ändern.');

    const ref = firestore.collection(FolderCollection).doc(okey);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', `${FolderCollection}/${okey} does not exist.`);
    const existing = snap.data() ?? {};
    if (!((existing['tenants'] ?? []) as string[]).includes(tenantId)) {
      throw new HttpsError('permission-denied', 'The folder belongs to a different tenant.');
    }
    // Containment starts at the folder ITSELF (not its parent) — the root folder is a
    // legitimate target here, and `isInsideGroupFolder` treats `okey == groupKey` as inside.
    if (!(await isInsideGroupFolder(firestore, okey, groupKey, tenantId))) {
      throw new HttpsError('permission-denied', 'Der Ordner gehört nicht zu dieser Gruppe.');
    }

    const patch = { name, title, description, tags, membersMayUpload };
    await ref.update({ ...patch, index: getFolderIndex({ ...existing, ...patch } as FolderModel) });

    logger.info(`${CF_NAME}: updated ${FolderCollection}/${okey} in group ${groupKey} (tenant=${tenantId}, by=${personKey})`);
    return { okey };
  },
);
