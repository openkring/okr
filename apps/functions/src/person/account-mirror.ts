// apps/functions/src/person/account-mirror.ts
//
// Mirrors "in which tenants does this person hold an app account" from `users` onto the person
// document (planning/specs/2026-09-06-open-events-invitation-model-spec.md, decision 9).
//
// Why the duplication: inviting someone to a calendar event may only ever reach a REGISTERED user,
// but `users/{uid}` is readable only by its owner and by admin/privileged (firestore.rules). The
// people who may invite include group admins and responsible persons WITHOUT `privileged`, so the
// invite picker cannot ask `users` at all. Persons are tenant-readable, so the fact travels there —
// the same reasoning that put the `usage*` privacy flags on PersonModel.
//
// Why a LIST and not a boolean: a user document belongs to exactly one tenant (UserModel.tenants),
// a person to several. `persons/kaiser` holds seven accounts, one per tenant, each with its own
// login address. A global "has an account" would offer somebody in tenant B whose account lives
// only in A — they could never answer the invitation — and deleting one of seven accounts would
// clear the flag entirely.
//
// This module is the ONLY writer of `persons/{id}.accountTenants`. The app never writes it.

import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';

import { PersonCollection, UserCollection } from '@okr/shared-models';
import { checkAdminRole, checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { accountTenantsOf, affectedPersonKeys, sameTenants, UserAccountDoc } from './account-mirror.decide';

const REGION = 'europe-west6';
const BATCH = 400;

/**
 * Recompute one person's `accountTenants` from every `users` document pointing at them.
 *
 * Deliberately a fresh query rather than a diff of the trigger's before/after: a person may hold
 * several accounts, so the truth is the union over all of them, and a diff would have to guess
 * what the other documents say. The query is tiny (a handful of documents per person) and it makes
 * the write idempotent — re-running it can only produce the same value.
 *
 * Returns true when the person document was actually written.
 */
async function syncPerson(personKey: string): Promise<boolean> {
  const db = getFirestore();
  const [users, person] = await Promise.all([
    db.collection(UserCollection).where('personKey', '==', personKey).get(),
    db.collection(PersonCollection).doc(personKey).get(),
  ]);
  if (!person.exists) {
    logger.warn(`syncPerson: person ${personKey} does not exist (orphaned user document)`);
    return false;
  }
  const desired = accountTenantsOf(users.docs.map((doc) => doc.data() as UserAccountDoc));
  const current = (person.data() as { accountTenants?: string[] }).accountTenants;
  if (sameTenants(current, desired)) return false;

  // merge: the person document carries the whole PII-adjacent profile, this knows one field of it
  await person.ref.set({ accountTenants: desired }, { merge: true });
  return true;
}

/** Keep `persons/{id}.accountTenants` in step with the `users` collection. */
export const onUserWritten = onDocumentWritten(
  { document: `${UserCollection}/{uid}`, region: REGION },
  async (event) => {
    const before = event.data?.before.data() as UserAccountDoc | undefined;
    const after = event.data?.after.data() as UserAccountDoc | undefined;
    const personKeys = affectedPersonKeys(before, after);
    if (personKeys.length === 0) return;

    const written = await Promise.all(personKeys.map((personKey) => syncPerson(personKey)));
    logger.info(`onUserWritten: checked ${personKeys.join(', ')}, wrote ${written.filter(Boolean).length}`);
  },
);

/**
 * One-off after rolling out `accountTenants`: derive the field for every person from the whole
 * `users` collection.
 *
 * Admin-only and idempotent — a person whose value already matches is not written. Runs over ALL
 * tenants on purpose: the field lists the tenants a person holds an account in, so computing it
 * from only one tenant's users would drop the others and make that person un-invitable there.
 */
export const backfillAccountTenants = onCall(
  { region: REGION, enforceAppCheck: true, timeoutSeconds: 540, memory: '512MiB' },
  async (request): Promise<{ users: number; persons: number; written: number }> => {
    checkAppCheckToken(request, 'backfillAccountTenants');
    checkAuthentication(request, 'backfillAccountTenants');
    await checkAdminRole(request, 'backfillAccountTenants');

    const db = getFirestore();
    const users = await db.collection(UserCollection).get();

    // personKey -> the tenants of every account pointing at that person
    const byPerson = new Map<string, UserAccountDoc[]>();
    for (const doc of users.docs) {
      const user = doc.data() as UserAccountDoc;
      const key = user.personKey ?? '';
      if (!key) continue;
      byPerson.set(key, [...(byPerson.get(key) ?? []), user]);
    }

    const persons = await db.collection(PersonCollection).get();
    let written = 0;
    let batch = db.batch();
    let pending = 0;

    for (const doc of persons.docs) {
      const desired = accountTenantsOf(byPerson.get(doc.id) ?? []);
      const current = (doc.data() as { accountTenants?: string[] }).accountTenants;
      if (sameTenants(current, desired)) continue;
      batch.set(doc.ref, { accountTenants: desired }, { merge: true });
      written++;
      if (++pending >= BATCH) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    }
    if (pending > 0) await batch.commit();

    logger.info(`backfillAccountTenants: users=${users.size}, persons=${persons.size}, written=${written}`);
    return { users: users.size, persons: persons.size, written };
  },
);
