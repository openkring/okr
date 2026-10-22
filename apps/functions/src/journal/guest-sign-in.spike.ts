// Spike R5 (travel journal plan 1, spec 1.113 §7): mint a Firebase custom token for a journal guest.
//
// NOT exported from main.ts and refuses to run outside the Functions emulator — it exists only to
// sign a guest into bkg-app in dev and watch what AppStore and the guards do without a users/{uid}
// document. The real `journalGuestSignIn` (plan 6) will look the link code up server-side and add
// App Check, rate limiting and revocation.

import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { JournalCollection, JournalGuest } from '@okr/shared-models';

interface GuestSignInSpikeRequest { journalKey: string; linkCode: string }

export const journalGuestSignInSpike = onCall<GuestSignInSpikeRequest, Promise<{ token: string }>>(
  { region: 'europe-west6' },
  async (request) => {
    if (process.env['FUNCTIONS_EMULATOR'] !== 'true') throw new HttpsError('failed-precondition', 'emulator only');
    const { journalKey, linkCode } = request.data ?? {};
    if (!journalKey || !linkCode) throw new HttpsError('invalid-argument', 'journalKey and linkCode required');

    const journal = (await getFirestore().collection(JournalCollection).doc(journalKey).get()).data();
    const guest = (journal?.['guests'] as JournalGuest[] | undefined)?.find((g) => g.linkCode === linkCode && !g.revokedAt);
    const tenantId = (journal?.['tenants'] as string[] | undefined)?.[0];
    if (!guest || !tenantId) throw new HttpsError('permission-denied', 'unknown or revoked link');

    const personKey = guest.person.key;
    const token = await getAuth().createCustomToken(`jg_${personKey}`, { jg: journalKey, pk: personKey, tid: tenantId });
    return { token };
  },
);
