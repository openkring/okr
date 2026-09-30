// apps/functions/src/auth/login-id-admin.ts
//
// Admin-only changes to the login identity (spec 1.71 §3, §6b). Changing an Auth email is a "major
// account change": Firebase revokes that user's refresh tokens and signs them out on every device.
// The Auth custom claim okrPersonKey (stamped by openAccount) is keyed by uid, not by email, so a
// swap or a new Benutzername leaves it valid — it is deliberately not touched here.

import { getAuth } from 'firebase-admin/auth';
import { DocumentReference, DocumentSnapshot, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';

import { UserModel } from '@okr/shared-models';
import { checkAdminRole, checkAppCheckToken, getCallerTenantId } from '@okr/shared-util-functions';
import { getUserIndex, isSyntheticLoginEmail, isValidLoginId, normalizeLoginIdInput, syntheticLoginEmail } from '@okr/user-util';

import { findUserByLoginId, tenantAppDomain } from './login-id';

const REGION = 'europe-west6';

async function loadTenantUser(uid: string, tenantId: string) {
  const snap = await getFirestore().collection('users').doc(uid).get();
  if (!snap.exists || !((snap.data()?.['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
    throw new HttpsError('not-found', 'Dieses Benutzerkonto gibt es nicht.');
  }
  return snap;
}

type LoginPatch = { loginEmail?: string; loginId?: string };

/** The patch plus the users-doc search index rebuilt from it — the index carries loginEmail and loginId. */
function withIndex(snap: DocumentSnapshot, patch: LoginPatch): LoginPatch & { index: string } {
  return { ...patch, index: getUserIndex({ ...(snap.data() as UserModel), okey: snap.id, ...patch }) };
}

/**
 * Writes the Benutzername inside a transaction that re-reads every holder of it (spec §3: uniqueness
 * is checked in a transaction), so two admins cannot hand out the same one at the same moment.
 * Returns false when another user of the tenant holds it by the time the transaction runs.
 */
async function writeLoginIdExclusively(user: DocumentSnapshot, tenantId: string, patch: { loginId: string; loginEmail?: string }): Promise<boolean> {
  const userRef: DocumentReference = user.ref;
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const holders = await tx.get(db.collection('users').where('loginId', '==', patch.loginId));
    const taken = holders.docs.some((d) => d.id !== userRef.id && ((d.data()['tenants'] as string[] | undefined) ?? []).includes(tenantId));
    if (taken) return false;
    tx.update(userRef, withIndex(user, patch));
    return true;
  });
}

/** Best-effort restore of an Auth email; a failure is logged (uid only) and never hides the caller's error. */
async function restoreAuthEmail(uid: string, email: string, cfName: string): Promise<void> {
  try {
    await getAuth().updateUser(uid, { email });
  } catch (error) {
    logger.error(`${cfName}: could not restore the Auth email of users/${uid}`, { message: error instanceof Error ? error.message : 'unknown' });
  }
}

export const swapLoginEmail = onCall({ region: REGION, enforceAppCheck: true, cors: true }, async (request: CallableRequest<{ holderUid?: string; newcomerUid?: string }>) => {
  const CF_NAME = 'swapLoginEmail';
  checkAppCheckToken(request as never, CF_NAME);
  await checkAdminRole(request as never, CF_NAME);
  const tenantId = await getCallerTenantId(request as never, CF_NAME);
  const holderUid = request.data?.holderUid ?? '';
  const newcomerUid = request.data?.newcomerUid ?? '';
  if (!holderUid || !newcomerUid || holderUid === newcomerUid) throw new HttpsError('invalid-argument', 'Zwei verschiedene Konten angeben.');

  const holder = await loadTenantUser(holderUid, tenantId);
  const newcomer = await loadTenantUser(newcomerUid, tenantId);
  const realEmail = (await getAuth().getUser(holderUid)).email ?? '';
  if (!realEmail || isSyntheticLoginEmail(realEmail)) throw new HttpsError('failed-precondition', 'Das erste Konto hat keine echte E-Mail.');
  const newcomerEmail = (await getAuth().getUser(newcomerUid)).email ?? '';
  if (!isSyntheticLoginEmail(newcomerEmail)) throw new HttpsError('failed-precondition', 'Das zweite Konto ist kein Benutzername-Konto.');

  const holderLoginId = String(holder.data()?.['loginId'] ?? '');
  if (!holderLoginId) throw new HttpsError('failed-precondition', 'Das erste Konto hat noch keinen Benutzernamen.');
  const holderSynthetic = syntheticLoginEmail(holderLoginId, await tenantAppDomain(tenantId));

  // 1. free the real email (signs the holder out once), 2. give it to the newcomer.
  // Every step that completed is recorded so the rollback undoes exactly those — never leaving the real
  // email owned by nobody, or the holder's users doc out of step with its Auth account.
  let holderAuthMoved = false;
  let holderDocMoved = false;
  let newcomerMoved = false;
  try {
    await getAuth().updateUser(holderUid, { email: holderSynthetic });
    holderAuthMoved = true;
    await holder.ref.update(withIndex(holder, { loginEmail: holderSynthetic }));
    holderDocMoved = true;
    await getAuth().updateUser(newcomerUid, { email: realEmail });
    newcomerMoved = true;
    await newcomer.ref.update(withIndex(newcomer, { loginEmail: realEmail }));
  } catch (error) {
    // reverse order; a failing rollback step is logged (uids only) and must not hide the original error
    const undo = async (step: string, uid: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (rollbackError) {
        logger.error(`${CF_NAME}: rollback step ${step} failed for users/${uid} (${tenantId})`, { message: rollbackError instanceof Error ? rollbackError.message : 'unknown' });
      }
    };
    if (newcomerMoved) await undo('newcomerAuth', newcomerUid, () => getAuth().updateUser(newcomerUid, { email: newcomerEmail }));
    if (holderDocMoved) await undo('holderDoc', holderUid, () => holder.ref.update(withIndex(holder, { loginEmail: realEmail })));
    if (holderAuthMoved) await undo('holderAuth', holderUid, () => getAuth().updateUser(holderUid, { email: realEmail }));
    throw error;
  }
  logger.info(`${CF_NAME}: swapped the login email from users/${holderUid} to users/${newcomerUid} (${tenantId})`);
  return { holderLoginId };
});

export const setLoginId = onCall({ region: REGION, enforceAppCheck: true, cors: true }, async (request: CallableRequest<{ uid?: string; loginId?: string }>) => {
  const CF_NAME = 'setLoginId';
  checkAppCheckToken(request as never, CF_NAME);
  await checkAdminRole(request as never, CF_NAME);
  const tenantId = await getCallerTenantId(request as never, CF_NAME);
  const uid = request.data?.uid ?? '';
  const loginId = normalizeLoginIdInput(String(request.data?.loginId ?? ''));
  if (!uid || !isValidLoginId(loginId)) throw new HttpsError('invalid-argument', 'Ungültiger Benutzername.');

  const user = await loadTenantUser(uid, tenantId);
  const other = await findUserByLoginId(tenantId, loginId);
  if (other && other.uid !== uid) throw new HttpsError('already-exists', 'Diesen Benutzernamen gibt es schon.');
  if (other && other.uid === uid) return { loginId }; // already this user's Benutzername — nothing to change, nobody to sign out

  const authEmail = (await getAuth().getUser(uid)).email ?? '';
  if (isSyntheticLoginEmail(authEmail)) {
    const loginEmail = syntheticLoginEmail(loginId, await tenantAppDomain(tenantId));
    await getAuth().updateUser(uid, { email: loginEmail }); // signs this user out once
    let written = false;
    try {
      written = await writeLoginIdExclusively(user, tenantId, { loginId, loginEmail });
    } catch (error) {
      await restoreAuthEmail(uid, authEmail, CF_NAME); // the write threw — put the old login back, then surface the error
      throw error;
    }
    if (!written) {
      await restoreAuthEmail(uid, authEmail, CF_NAME); // lost the race — restore the old login
      throw new HttpsError('already-exists', 'Diesen Benutzernamen gibt es schon.');
    }
  } else if (!(await writeLoginIdExclusively(user, tenantId, { loginId }))) {
    throw new HttpsError('already-exists', 'Diesen Benutzernamen gibt es schon.');
  }
  logger.info(`${CF_NAME}: users/${uid} has a new Benutzername (${tenantId})`);
  return { loginId };
});
