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

import { checkAdminRole, checkAppCheckToken, getCallerTenantId } from '@okr/shared-util-functions';
import { isSyntheticLoginEmail, isValidLoginId, normalizeLoginIdInput, syntheticLoginEmail } from '@okr/user-util';

import { findUserByLoginId, syntheticAddressFree, tenantAppDomain } from './login-id';
import { loadTenantUser, restoreAuthEmail, withIndex } from './tenant-user';

const REGION = 'europe-west6';
const LOGIN_ID_TAKEN = 'Diesen Benutzernamen gibt es schon.';

/** Firebase refused an Auth email because another identity has it (a race past the Auth check). */
function isEmailTaken(error: unknown): boolean {
  return (error as { code?: string })?.code === 'auth/email-already-exists';
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
  const appDomain = await tenantAppDomain(tenantId);
  const holderSynthetic = syntheticLoginEmail(holderLoginId, appDomain);
  // an account closed earlier may still hold that address in Auth — createUser/updateUser would fail
  if (!(await syntheticAddressFree(appDomain, String(holder.data()?.['personKey'] ?? ''), holderUid)(holderLoginId))) {
    throw new HttpsError('already-exists', 'Der Benutzername des ersten Kontos ist als Anmelde-Adresse schon vergeben. Gib ihm zuerst einen anderen Benutzernamen.');
  }

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
    if (isEmailTaken(error)) throw new HttpsError('already-exists', 'Eine der Anmelde-Adressen ist schon vergeben.');
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
  if (other && other.uid !== uid) throw new HttpsError('already-exists', LOGIN_ID_TAKEN);
  if (other && other.uid === uid) return { loginId }; // already this user's Benutzername — nothing to change, nobody to sign out

  // Free in Firestore is not enough: an account closed earlier keeps its Auth identity and with it
  // the Benutzername's address. Checked for real-email accounts too — a later swap moves them onto it.
  const appDomain = await tenantAppDomain(tenantId);
  if (!(await syntheticAddressFree(appDomain, String(user.data()?.['personKey'] ?? ''), uid)(loginId))) {
    throw new HttpsError('already-exists', LOGIN_ID_TAKEN);
  }

  const authEmail = (await getAuth().getUser(uid)).email ?? '';
  if (isSyntheticLoginEmail(authEmail)) {
    const loginEmail = syntheticLoginEmail(loginId, appDomain);
    try {
      await getAuth().updateUser(uid, { email: loginEmail }); // signs this user out once
    } catch (error) {
      if (isEmailTaken(error)) throw new HttpsError('already-exists', LOGIN_ID_TAKEN);
      throw error;
    }
    let written = false;
    try {
      written = await writeLoginIdExclusively(user, tenantId, { loginId, loginEmail });
    } catch (error) {
      await restoreAuthEmail(uid, authEmail, CF_NAME); // the write threw — put the old login back, then surface the error
      throw error;
    }
    if (!written) {
      await restoreAuthEmail(uid, authEmail, CF_NAME); // lost the race — restore the old login
      throw new HttpsError('already-exists', LOGIN_ID_TAKEN);
    }
  } else if (!(await writeLoginIdExclusively(user, tenantId, { loginId }))) {
    throw new HttpsError('already-exists', LOGIN_ID_TAKEN);
  }
  logger.info(`${CF_NAME}: users/${uid} has a new Benutzername (${tenantId})`);
  return { loginId };
});
