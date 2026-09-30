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

import { getFirestore, DocumentReference, FieldValue } from 'firebase-admin/firestore';
import { getAuth, UserRecord } from 'firebase-admin/auth';
import { logger } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';

import { AvatarInfo, UserModel } from '@okr/shared-models';
import { DateFormat, getTodayStr, isActiveMembership } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';
import { getUserIndex, isSyntheticLoginEmail, syntheticLoginEmail } from '@okr/user-util';

import { runWorkflow } from '../workflow';

import { decideAccountAction, MembershipDoc, relLogAbbrs, shiftDaysBack } from './account-sync.decide';
import { allocateLoginId, tenantAppDomain } from './login-id';
import { decideLoginIdentity, decideOwnAccount, PERSON_KEY_CLAIM } from './login-id.decide';

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

/** What `openAccount` did, for a caller that has to report it back to a user. */
export type OpenAccountOutcome = 'created' | 'createdWithLoginId' | 'exists' | 'noEmail' | 'noPerson';

export interface OpenAccountResult {
  readonly outcome: OpenAccountOutcome;
  readonly uid?: string;
  readonly loginEmail?: string;
  readonly loginId?: string;
  /** Set for 'createdWithLoginId': whose account holds the favourite email. */
  readonly emailOwnerPersonKey?: string;
}

/**
 * Open a user account for a person (spec 1.71 §5.3). Idempotent: returns 'exists' when the
 * favourite email already belongs to THIS person's users/{uid} document, or when the person
 * already holds an account in the tenant under another login (at most one per person and tenant).
 * Every Auth identity it creates or reuses is stamped with the `okrPersonKey` claim, so an
 * orphaned identity is never handed to a different person.
 *
 * When the email belongs to ANOTHER person's account (a parent and a child sharing one
 * mailbox), the account is opened with a Benutzername and a synthetic, never-mailable Auth
 * email (`<loginId>@login.<domain>`) instead — outcome 'createdWithLoginId'. Every account
 * gets a Benutzername either way.
 *
 * `loginEmail` overrides the address-directory favourite. The membership trigger has no
 * choice to offer and passes nothing; the tenant allocation (spec 1.47) passes the address
 * the admin picked, because there the projection belongs to the ACTING tenant while the
 * account is being opened for the TARGET one — the favourite of the wrong tenant, or of no
 * tenant at all when the target has not projected this person yet.
 */
export async function openAccount(personKey: string, tenantId: string, loginEmail?: string): Promise<OpenAccountResult> {
  const db = getFirestore();

  // 1. the caller's pick, else the favourite e-mail from the address-directory projection
  //    (getAddressDirectoryKey)
  let favEmail = loginEmail?.trim() ?? '';
  if (!favEmail) {
    const dirSnap = await db.collection('address-directory').doc(`${tenantId}_person.${personKey}`).get();
    favEmail = (dirSnap.data()?.['favEmail'] as string | undefined) ?? '';
  }
  if (!favEmail) {
    logger.warn(`${CF_NAME}: no favEmail for person ${personKey} — account not opened`);
    await logActivity(tenantId, 'create', { personKey, skipped: 'no email' });
    return { outcome: 'noEmail' };
  }

  const personSnap = await db.collection('persons').doc(personKey).get();
  if (!personSnap.exists) {
    logger.warn(`${CF_NAME}: person ${personKey} not found — account not opened`);
    await logActivity(tenantId, 'create', { personKey, skipped: 'person not found' });
    return { outcome: 'noPerson' };
  }
  const firstName = (personSnap.data()?.['firstName'] as string | undefined) ?? '';
  const lastName = (personSnap.data()?.['lastName'] as string | undefined) ?? '';

  // 2. whose Auth identity is the favourite email — decides real vs. synthetic (spec §5.3)
  let authUser: UserRecord | undefined;
  try {
    authUser = await getAuth().getUserByEmail(favEmail);
  } catch {
    authUser = undefined;
  }
  const authUid = authUser?.uid;
  const claimPersonKey = authUser?.customClaims?.[PERSON_KEY_CLAIM] as string | undefined;
  const holderSnap = authUid ? await db.collection('users').doc(authUid).get() : undefined;
  const holderPersonKey = holderSnap?.exists ? String(holderSnap.data()?.['personKey'] ?? '') : undefined;
  const identity = decideLoginIdentity(authUid, holderPersonKey, personKey, claimPersonKey);

  if (identity === 'exists') {
    logger.info(`${CF_NAME}: users/${authUid} already exists for person ${personKey} — nothing to do`);
    return { outcome: 'exists', uid: authUid, loginEmail: favEmail, loginId: String(holderSnap?.data()?.['loginId'] ?? '') };
  }

  const displayName = `${firstName} ${lastName}`.trim();
  // whose login the favourite email is, for the Benutzername report: the live holder, else the stamp
  const emailOwnerPersonKey = holderPersonKey || claimPersonKey || undefined;
  const synthetic: SyntheticContext = { tenantId, personKey, displayName, emailHeldBy: authUid, emailOwnerPersonKey };

  // 3. at most one account per person and tenant, whatever the email resolves to today. Without
  //    this, the favourite email of a child who already has a Benutzername account still names the
  //    parent's identity (→ 'synthetic' again), or — after the parent left — an orphan ('reuse') or
  //    nothing ('createReal'), and every repeated open would add another account. Same query shape
  //    as closeAccount — no new index. Two opens of the same person running at the very same time
  //    can both pass this check; the triggers and callables that call openAccount do not do that
  //    in practice, and it is not locked.
  const own = await db.collection('users')
    .where('personKey', '==', personKey)
    .where('tenants', 'array-contains', tenantId)
    .limit(1)
    .get();
  const ownDoc = own.docs[0];
  const ownAction = decideOwnAccount(identity, ownDoc ? { loginEmail: String(ownDoc.data()['loginEmail'] ?? '') } : undefined);
  if (ownDoc && ownAction === 'exists') {
    logger.info(`${CF_NAME}: users/${ownDoc.id} already exists for person ${personKey} — nothing to do`);
    return { outcome: 'exists', uid: ownDoc.id, loginEmail: String(ownDoc.data()['loginEmail']), loginId: String(ownDoc.data()['loginId'] ?? '') };
  }
  if (ownDoc && ownAction === 'resume') {
    return resumeAccount(ownDoc.ref, ownDoc.data() as UserModel, firstName, lastName, synthetic);
  }

  // Resolved before anything is written: a tenant without an appDomain cannot build a
  // synthetic login address, and failing here leaves no half-opened account behind.
  const appDomain = identity === 'synthetic' ? await tenantAppDomain(tenantId) : '';
  let uid: string;
  // a synthetic account never carries the other person's address, not even for a moment
  const authEmail = identity === 'synthetic' ? '' : favEmail;
  if (identity === 'reuse') {
    uid = authUid as string;
  } else if (identity === 'createReal') {
    uid = (await getAuth().createUser({ email: favEmail, password: randomPassword(), displayName })).uid;
  } else {
    // 'synthetic': the email belongs to someone else. Pick the uid now, allocate the Benutzername on
    // that users doc, and only then create the Auth user with the synthetic address built from it.
    uid = db.collection('users').doc().id;
  }
  // a real-email identity says whose it is — decideLoginIdentity never hands it to anyone else
  if (identity !== 'synthetic') await stampPersonKey(uid, personKey);

  // 4. the user document. Built from `new UserModel(tenantId)` rather than a hand-written
  //    field list, so every default (settings, delivery prefs and especially the usage*
  //    privacy flags) is materialized. Firestore reads do NOT apply model defaults — a
  //    field missing from the document reads back as undefined, so a partially written
  //    user would have undefined privacy flags instead of PrivacyUsage.Restricted.
  const userRef = db.collection('users').doc(uid);
  const user = new UserModel(tenantId);
  user.okey = uid;
  user.loginEmail = authEmail;
  user.personKey = personKey;
  user.firstName = firstName;
  user.lastName = lastName;
  user.roles = { registered: true };
  user.index = getUserIndex(user);
  await userRef.set({ ...user });

  // 5. the Benutzername — every user gets one (spec decision 2). allocateLoginId reads the
  //    users doc inside its transaction, which is why the doc is written first.
  if (identity === 'synthetic') {
    let loginId: string;
    try {
      loginId = await allocateLoginId(userRef, tenantId, firstName, lastName);
    } catch (error) {
      await userRef.delete(); // the doc has no Auth identity yet — never leave it behind
      throw error;
    }
    const email = syntheticLoginEmail(loginId, appDomain);
    try {
      await getAuth().createUser({ uid, email, password: randomPassword(), displayName });
    } catch (error) {
      await userRef.delete(); // no users doc without its Auth identity
      throw error;
    }
    await stampPersonKeyBestEffort(uid, personKey);
    return finishSyntheticAccount(userRef, user, uid, loginId, email, synthetic);
  }

  // A real account is complete without its Benutzername: the Auth identity and the users doc
  // exist, and the daily backfill (assignMissingLoginIds) assigns the loginId later.
  let loginId = '';
  try {
    loginId = await allocateLoginId(userRef, tenantId, firstName, lastName);
    await userRef.update({ index: getUserIndex({ ...user, loginId }) });
  } catch (error) {
    logger.error(`${CF_NAME}: users/${uid} opened without a Benutzername — the daily backfill assigns it`, error);
  }
  logger.info(`${CF_NAME}: opened account users/${uid} for person ${personKey} (${tenantId})`);
  await logActivity(tenantId, 'create', { personKey, uid, loginId });
  return { outcome: 'created', uid, loginEmail: authEmail, loginId };
}

/** Who a Benutzername account is reported as being opened for, and whose email it could not use. */
interface SyntheticContext {
  readonly tenantId: string;
  readonly personKey: string;
  readonly displayName: string;
  readonly emailHeldBy: string | undefined;
  readonly emailOwnerPersonKey: string | undefined;
}

/**
 * Stamp `okrPersonKey` on an Auth identity, merged into whatever claims it already carries
 * (there are none in the project today — merged anyway, so a future claim is never wiped).
 */
async function stampPersonKey(uid: string, personKey: string): Promise<void> {
  const claims = (await getAuth().getUser(uid)).customClaims ?? {};
  if (claims[PERSON_KEY_CLAIM] === personKey) return;
  await getAuth().setCustomUserClaims(uid, { ...claims, [PERSON_KEY_CLAIM]: personKey });
}

/**
 * The stamp on a SYNTHETIC identity is informational: no favourite email ever resolves to a
 * `…@login.<domain>` address, so decideLoginIdentity never meets it. Failing to set it must not
 * undo an account whose Auth user already exists.
 */
async function stampPersonKeyBestEffort(uid: string, personKey: string): Promise<void> {
  try {
    await stampPersonKey(uid, personKey);
  } catch (error) {
    logger.error(`${CF_NAME}: could not stamp ${PERSON_KEY_CLAIM} on ${uid}`, error);
  }
}

/** The last step of a Benutzername account: the doc learns its login address, then report it. */
async function finishSyntheticAccount(
  userRef: DocumentReference,
  user: UserModel,
  uid: string,
  loginId: string,
  loginEmail: string,
  ctx: SyntheticContext,
): Promise<OpenAccountResult> {
  await userRef.update({ loginEmail, index: getUserIndex({ ...user, loginEmail, loginId }) });
  logger.info(`${CF_NAME}: opened account users/${uid} with a Benutzername for person ${ctx.personKey} (${ctx.tenantId}) — email held by users/${ctx.emailHeldBy}`);
  await logActivity(ctx.tenantId, 'create', { personKey: ctx.personKey, uid, loginId, emailHeldBy: ctx.emailHeldBy });
  await runWorkflow({
    tenantId: ctx.tenantId,
    event: 'account.createdWithLoginId',
    personKey: ctx.personKey,
    relatedKey: `user.${uid}`,
    subjectName: ctx.displayName,
    today: getTodayStr(DateFormat.StoreDate),
    params: { loginId, emailOwnerPersonKey: ctx.emailOwnerPersonKey ?? '' },
  });
  return { outcome: 'createdWithLoginId', uid, loginEmail, loginId, emailOwnerPersonKey: ctx.emailOwnerPersonKey };
}

/**
 * Finish an account whose users doc exists with an empty loginEmail — a Benutzername open that
 * died between writing the doc and completing the Auth side. Behind the guard in openAccount it
 * would otherwise stay half-open for good.
 *
 * An Auth user that already exists under this uid keeps its email (the synthetic one, if
 * createUser succeeded before the crash; a real one on a legacy doc, which then reports
 * 'exists'). A missing one is created with the synthetic address.
 */
async function resumeAccount(
  userRef: DocumentReference,
  user: UserModel,
  firstName: string,
  lastName: string,
  ctx: SyntheticContext,
): Promise<OpenAccountResult> {
  const uid = userRef.id;
  const loginId = String(user.loginId ?? '') || await allocateLoginId(userRef, ctx.tenantId, firstName, lastName);
  let authEmail: string;
  try {
    authEmail = (await getAuth().getUser(uid)).email ?? '';
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
    authEmail = syntheticLoginEmail(loginId, await tenantAppDomain(ctx.tenantId));
    await getAuth().createUser({ uid, email: authEmail, password: randomPassword(), displayName: ctx.displayName });
  }
  if (!authEmail) {
    authEmail = syntheticLoginEmail(loginId, await tenantAppDomain(ctx.tenantId));
    await getAuth().updateUser(uid, { email: authEmail });
  }
  await stampPersonKeyBestEffort(uid, ctx.personKey);
  if (isSyntheticLoginEmail(authEmail)) {
    logger.info(`${CF_NAME}: resumed the half-open account users/${uid} of person ${ctx.personKey}`);
    return finishSyntheticAccount(userRef, user, uid, loginId, authEmail, ctx);
  }
  await userRef.update({ loginEmail: authEmail, index: getUserIndex({ ...user, loginEmail: authEmail, loginId }) });
  logger.info(`${CF_NAME}: users/${uid} of person ${ctx.personKey} had no loginEmail — restored from its Auth identity`);
  return { outcome: 'exists', uid, loginEmail: authEmail, loginId };
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
  const abbrs = relLogAbbrs(m);
  await runWorkflow({
    tenantId,
    event,
    personKey: m.memberKey,
    relatedKey: `membership.${membershipId}`,
    subjectName: `${m.memberName1 ?? ''} ${m.memberName2 ?? ''}`.trim(),
    today,
    params: {
      // {category}/{fromCategory} are the ABBREVIATIONS — that is what the live i18n rows
      // of the seeded rules render, and renaming them would silently change task wording.
      category: abbrs.at(-1) ?? '',
      fromCategory: abbrs.length > 1 ? (abbrs.at(-2) ?? '') : '',
      // the raw category, which is what `categoryIs` compares ('passive', 'active', …)
      membershipCategory: m.category ?? '',
    },
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
      if (action === 'open') {
        // A successor membership (relLog with a history) is a category change, not an
        // entry — the UI never edits `category` in place, it ends one document and
        // creates the next, so this is the ONLY write a categoryChanged rule can see.
        const isSuccessor = relLogAbbrs(after).length > 1;
        await emitMembershipEvent(
          isSuccessor ? 'membership.categoryChanged' : 'membership.created',
          after ?? before, membershipId, tenantId, today,
        );
      }
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
        if (m.relIsLast === false) continue;        // superseded by a category change, not an exit
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
    // an admin acts inside their own tenant only — never on the tenant named by the request
    if (tenantId !== (await getCallerTenantId(request as never, 'syncPersonAccount'))) {
      throw new HttpsError('permission-denied', 'Dieser Mandant gehört nicht zu deinem Konto.');
    }
    if (action !== 'open' && action !== 'close') {
      throw new HttpsError('invalid-argument', "action must be 'open' or 'close'");
    }

    // 'open' hands back openAccount's outcome so the admin UI can say what happened
    // (created / createdWithLoginId + Benutzername / exists / noEmail). Old clients read only `ok`.
    if (action === 'open') return { ok: true, ...(await openAccount(personKey, tenantId)) };
    await closeAccount(personKey, tenantId);
    return { ok: true };
  }
);
