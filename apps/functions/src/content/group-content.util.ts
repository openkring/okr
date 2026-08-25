import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

import { DocumentCollection, FolderCollection, GroupCollection, UserCollection } from '@okr/shared-models';

export const REGION = 'europe-west6';

/**
 * How far up the `parents[0]` chain the containment check walks before giving up.
 * Matches `FolderService.loadBreadcrumbTrail`'s maxDepth (5) with headroom — a folder
 * nested deeper than this inside a group is not reachable through the breadcrumb UI
 * either, so refusing it loses nothing.
 */
const MAX_FOLDER_DEPTH = 10;

/**
 * Verify that the caller is an admin of `groupKey` and that both the caller and the group
 * belong to `tenantId`. Returns the caller's personKey (never '').
 *
 * This is the check `firestore.rules` cannot make: group admin-ship lives in
 * `GroupModel.admins`, an `AvatarInfo[]`, and rules have no way to scan a list of maps
 * for a field value. Every group-admin write in this module goes through here first.
 */
export async function assertCallerIsGroupAdmin(
  db: Firestore, uid: string, tenantId: string, groupKey: string, deniedMessage: string,
): Promise<string> {
  const userSnap = await db.collection(UserCollection).doc(uid).get();
  if (!userSnap.exists) throw new HttpsError('permission-denied', 'No user document for the caller.');
  const personKey: string = userSnap.data()?.['personKey'] ?? '';
  const callerTenants: string[] = userSnap.data()?.['tenants'] ?? [];
  if (personKey === '') throw new HttpsError('permission-denied', 'The caller has no personKey.');
  if (!callerTenants.includes(tenantId)) {
    throw new HttpsError('permission-denied', 'Caller does not belong to this tenant.');
  }

  const groupSnap = await db.collection(GroupCollection).doc(groupKey).get();
  if (!groupSnap.exists) throw new HttpsError('not-found', `Group ${groupKey} does not exist.`);
  const groupData = groupSnap.data() ?? {};
  if (!((groupData['tenants'] ?? []) as string[]).includes(tenantId)) {
    throw new HttpsError('permission-denied', 'The group belongs to a different tenant.');
  }
  const admins = (groupData['admins'] ?? []) as { key?: string }[];
  if (!admins.some(a => a?.key === personKey)) throw new HttpsError('permission-denied', deniedMessage);

  return personKey;
}

/**
 * Walk `parents[0]` upward from `folderKey` and report whether the chain reaches
 * `groupKey` (the group's root folder, whose okey IS the group key — spec 1.22).
 * The root folder itself counts as inside the group.
 */
export async function isInsideGroupFolder(
  db: Firestore, folderKey: string, groupKey: string, tenantId: string,
): Promise<boolean> {
  let currentKey: string | undefined = folderKey;
  for (let depth = 0; currentKey && depth < MAX_FOLDER_DEPTH; depth++) {
    if (currentKey === groupKey) return true;
    const snap = await db.collection(FolderCollection).doc(currentKey).get();
    if (!snap.exists) return false;
    const data = snap.data() ?? {};
    // A folder of another tenant can never be part of this tenant's group tree.
    if (!((data['tenants'] ?? []) as string[]).includes(tenantId)) return false;
    currentKey = ((data['parents'] ?? []) as string[])[0];
  }
  return false;
}

/** True when the folder still holds a subfolder or a document — mirrors DocumentStore.deleteFolder. */
export async function folderHasContent(db: Firestore, folderKey: string): Promise<boolean> {
  const [children, docs] = await Promise.all([
    db.collection(FolderCollection).where('parents', 'array-contains', folderKey).limit(1).get(),
    db.collection(DocumentCollection).where('folderKeys', 'array-contains', folderKey).limit(1).get(),
  ]);
  return !children.empty || !docs.empty;
}

/** Reject a missing/blank string argument with a consistent `invalid-argument` error. */
export function requireString(value: unknown, name: string, cfName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpsError('invalid-argument', `${cfName} requires a ${name}.`);
  }
  return value;
}

/** The Admin-SDK Firestore handle — one line, kept here so both callables agree. */
export function db(): Firestore {
  return getFirestore();
}
