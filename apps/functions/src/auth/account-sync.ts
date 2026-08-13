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
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';

import { AvatarInfo, UserModel } from '@okr/shared-models';
import { DateFormat, getTodayStr, isActiveMembership } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, checkRoles } from '@okr/shared-util-functions';
import { getUserIndex } from '@okr/user-util';

import { runWorkflow } from '../workflow';

import { decideAccountAction, MembershipDoc, shiftDaysBack } from './account-sync.decide';

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

  // 4. the user document. Built from `new UserModel(tenantId)` rather than a hand-written
  //    field list, so every default (settings, delivery prefs and especially the usage*
  //    privacy flags) is materialized. Firestore reads do NOT apply model defaults — a
  //    field missing from the document reads back as undefined, so a partially written
  //    user would have undefined privacy flags instead of PrivacyUsage.Restricted.
  const user = new UserModel(tenantId);
  user.okey = uid;
  user.loginEmail = favEmail;
  user.personKey = personKey;
  user.firstName = firstName;
  user.lastName = lastName;
  user.roles = { registered: true };
  user.index = getUserIndex(user);
  await userRef.set({ ...user });

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
 * Hand a domain event to the workflow engine (spec 1.35). Consequences beyond the
 * account invariant — "tell the treasurer", "check the keys" — are tenant-scoped rules
 * in `workflow-rules`, not code.
 *
 * Best-effort: runWorkflow never throws, and a swallowed rule must not affect the
 * membership write.
 */
async function emitMembershipEvent(
  event: string,
  m: MembershipDoc | undefined,
  membershipId: string,
  tenantId: string,
  today: string,
): Promise<void> {
  if (!m?.memberKey) return;
  await runWorkflow({
    tenantId,
    event,
    personKey: m.memberKey,
    relatedKey: `membership.${membershipId}`,
    subjectName: `${m.memberName1 ?? ''} ${m.memberName2 ?? ''}`.trim(),
    subjectCategory: m.category ?? '',
    today,
  });
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

      const personKey = (after ?? before)?.memberKey ?? '';
      if (!personKey) return;

      // 1. the invariant: opening/closing the account stays in code, never in a rule
      if (action === 'open') await openAccount(personKey, tenantId);
      if (action === 'close') await closeAccount(personKey, tenantId);

      // 2. the policy: whatever else should happen is data (spec 1.35). Emitted here
      //    because this function has already computed before/after, the tenant and the
      //    active-state transition — one definition of "ended", not two.
      const membershipId = event.params.membershipId;
      if (action === 'open') await emitMembershipEvent('membership.created', after ?? before, membershipId, tenantId, today);
      if (action === 'close') await emitMembershipEvent('membership.ended', after ?? before, membershipId, tenantId, today);
      if (action === 'none' && before && after && (before.category ?? '') !== (after.category ?? '')) {
        await emitMembershipEvent('membership.categoryChanged', after, membershipId, tenantId, today);
      }
    } catch (error) {
      logger.error(`${CF_NAME}: failed for membership ${event.params.membershipId}`, error);
    }
  }
);

/**
 * Daily sweep: close accounts whose membership exit date has passed since the last run.
 *
 * A date-aware predicate has no write to react to on the day an exit date takes effect,
 * so the trigger alone would never close these. closeAccount is idempotent, so an
 * overlapping window is harmless.
 */
export const sweepExpiredMemberships = onSchedule(
  { schedule: '30 3 * * *', timeZone: 'Europe/Zurich', region: 'europe-west6' },
  async () => {
    const today = getTodayStr(DateFormat.StoreDate);
    // ponytail: 7-day catch-up window. If runs can be missed for longer, store a
    // watermark document instead of widening this.
    const from = shiftDaysBack(today, 7);

    const expired = await getFirestore().collection('memberships')
      .where('dateOfExit', '>=', from)
      .where('dateOfExit', '<=', today)
      .get();

    let closed = 0;
    for (const doc of expired.docs) {
      const m = doc.data() as MembershipDoc;
      try {
        if (m.memberModelType !== 'person') continue;
        if (isActiveMembership(m, today)) continue; // not expired after all
        const tenantId = await resolveDefaultOrgTenant(m);
        if (!tenantId) continue;
        await closeAccount(m.memberKey, tenantId);
        // Emit only on the day the exit date takes effect. closeAccount is idempotent
        // and the catch-up window is 7 days wide, so an unconditional emit would re-fire
        // the event every day for a week — and dedup only protects an OPEN task.
        if (m.dateOfExit === today) {
          await emitMembershipEvent('membership.ended', m, doc.id, tenantId, today);
        }
        closed++;
      } catch (error) {
        logger.error(`${CF_NAME}: sweep failed for membership ${doc.id}`, error);
      }
    }
    logger.info(`${CF_NAME}: sweep processed ${expired.size} expired memberships, closed ${closed}`);
  }
);

/**
 * Manual entry point for the person-list actions. Calls exactly the same
 * openAccount/closeAccount as the trigger — one implementation, two entry points.
 */
export const syncPersonAccount = onCall(
  { cors: true, region: 'europe-west6', enforceAppCheck: true },
  async (request: CallableRequest<{ personKey?: string; tenantId?: string; action?: string }>) => {
    checkAppCheckToken(request as never, 'syncPersonAccount');
    checkAuthentication(request as never, 'syncPersonAccount');
    await checkRoles(request as never, 'syncPersonAccount', ['admin', 'memberAdmin']);

    const personKey = request.data?.personKey ?? '';
    const tenantId = request.data?.tenantId ?? '';
    const action = request.data?.action ?? '';
    if (!personKey || !tenantId) {
      throw new HttpsError('invalid-argument', 'personKey and tenantId are required');
    }
    if (action !== 'open' && action !== 'close') {
      throw new HttpsError('invalid-argument', "action must be 'open' or 'close'");
    }

    if (action === 'open') await openAccount(personKey, tenantId);
    else await closeAccount(personKey, tenantId);
    return { ok: true };
  }
);
