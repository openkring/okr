// apps/functions/src/auth/login-id.ts
//
// The Benutzername (spec 2026-09-30-login-id-spec.md). The functions are its ONLY writer — firestore.rules
// refuses a client that changes users/{uid}.loginId — so uniqueness per tenant is decided here and
// nowhere else.

import { getFirestore, DocumentReference, DocumentData } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { nextFreeLoginId, normalizeLoginIdInput, proposeLoginIdBase } from '@okr/user-util';

const CF_NAME = 'loginId';

export async function tenantAppDomain(tenantId: string): Promise<string> {
  const snap = await getFirestore().collection('app-config').doc(tenantId).get();
  const appDomain = String(snap.data()?.['appDomain'] ?? '').trim();
  if (!appDomain) throw new Error(`app-config/${tenantId} has no appDomain — cannot build a login address`);
  return appDomain;
}

/** All users of a tenant holding exactly this Benutzername — normally one or none. */
async function usersWithLoginId(tenantId: string, loginId: string) {
  const snap = await getFirestore().collection('users').where('loginId', '==', loginId).get();
  return snap.docs.filter((d) => ((d.data()['tenants'] as string[] | undefined) ?? []).includes(tenantId));
}

export async function findUserByLoginId(tenantId: string, rawLoginId: string): Promise<{ uid: string; data: DocumentData } | undefined> {
  const loginId = normalizeLoginIdInput(rawLoginId);
  if (!loginId) return undefined;
  const docs = await usersWithLoginId(tenantId, loginId);
  if (docs.length > 1) logger.error(`${CF_NAME}: ${docs.length} users share one Benutzername in ${tenantId}`, { uids: docs.map((d) => d.id) });
  return docs[0] ? { uid: docs[0].id, data: docs[0].data() } : undefined;
}

/**
 * Give a user a Benutzername unless it already has one ("assigned once, never re-derived", spec §3).
 *
 * The candidate set is read by prefix, then re-checked inside a transaction on the user doc. Two
 * concurrent allocations of the SAME name in the same tenant can still both pass (a transaction cannot
 * lock the absence of a query result); findUserByLoginId logs that case loudly, and it needs two people
 * with the same name opened within the same second.
 */
export async function allocateLoginId(userRef: DocumentReference, tenantId: string, firstName: string, lastName: string): Promise<string> {
  const db = getFirestore();
  const base = proposeLoginIdBase(firstName, lastName);
  const prefixSnap = await db.collection('users')
    .where('loginId', '>=', base).where('loginId', '<=', base + '').get();
  const taken = new Set(prefixSnap.docs
    .filter((d) => ((d.data()['tenants'] as string[] | undefined) ?? []).includes(tenantId))
    .map((d) => String(d.data()['loginId'] ?? '')));

  return db.runTransaction(async (tx) => {
    const current = await tx.get(userRef);
    const existing = String(current.data()?.['loginId'] ?? '');
    if (existing) return existing;
    let candidate = nextFreeLoginId(base, taken);
    while ((await usersWithLoginId(tenantId, candidate)).length > 0) {
      taken.add(candidate);
      candidate = nextFreeLoginId(base, taken);
    }
    tx.update(userRef, { loginId: candidate });
    return candidate;
  });
}

/**
 * Daily backfill (plan D4): every user without a Benutzername gets one. Idempotent; after the first run
 * it touches nothing. Also heals users created by any path that bypasses openAccount.
 */
export const assignMissingLoginIds = onSchedule(
  { schedule: '45 3 * * *', timeZone: 'Europe/Zurich', region: 'europe-west6' },
  async () => {
    const snap = await getFirestore().collection('users').get();
    let assigned = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data['loginId']) continue;
      const tenantId = ((data['tenants'] as string[] | undefined) ?? [])[0];
      if (!tenantId) continue;
      try {
        await allocateLoginId(doc.ref, tenantId, String(data['firstName'] ?? ''), String(data['lastName'] ?? ''));
        assigned++;
      } catch (error) {
        logger.error(`${CF_NAME}: could not assign a Benutzername to users/${doc.id}`, error);
      }
    }
    logger.info(`${CF_NAME}: ${assigned} of ${snap.size} users got a Benutzername`);
  },
);
