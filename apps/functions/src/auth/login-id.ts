// apps/functions/src/auth/login-id.ts
//
// The Benutzername (spec 2026-09-30-login-id-spec.md). The functions are its ONLY writer — firestore.rules
// refuses a client that changes users/{uid}.loginId — so uniqueness per tenant is decided here and
// nowhere else.

import { getAuth } from 'firebase-admin/auth';
import { getFirestore, DocumentReference, DocumentData } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { UserModel } from '@okr/shared-models';
import { getUserIndex, nextFreeLoginId, normalizeLoginIdInput, proposeLoginIdBase, syntheticLoginEmail } from '@okr/user-util';

import { decideSyntheticCandidate, PERSON_KEY_CLAIM, personKeyStampsDue, SyntheticCandidate } from './login-id.decide';

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

/** What Auth says about a Benutzername candidate, plus the uid holding its synthetic address (if any). */
export interface SyntheticCandidateStatus {
  readonly verdict: SyntheticCandidate;
  readonly uid?: string;
}

/**
 * Looks up the Auth identity behind `<candidate>@login.<domain>` and decides whether the candidate
 * can go to `personKey` (decideSyntheticCandidate). Needed because Firestore alone is not the whole
 * truth: closeAccount deletes users/{uid} but keeps the Auth identity, synthetic address included.
 */
export async function syntheticCandidateStatus(candidate: string, appDomain: string, personKey: string, selfUid?: string): Promise<SyntheticCandidateStatus> {
  let uid: string;
  let claimPersonKey: string | undefined;
  try {
    const record = await getAuth().getUserByEmail(syntheticLoginEmail(candidate, appDomain));
    uid = record.uid;
    claimPersonKey = record.customClaims?.[PERSON_KEY_CLAIM] as string | undefined;
  } catch (error) {
    if ((error as { code?: string }).code === 'auth/user-not-found') return { verdict: 'free' };
    throw error;
  }
  const hasUserDoc = (await getFirestore().collection('users').doc(uid).get()).exists;
  return { verdict: decideSyntheticCandidate({ uid, claimPersonKey, hasUserDoc }, personKey, selfUid), uid };
}

/** An extra, asynchronous say on a candidate that Firestore found free in the tenant. */
export type LoginIdCheck = (candidate: string) => Promise<boolean>;

/**
 * For a caller whose uid is fixed (resume, setLoginId, swap): a candidate is usable only when its
 * synthetic address is free in Auth or already this uid's own. 'reclaim' counts as taken — a fixed
 * uid cannot move to another identity.
 */
export function syntheticAddressFree(appDomain: string, personKey: string, selfUid: string): LoginIdCheck {
  return async (candidate) => (await syntheticCandidateStatus(candidate, appDomain, personKey, selfUid)).verdict === 'free';
}

/**
 * Give a user a Benutzername unless it already has one ("assigned once, never re-derived", spec §3).
 * Writes the rebuilt search `index` together with it, so the user is found by Benutzername at once.
 *
 * The candidate set is read by prefix outside the transaction (cheap, approximate), then every
 * candidate is re-checked for the exact tenant INSIDE the transaction via `tx.get(query)`, so the
 * transaction's read set includes those query results and Firestore aborts/retries it if a
 * concurrent write changes them before commit. The remaining gap: a transaction cannot lock the
 * absence of a document that does not exist yet, so two allocations of a brand-new candidate that
 * both start before either commits can still both pass — it needs two people with the same name
 * opened within the same second, and findUserByLoginId logs that case loudly.
 *
 * @param accept  optional extra check for a candidate that is free in Firestore — the synthetic
 *                paths pass the Auth check here, so a Benutzername whose `…@login.<domain>` address
 *                an orphaned identity still holds is skipped like a Firestore collision.
 */
export async function allocateLoginId(
  userRef: DocumentReference,
  tenantId: string,
  firstName: string,
  lastName: string,
  accept?: LoginIdCheck,
): Promise<string> {
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
      if (!inTenant && (!accept || await accept(candidate))) break;
      taken.add(candidate);
      candidate = nextFreeLoginId(base, taken);
    }
    const index = getUserIndex({ ...(current.data() as UserModel), okey: userRef.id, loginId: candidate });
    tx.update(userRef, { loginId: candidate, index });
    return candidate;
  });
}

/**
 * Stamp `okrPersonKey` on an Auth identity, merged into whatever claims it already carries
 * (there are none in the project today — merged anyway, so a future claim is never wiped).
 * @param knownClaims  the identity's current claims when the caller already read them
 */
export async function stampPersonKey(uid: string, personKey: string, knownClaims?: Record<string, unknown>): Promise<void> {
  const claims = knownClaims ?? (await getAuth().getUser(uid)).customClaims ?? {};
  if (claims[PERSON_KEY_CLAIM] === personKey) return;
  await getAuth().setCustomUserClaims(uid, { ...claims, [PERSON_KEY_CLAIM]: personKey });
}

/** uid → custom claims of every Auth identity (one listUsers page per 1000, no per-user reads). */
async function allCustomClaims(): Promise<Map<string, Record<string, unknown> | undefined>> {
  const claims = new Map<string, Record<string, unknown> | undefined>();
  let pageToken: string | undefined;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    for (const u of page.users) claims.set(u.uid, u.customClaims);
    pageToken = page.pageToken;
  } while (pageToken);
  return claims;
}

/**
 * Daily backfill (plan D4), idempotent — after the first run it touches nothing. Also heals users
 * created by any path that bypasses openAccount:
 * - every user without a Benutzername gets one (and the search index that carries it);
 * - every live account whose Auth identity lacks the `okrPersonKey` claim gets it. Accounts older
 *   than the claim never pass through openAccount; once closed, an unstamped identity would be
 *   'reuse'd for a different person sharing its email (spec §5.3). Best effort per account.
 */
export const assignMissingLoginIds = onSchedule(
  { schedule: '45 3 * * *', timeZone: 'Europe/Zurich', region: 'europe-west6', timeoutSeconds: 540 },
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
        logger.error(`${CF_NAME}: could not assign a Benutzername to users/${doc.id}`, { message: error instanceof Error ? error.message : 'unknown' });
      }
    }
    logger.info(`${CF_NAME}: ${assigned} of ${snap.size} users got a Benutzername`);

    const due = personKeyStampsDue(
      snap.docs.map((d) => ({ uid: d.id, personKey: String(d.data()['personKey'] ?? '') })),
      await allCustomClaims(),
    );
    let stamped = 0;
    for (const { uid, personKey, claims } of due) {
      try {
        await stampPersonKey(uid, personKey, claims);
        stamped++;
      } catch (error) {
        logger.error(`${CF_NAME}: could not stamp ${PERSON_KEY_CLAIM} on users/${uid}`, { message: error instanceof Error ? error.message : 'unknown' });
      }
    }
    logger.info(`${CF_NAME}: ${stamped} of ${due.length} accounts got their ${PERSON_KEY_CLAIM} claim`);
  },
);
