// apps/functions/src/pingen/submit-sending.ts
//
// Trigger + production wiring of the Pingen submit (spec 1.150). The logic is in submit-sending.logic.ts.

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { SendingCollection, type AvatarInfo, type SendingCost } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { privateBucket } from '../_storage/private-bucket';
import { createFirestoreDeps } from '../workflow/firestore-deps';
import { getCreditPort } from './credit-port';
import { makePingenClient, PINGEN_ENV, pingenClientId, pingenClientSecret, pingenOrganisationId, type PingenClient } from './pingen-client';
import { submitSending, type SendingMailing, type SendingRow, type SubmitDeps } from './submit-sending.logic';

export { failSending } from './submit-sending.logic';
export type { SubmitDeps } from './submit-sending.logic';

const REGION = 'europe-west6';

let client: PingenClient | undefined;
function pingenClient(): PingenClient {
  client ??= makePingenClient({
    fetch, now: () => Date.now(), clientId: pingenClientId.value(), clientSecret: pingenClientSecret.value(),
    organisationId: pingenOrganisationId.value(), env: PINGEN_ENV,
  });
  return client;
}

/** The production wiring: Pingen, the private bucket, `sendings`, `mailings`, tasks, the credit port. */
export function submitDeps(): SubmitDeps {
  return {
    client: pingenClient(),
    env: PINGEN_ENV,
    ...sendingDeps(),
  };
}

/** Everything but the Pingen client and env: the webhook handler (Task 9) needs no Pingen credentials. */
export function sendingDeps(): Omit<SubmitDeps, 'client' | 'env'> {
  const db = getFirestore();
  const col = () => db.collection(SendingCollection);
  const tasks = createFirestoreDeps();
  const row = (d: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): SendingRow => ({ ...(d.data() as Omit<SendingRow, 'id'>), id: d.id });
  return {
    readPdf: async (path) => (await privateBucket().file(path).download())[0],
    getSending: async (id) => { const s = await col().doc(id).get(); return s.exists ? row(s) : undefined; },
    updateSending: async (id, patch, expectState) => {
      const { id: _id, ...data } = patch as Partial<SendingRow>;
      void _id;
      return db.runTransaction(async (tx) => {
        const ref = col().doc(id);
        const snap = await tx.get(ref);
        if (!snap.exists || (expectState && snap.data()?.['state'] !== expectState)) return false;
        tx.update(ref, data);
        return true;
      });
    },
    writeCost: async (id, cost: SendingCost) => { await col().doc(id).collection('private').doc('cost').set(cost); },
    setProviderId: (id, providerId) => db.runTransaction(async (tx) => {
      const ref = col().doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data()?.['state'] === 'failed') return false;
      tx.update(ref, { providerId });
      return true;
    }),
    closeOpenTask: async (relatedKey, tenantId) => {
      const snap = await db.collection('tasks').where('relatedKey', '==', relatedKey).get();
      for (const d of snap.docs) {
        const t = d.data();
        if (t['isArchived'] || t['state'] === 'done' || (t['completionDate'] ?? '') !== '' || !((t['tenants'] as string[]) ?? []).includes(tenantId)) continue;
        await d.ref.update({ state: 'done', completionDate: getTodayStr(DateFormat.StoreDate) });
      }
    },
    loadMailing: async (source, tenantId): Promise<SendingMailing | undefined> => {
      if (!source.startsWith('mailing.')) return undefined;
      const snap = await db.collection('mailings').doc(source.slice('mailing.'.length)).get();
      const m = snap.data() as { tenants?: string[]; senderKey?: string; senderName?: string; subject?: string; post?: { creditEntryId: string; pages: number; letters: number } } | undefined;
      if (!m?.post || !(m.tenants ?? []).includes(tenantId)) return undefined;
      return {
        senderKey: m.senderKey ?? '', senderName: m.senderName ?? '', subject: m.subject ?? '',
        creditEntryId: m.post.creditEntryId, pagesPerLetter: m.post.letters > 0 ? m.post.pages / m.post.letters : 0,
      };
    },
    countAddressFailures: async (source) => (await col().where('source', '==', source).where('state', '==', 'failed').where('failReason', '==', 'address').count().get()).data().count,
    listQueued: async (source) => (await col().where('source', '==', source).where('state', '==', 'queued').get()).docs.map(row),
    avatar: async (personKey, tenantId, fallbackName): Promise<AvatarInfo> => {
      const fallback: AvatarInfo = { key: personKey, name1: fallbackName, name2: '', modelType: 'person', type: '', subType: '', label: '' };
      if (!personKey) return fallback;
      return (await tasks.avatarFor(personKey, tenantId)) ?? fallback;
    },
    hasOpenTask: (relatedKey, assigneeKey, tenantId) => tasks.hasOpenTask(relatedKey, assigneeKey, tenantId),
    createTask: (t) => tasks.createTask(t),
    reverseShare: (tenantId, entryId, part, key, reason) => getCreditPort().reverseShare(tenantId, entryId, part, key, reason),
    now: () => new Date(),
  };
}

/**
 * Hands each new queued `sendings` record to Pingen. `retry: true`: a retryable Pingen error or a Storage failure
 * rethrows and the same record is submitted again with the same Idempotency-Key. 4 instances x ~1 letter/s stays
 * far below Pingen's 300 requests/minute.
 */
export const onSendingCreated = onDocumentCreated(
  {
    document: `${SendingCollection}/{id}`, region: REGION, retry: true, maxInstances: 4, concurrency: 1,
    secrets: [pingenClientId, pingenClientSecret, pingenOrganisationId],
  },
  async (event) => {
    await submitSending(submitDeps(), event.params['id']);
  },
);
