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
 * The candidate set is read by prefix outside the transaction (cheap, approximate), then every
 * candidate is re-checked for the exact tenant INSIDE the transaction via `tx.get(query)`, so the
 * transaction's read set includes those query results and Firestore aborts/retries it if a
 * concurrent write changes them before commit. The remaining gap: a transaction cannot lock the
 * absence of a document that does not exist yet, so two allocations of a brand-new candidate that
 * both start before either commits can still both pass — it needs two people with the same name
 * opened within the same second, and findUserByLoginId logs that case loudly.
 */
export async function allocateLoginId(userRef: DocumentReference, tenantId: string, firstName: string, lastName: string): Promise<string> {
  const db = getFirestore();
  const base = proposeLoginIdBase(firstName, lastName);
  // '\uf8ff' is the highest code point in the Unicode private-use area — the standard
  // Firestore idiom for a string-prefix range's upper bound.
  const prefixSnap = await db.collection('users')
    .where('loginId', '>=', base).where('loginId', '<=', base + '\uf8ff').get();
  const taken = new Set(prefixSnap.docs
    .filter((d) => ((d.data()['tenants'] as string[] | undefined) ?? []).includes(tenantId))
    .map((d) => String(d.data()['loginId'] ?? '')));

  return db.runTransaction(async (tx) => {
    const current = await tx.get(userRef);
    const existing = String(current.data()?.['loginId'] ?? '');
    if (existing) return existing;
    let candidate = nextFreeLoginId(base, taken);
    // All reads (including this loop's tx.get) happen before the tx.update below —
    // Firestore transactions require every read to happen before the first write.
    for (;;) {
      const candidateSnap = await tx.get(db.collection('users').where('loginId', '==', candidate));
      const inTenant = candidateSnap.docs.some((d) => ((d.data()['tenants'] as string[] | undefined) ?? []).includes(tenantId));
      if (!inTenant) break;
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
