// apps/functions/src/pingen/reconcile.ts
//
// Production wiring of the nightly Postversand reconcile (spec 1.150). The logic is in reconcile.logic.ts; the job
// runs as one step of nightlyMaintenance (the Pingen secrets are on that scheduler).

import './credit-binding'; // binds the credit port to the 1.149 ledger (side effect), as the fan-out and submit triggers need
import { getFirestore } from 'firebase-admin/firestore';
import { SendingCollection } from '@okr/shared-models';
import { postFanOutDeps } from '../email/mailing-sendings';
import { reconcilePostVersand, type ReconcileDeps, type ReconMailing } from './reconcile.logic';
import { submitDeps } from './submit-sending';
import type { SendingRow } from './submit-sending.logic';
import type { MailingPost } from './post-order';

export function reconcileDeps(): ReconcileDeps {
  const db = getFirestore();
  const col = () => db.collection(SendingCollection);
  return {
    ...submitDeps(),
    fanOut: postFanOutDeps(),
    listPostMailings: async (since, before, limit): Promise<ReconMailing[]> => {
      // a single-field range on `post.acceptedAt` (StoreDateTime, as sendMailing writes it): needs no composite index;
      // the rest is filtered here
      const snap = await db.collection('mailings').where('post.acceptedAt', '>=', since).where('post.acceptedAt', '<=', before).limit(limit).get();
      const out: ReconMailing[] = [];
      for (const d of snap.docs) {
        const m = d.data() as { tenants?: string[]; senderKey?: string; senderName?: string; subject?: string; post?: MailingPost };
        const tenantId = m.tenants?.[0];
        if (!tenantId || m.post?.via !== 'pingen' || !(m.post.letters > 0)) continue;
        out.push({ id: d.id, tenantId, senderKey: m.senderKey ?? '', senderName: m.senderName ?? '', subject: m.subject ?? '', post: m.post });
      }
      return out;
    },
    listSendingIds: async (source) => (await col().where('source', '==', source).select().get()).docs.map((d) => d.id),
    listByState: async (state, limit) =>
      (await col().where('state', '==', state).limit(limit).get()).docs.map((d) => ({ ...(d.data() as Omit<SendingRow, 'id'>), id: d.id })),
    hasAnyTask: async (relatedKey, tenantId) => {
      const snap = await db.collection('tasks').where('relatedKey', '==', relatedKey).get();
      return snap.docs.some((d) => ((d.get('tenants') as string[] | undefined) ?? []).includes(tenantId));
    },
  };
}

/** Nightly job: one reconcile run, counts logged by the logic. */
export async function runPostReconcile(): Promise<void> {
  await reconcilePostVersand(reconcileDeps());
}
