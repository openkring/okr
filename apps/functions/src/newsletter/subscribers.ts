// apps/functions/src/newsletter/subscribers.ts
//
// The active subscribers of a newsletter group (spec 1.169 §5.6). One query and one test, shared by
// `sendMailing` (who may receive) and `getMailingRecipients` (whom the Zustellung table offers), so the
// table never offers a person the send would refuse.

import type { Firestore } from 'firebase-admin/firestore';
import { NewsletterSubscriptionCollection } from '@okr/shared-models';

import { isActiveSubscription } from './tenant-link.logic';

/** The person keys with an active subscription to `groupKey` in `tenantId`. */
export async function activeSubscriberKeys(db: Firestore, tenantId: string, groupKey: string): Promise<Set<string>> {
  const snap = await db.collection(NewsletterSubscriptionCollection)
    .where('tenants', 'array-contains', tenantId)
    .where('groupKey', '==', groupKey)
    .get();
  return new Set(snap.docs.map((d) => d.data()).filter((sub) => isActiveSubscription(sub)).map((sub) => String(sub['personKey'] ?? '')).filter(Boolean));
}
