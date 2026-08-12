// apps/functions/src/auth/account-sync.ts
//
// Membership-driven user-account sync
// (planning/specs/2026-08-12-membership-account-sync-design.md).
//
// A person who gains an active membership in the DEFAULT ORG gets a user account;
// when that membership ends the account is closed and their open group memberships
// are ended (which makes onMembershipWritten remove them from the group Matrix rooms).
//
// Closing deletes the users/{uid} DOCUMENT and leaves the Firebase Auth identity
// intact: every firestore.rules helper derives authorization from userExists()/roles,
// so removing the document revokes access immediately, and the activities entry is
// the audit trail. UserModel.isArchived is deliberately NOT used — nothing reads it
// (neither the guards nor the rules), so archiving would revoke nothing.

import { randomBytes } from 'node:crypto';

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

import { AvatarInfo } from '@okr/shared-models';
import { DateFormat, getTodayStr, isActiveMembership } from '@okr/shared-util-core';

import { decideAccountAction, MembershipDoc } from './account-sync.decide';

const CF_NAME = 'accountSync';

/** Author stamped on activities written by this function. */
const SYSTEM_AUTHOR: AvatarInfo = {
  key: '',
  name1: 'System',
  name2: '',
  modelType: 'user',
  type: '',
  subType: '',
  label: 'System',
};

/** Write one immutable audit entry. Best-effort: never let logging break the operation. */
async function logActivity(
  tenantId: string,
  action: 'create' | 'delete' | 'update',
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const timestamp = getTodayStr(DateFormat.StoreDateTime);
    await getFirestore().collection('activities').add({
      tenants: [tenantId],
      isArchived: false,
      timestamp,
      scope: 'user',
      action,
      roleNeeded: 'admin',
      payload: JSON.stringify(payload),
      author: SYSTEM_AUTHOR,
      index: `t:${timestamp} c:user a:${action} p:System`,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.error(`${CF_NAME}: could not write activity`, error);
  }
}

/**
 * The default org is the org whose okey equals a tenant id, and tenant ids are exactly
 * the app-config document ids. Returns the tenantId, or '' when this org is not a
 * tenant's default org.
 *
 * membership.tenants[0] must NOT be used here: newMembershipForPerson overwrites
 * tenants with person.tenants (membership.util.ts:37) and persons are shared across
 * tenants, so there is no meaningful "first" tenant on a membership.
 */
async function resolveDefaultOrgTenant(m: MembershipDoc | undefined): Promise<string> {
  if (m?.orgModelType !== 'org' || !m.orgKey) return '';
  const snap = await getFirestore().collection('app-config').doc(m.orgKey).get();
  return snap.exists ? m.orgKey : '';
}

/**
 * Cryptographically random password. Nobody ever sees it — the account is onboarded by
 * an admin via AOC → "Passwort senden" — but it protects a real Firebase Auth identity,
 * so it must not come from Math.random.
 */
function randomPassword(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Open a user account for a person. Idempotent: returns early when a users/{uid}
 * document already exists.
 */
export async function openAccount(personKey: string, tenantId: string): Promise<void> {
  const db = getFirestore();

  // 1. favourite e-mail from the address-directory projection (getAddressDirectoryKey)
  const dirSnap = await db.collection('address-directory').doc(`${tenantId}_person.${personKey}`).get();
  const favEmail = (dirSnap.data()?.['favEmail'] as string | undefined) ?? '';
  if (!favEmail) {
    logger.warn(`${CF_NAME}: no favEmail for person ${personKey} — account not opened`);
    await logActivity(tenantId, 'create', { personKey, skipped: 'no email' });
    return;
  }

  const personSnap = await db.collection('persons').doc(personKey).get();
  if (!personSnap.exists) {
    logger.warn(`${CF_NAME}: person ${personKey} not found — account not opened`);
    await logActivity(tenantId, 'create', { personKey, skipped: 'person not found' });
    return;
  }
  const firstName = (personSnap.data()?.['firstName'] as string | undefined) ?? '';
  const lastName = (personSnap.data()?.['lastName'] as string | undefined) ?? '';

  // 2. resolve or create the Firebase Auth identity
  let uid: string;
  try {
    uid = (await getAuth().getUserByEmail(favEmail)).uid;
  } catch {
    const created = await getAuth().createUser({
      email: favEmail,
      password: randomPassword(),
      displayName: `${firstName} ${lastName}`.trim(),
    });
    uid = created.uid;
  }

  // 3. idempotency
  const userRef = db.collection('users').doc(uid);
  if ((await userRef.get()).exists) {
    logger.info(`${CF_NAME}: users/${uid} already exists for person ${personKey} — nothing to do`);
    return;
  }

  // 4. the user document (mirrors createUserFromPerson, adminops.util.ts:209, which is a
  //    client lib and cannot be imported here)
  await userRef.set({
    okey: uid,
    loginEmail: favEmail,
    personKey,
    firstName,
    lastName,
    tenants: [tenantId],
    isArchived: false,
    roles: { registered: true },
    index: `${firstName} ${lastName} ${favEmail}`.toLowerCase(),
    notes: '',
    tags: [],
  });

  logger.info(`${CF_NAME}: opened account users/${uid} for person ${personKey} (${tenantId})`);
  await logActivity(tenantId, 'create', { personKey, uid, loginEmail: favEmail });
}

/**
 * Close a person's user account in a tenant, and end their still-active group
 * memberships there.
 *
 * Idempotent: a person without a user document and without active group memberships
 * is a no-op, so sweep re-runs and repeated writes are harmless.
 */
export async function closeAccount(personKey: string, tenantId: string): Promise<void> {
  const db = getFirestore();
  const today = getTodayStr(DateFormat.StoreDate);

  // 1. delete the user document(s) — the Firebase Auth identity is NOT touched
  const users = await db.collection('users')
    .where('personKey', '==', personKey)
    .where('tenants', 'array-contains', tenantId)
    .get();
  for (const doc of users.docs) {
    await doc.ref.delete();
    logger.info(`${CF_NAME}: closed account users/${doc.id} for person ${personKey} (${tenantId})`);
    await logActivity(tenantId, 'delete', { personKey, uid: doc.id });
  }
  if (users.empty) {
    logger.info(`${CF_NAME}: no user document for person ${personKey} in ${tenantId} — nothing to close`);
  }

  // 2. end still-active group memberships; the write fires onMembershipWritten,
  //    which removes the person from the group's Matrix room
  const groupMemberships = await db.collection('memberships')
    .where('memberKey', '==', personKey)
    .where('memberModelType', '==', 'person')
    .where('orgModelType', '==', 'group')
    .where('tenants', 'array-contains', tenantId)
    .get();

  for (const doc of groupMemberships.docs) {
    const m = doc.data() as MembershipDoc;
    if (!isActiveMembership(m, today)) continue;
    await doc.ref.update({ dateOfExit: today, relIsLast: true });
    logger.info(`${CF_NAME}: ended group membership ${doc.id} (group ${m.orgKey}) for person ${personKey}`);
    await logActivity(tenantId, 'update', { personKey, membershipKey: doc.id, orgKey: m.orgKey, endedBy: 'accountSync' });
  }
}

/**
 * Firestore trigger: open/close the user account when a person's membership in the
 * DEFAULT ORG becomes active or stops being active.
 *
 * A second trigger on memberships/{id} alongside matrix-simple's onMembershipWritten —
 * Firebase supports several triggers per path, and keeping chat sync and account sync
 * separate means a failure in one cannot affect the other.
 *
 * Errors are logged, never thrown: a throw would make Firebase retry and could
 * retry-storm the membership write, and a missed account can always be opened with the
 * syncPersonAccount callable.
 */
export const onMembershipAccountSync = onDocumentWritten(
  { document: 'memberships/{membershipId}', region: 'europe-west6' },
  async (event) => {
    const before = event.data?.before?.exists ? (event.data.before.data() as MembershipDoc) : undefined;
    const after = event.data?.after?.exists ? (event.data.after.data() as MembershipDoc) : undefined;

    try {
      const tenantId = await resolveDefaultOrgTenant(after ?? before);
      if (!tenantId) return; // not a default-org membership

      const today = getTodayStr(DateFormat.StoreDate);
      const action = decideAccountAction(before, after, tenantId, today);
      if (action === 'none') return;

      const personKey = (after ?? before)?.memberKey ?? '';
      if (!personKey) return;
      if (action === 'open') await openAccount(personKey, tenantId);
      else await closeAccount(personKey, tenantId);
    } catch (error) {
      logger.error(`${CF_NAME}: failed for membership ${event.params.membershipId}`, error);
    }
  }
);
