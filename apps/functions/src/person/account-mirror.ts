// apps/functions/src/person/account-mirror.ts
//
// Mirrors "this person has an app account" from `users` onto the person document
// (planning/specs/2026-09-06-open-events-invitation-model-spec.md, decision 9).
//
// Why the duplication: inviting someone to a calendar event may only ever reach a REGISTERED
// user, but `users/{uid}` is readable only by its owner and by admin/privileged
// (firestore.rules). The people who may invite include group admins and responsible persons
// WITHOUT `privileged`, so the invite picker cannot ask `users` at all. Persons are
// tenant-readable, so the fact travels there — the same reasoning that put the `usage*`
// privacy flags on PersonModel.
//
// This module is the ONLY writer of `persons/{id}.hasAccount`. The app never writes it.

import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';

import { PersonCollection, UserCollection } from '@okr/shared-models';
import { checkAdminRole, checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { nextHasAccount, UserAccountDoc } from './account-mirror.decide';

const REGION = 'europe-west6';
const BATCH = 400;

/**
 * Keep `persons/{id}.hasAccount` in step with the `users` collection.
 *
 * `merge: true` and never a full write: the person document carries the whole PII-adjacent
 * profile, and this trigger knows exactly one field of it.
 */
export const onUserWritten = onDocumentWritten(
  { document: `${UserCollection}/{uid}`, region: REGION },
  async (event) => {
    const before = event.data?.before.data() as UserAccountDoc | undefined;
    const after = event.data?.after.data() as UserAccountDoc | undefined;
    const patches = nextHasAccount(before, after);
    if (patches.length === 0) return;

    const db = getFirestore();
    await Promise.all(patches.map((patch) =>
      db.collection(PersonCollection).doc(patch.personKey)
        .set({ hasAccount: patch.hasAccount }, { merge: true })));
    logger.info(`onUserWritten: ${patches.map((p) => `${p.personKey}=${p.hasAccount}`).join(', ')}`);
  },
);

/**
 * One-off after rolling out `hasAccount`: set the flag on every person who already holds an
 * account, and clear it on everyone else.
 *
 * Admin-only and idempotent. The clearing half matters as much as the setting half — without it
 * a person whose account was closed before the trigger existed would stay invitable forever.
 */
export const backfillHasAccount = onCall(
  { region: REGION, enforceAppCheck: true, timeoutSeconds: 540 },
  async (request): Promise<{ users: number; granted: number; cleared: number }> => {
    checkAppCheckToken(request, 'backfillHasAccount');
    checkAuthentication(request, 'backfillHasAccount');
    await checkAdminRole(request, 'backfillHasAccount');

    const db = getFirestore();
    const users = await db.collection(UserCollection).get();
    const withAccount = new Set(users.docs
      .map((doc) => (doc.data() as UserAccountDoc).personKey ?? '')
      .filter((key) => key.length > 0));

    const persons = await db.collection(PersonCollection).get();
    let granted = 0;
    let cleared = 0;
    let batch = db.batch();
    let pending = 0;

    for (const doc of persons.docs) {
      const desired = withAccount.has(doc.id);
      // `?? false`: every person written before this field exists reads back undefined
      const current = (doc.data() as { hasAccount?: boolean }).hasAccount ?? false;
      if (current === desired) continue;
      batch.set(doc.ref, { hasAccount: desired }, { merge: true });
      desired ? granted++ : cleared++;
      if (++pending >= BATCH) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    }
    if (pending > 0) await batch.commit();

    logger.info(`backfillHasAccount: users=${users.size}, granted=${granted}, cleared=${cleared}`);
    return { users: users.size, granted, cleared };
  },
);
